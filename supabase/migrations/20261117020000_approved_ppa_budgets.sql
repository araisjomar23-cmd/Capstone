-- Published approvals are immutable budget snapshots, separate from actual spending.
create table public.ppa_budget_lines (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.ppa_proposals(id),
  activity_id uuid not null references public.legacy_activities(id)
);
create table public.ppa_budget_versions (
  id uuid primary key references public.ppa_publications(id),
  proposal_id uuid not null references public.ppa_proposals(id),
  activity_id uuid not null references public.legacy_activities(id),
  revision integer not null, document_version integer not null,
  allocation numeric not null check(allocation >= 0),
  published_at timestamptz not null,
  unique(proposal_id,revision)
);
create table public.ppa_budget_items (
  publication_id uuid not null references public.ppa_budget_versions(id),
  line_id uuid not null references public.ppa_budget_lines(id),
  position integer not null,
  description text not null,
  quantity numeric not null check(quantity > 0),
  unit_cost numeric not null check(unit_cost >= 0),
  primary key(publication_id,line_id)
);
create index ppa_budget_versions_activity on public.ppa_budget_versions(activity_id,revision desc);
alter table public.budget_entries add column approved_budget_item_id uuid references public.ppa_budget_lines(id);
alter table public.budget_entries add column unplanned_reason text not null default '';
create index budget_entries_approved_item on public.budget_entries(approved_budget_item_id) where approved_budget_item_id is not null;

alter table public.ppa_budget_lines enable row level security;
alter table public.ppa_budget_versions enable row level security;
alter table public.ppa_budget_items enable row level security;
create policy "Admins read approved budget lines" on public.ppa_budget_lines for select to authenticated using((select public.is_legacy_admin()));
create policy "Admins read approved budget versions" on public.ppa_budget_versions for select to authenticated using((select public.is_legacy_admin()));
create policy "Admins read approved budget items" on public.ppa_budget_items for select to authenticated using((select public.is_legacy_admin()));
revoke all on public.ppa_budget_lines,public.ppa_budget_versions,public.ppa_budget_items from public,anon,authenticated;
grant select on public.ppa_budget_lines,public.ppa_budget_versions,public.ppa_budget_items to authenticated;

create function public.materialize_ppa_budget(p_publication uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.ppa_publications; v_activity uuid; v_previous uuid; item jsonb; items jsonb:='[]';
  v_line uuid; v_matches integer; v_position integer:=0;
begin
  select * into p from public.ppa_publications where id=p_publication;
  if not found or exists(select 1 from public.ppa_budget_versions where id=p.id) then return; end if;
  select id into v_activity from public.legacy_activities where proposal_id=p.proposal_id;
  if v_activity is null then raise exception 'Published activity is missing.'; end if;
  select id into v_previous from public.ppa_budget_versions where proposal_id=p.proposal_id and revision<p.revision order by revision desc limit 1;
  insert into public.ppa_budget_versions(id,proposal_id,activity_id,revision,document_version,allocation,published_at)
    values(p.id,p.proposal_id,v_activity,p.revision,p.document_version,(p.fields->>'allocation')::numeric,p.published_at);
  for item in select * from jsonb_array_elements(coalesce(p.fields->'budgetItems','[]')) loop
    v_line:=null;
    if coalesce(item->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into v_line from public.ppa_budget_lines where id=(item->>'id')::uuid and proposal_id=p.proposal_id and activity_id=v_activity;
    end if;
    -- Older documents do not carry line IDs. Only an unambiguous name is matched.
    if v_line is null then
      select count(*),(array_agg(line_id))[1] into v_matches,v_line from public.ppa_budget_items
        where publication_id=v_previous and lower(regexp_replace(trim(description),'\s+',' ','g'))=lower(regexp_replace(trim(item->>'description'),'\s+',' ','g'));
      if v_matches<>1 then v_line:=null; end if;
    end if;
    if exists(select 1 from public.ppa_budget_items where publication_id=p.id and line_id=v_line) then v_line:=null; end if;
    if v_line is null then
      insert into public.ppa_budget_lines(proposal_id,activity_id) values(p.proposal_id,v_activity) returning id into v_line;
    end if;
    insert into public.ppa_budget_items(publication_id,line_id,position,description,quantity,unit_cost)
      values(p.id,v_line,v_position,trim(item->>'description'),(item->>'quantity')::numeric,(item->>'unitCost')::numeric);
    items:=items || jsonb_build_array(item || jsonb_build_object('id',v_line));
    v_position:=v_position+1;
  end loop;
  update public.ppa_publications set fields=jsonb_set(fields,'{budgetItems}',items) where id=p.id;
  -- Never overwrite a newer private draft during historical backfill.
  update public.ppa_proposals set fields=jsonb_set(fields,'{budgetItems}',items)
    where id=p.proposal_id and revision=p.revision and document_version=p.document_version;
end; $$;
create function public.capture_published_ppa_budget() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.materialize_ppa_budget(new.id); return new; end; $$;
create trigger ppa_publications_capture_budget after insert on public.ppa_publications
for each row execute function public.capture_published_ppa_budget();
revoke all on function public.materialize_ppa_budget(uuid),public.capture_published_ppa_budget() from public,anon,authenticated;

do $$ declare p record; begin
  for p in select id from public.ppa_publications order by published_at,revision loop
    perform public.materialize_ppa_budget(p.id);
  end loop;
end $$;

create function public.guard_approved_budget_expense() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_proposal uuid; v_current uuid; v_unchanged boolean:=false;
begin
  if new.entry_type<>'expense' then
    if new.approved_budget_item_id is not null or trim(new.unplanned_reason)<>'' then raise exception 'Only actual expenses can reference approved cost items.'; end if;
    return new;
  end if;
  -- Serialize against publication and validate the latest committed approved plan.
  select proposal_id into v_proposal from public.legacy_activities where id=new.activity_id for update;
  if new.approved_budget_item_id is not null then
    if not exists(select 1 from public.ppa_budget_lines where id=new.approved_budget_item_id and activity_id=new.activity_id) then raise exception 'The approved item belongs to another activity or does not exist.'; end if;
    if tg_op='UPDATE' then
      v_unchanged:=old.approved_budget_item_id=new.approved_budget_item_id and old.activity_id=new.activity_id and old.entry_type='expense';
    end if;
    select id into v_current from public.ppa_budget_versions where activity_id=new.activity_id order by revision desc limit 1;
    if not coalesce(v_unchanged,false) and not exists(select 1 from public.ppa_budget_items where publication_id=v_current and line_id=new.approved_budget_item_id) then
      raise exception 'This item is no longer in the current approved budget. Choose a current item or explain an unplanned expense.';
    end if;
    new.unplanned_reason:='';
  elsif v_proposal is not null and length(trim(new.unplanned_reason))<5 then
    raise exception 'Explain why this expense is outside the approved cost breakdown (at least 5 characters).';
  end if;
  if length(new.unplanned_reason)>2000 then raise exception 'Keep the unplanned expense explanation within 2000 characters.'; end if;
  return new;
end; $$;
create trigger budget_entries_validate_approved_item before insert or update on public.budget_entries
for each row execute function public.guard_approved_budget_expense();
revoke all on function public.guard_approved_budget_expense() from public,anon,authenticated;
