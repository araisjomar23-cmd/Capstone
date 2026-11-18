-- Draft proposals never enter legacy_activities until an atomic publication.
create table public.ppa_proposals (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid unique references public.legacy_activities(id),
  state text not null default 'draft' check (state in ('draft','published')),
  fields jsonb not null default '{}', revision integer not null default 1,
  document_version integer not null default 1, published_version integer,
  published_revision integer, created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ppa_documents (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.ppa_proposals(id),
  fingerprint text not null unique check(fingerprint ~ '^[0-9a-f]{64}$'), version integer not null,
  files jsonb not null, extraction jsonb not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  unique(proposal_id,version)
);
create table public.ppa_publications (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.ppa_proposals(id),
  revision integer not null, document_version integer not null, fields jsonb not null,
  published_by uuid not null default auth.uid() references auth.users(id), published_at timestamptz not null default now(),
  unique(proposal_id,revision)
);
alter table public.legacy_activities add column proposal_id uuid unique references public.ppa_proposals(id);
alter table public.legacy_activities add column objectives text[] not null default '{}';
alter table public.budget_entries add column proposal_id uuid references public.ppa_proposals(id);
create unique index ppa_single_allocation on public.budget_entries(proposal_id) where proposal_id is not null and entry_type = 'allocation';

alter table public.ppa_proposals enable row level security;
alter table public.ppa_documents enable row level security;
alter table public.ppa_publications enable row level security;
create policy "Admins read proposals" on public.ppa_proposals for select to authenticated using((select public.is_legacy_admin()));
create policy "Admins read proposal documents" on public.ppa_documents for select to authenticated using((select public.is_legacy_admin()));
create policy "Admins read publication history" on public.ppa_publications for select to authenticated using((select public.is_legacy_admin()));
revoke all on public.ppa_proposals, public.ppa_documents, public.ppa_publications from anon,authenticated;
grant select on public.ppa_proposals, public.ppa_documents, public.ppa_publications to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ppa-documents','ppa-documents',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'])
on conflict(id) do nothing;
create policy "Admins read signed PPA files" on storage.objects for select to authenticated
  using(bucket_id='ppa-documents' and (select public.is_legacy_admin()));
create policy "Admins upload signed PPA files" on storage.objects for insert to authenticated
  with check(bucket_id='ppa-documents' and (select public.is_legacy_admin()) and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Admins clean uncommitted PPA uploads" on storage.objects for delete to authenticated
  using(bucket_id='ppa-documents' and (select public.is_legacy_admin()) and not exists(
    select 1 from public.ppa_documents d, jsonb_array_elements(d.files) f where f->>'path'=name
  ));

create function public.import_ppa_document(p_proposal uuid,p_revision integer,p_fingerprint text,p_files jsonb,p_extraction jsonb,p_fields jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_existing uuid; v_version integer; v_file jsonb; v_bytes bigint:=0; v_count integer;
begin
  if not public.is_legacy_admin() then raise exception 'Administrator access required.'; end if;
  select proposal_id into v_existing from public.ppa_documents where fingerprint=p_fingerprint;
  if found then return v_existing; end if;
  if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 20 then raise exception 'Upload one document or up to 20 photos.'; end if;
  if octet_length(p_extraction::text)>1200000 or octet_length(p_fields::text)>300000 then raise exception 'The proposal exceeds the processing limit.'; end if;
  v_count:=jsonb_array_length(p_files);
  for v_file in select * from jsonb_array_elements(p_files) loop
    if (v_file->>'size')::bigint<=0 or split_part(v_file->>'path','/',1)<>auth.uid()::text
      or not exists(select 1 from storage.objects where bucket_id='ppa-documents' and name=v_file->>'path') then raise exception 'An uploaded source file is missing or invalid.'; end if;
    if coalesce(v_file->>'type','') not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png')
      or (v_count>1 and v_file->>'type' not in ('image/jpeg','image/png')) then raise exception 'Use one DOCX/PDF or a photo set.'; end if;
    v_bytes:=v_bytes+(v_file->>'size')::bigint;
  end loop;
  if v_bytes>20971520 then raise exception 'The combined upload exceeds 20 MB.'; end if;
  if jsonb_array_length(coalesce(p_extraction->'pages','[]'))>20 then raise exception 'A proposal may contain at most 20 pages.'; end if;
  if p_proposal is null then
    insert into public.ppa_proposals(fields) values(p_fields) returning id,document_version into v_id,v_version;
  else
    select id,document_version+1 into v_id,v_version from public.ppa_proposals where id=p_proposal and revision=p_revision for update;
    if not found then raise exception 'This proposal changed. Reload it before replacing the document.'; end if;
    -- Preserve reviewed fields; the replacement extraction is presented separately.
    update public.ppa_proposals set document_version=v_version,revision=revision+1,state='draft',updated_at=now() where id=v_id;
  end if;
  insert into public.ppa_documents(proposal_id,fingerprint,version,files,extraction)
    values(v_id,p_fingerprint,v_version,p_files,p_extraction);
  return v_id;
exception when unique_violation then
  select proposal_id into v_existing from public.ppa_documents where fingerprint=p_fingerprint;
  if v_existing is not null then return v_existing; end if;
  raise;
end; $$;

create function public.save_ppa_draft(p_id uuid,p_revision integer,p_fields jsonb)
returns public.ppa_proposals language plpgsql security definer set search_path='' as $$
declare result public.ppa_proposals;
begin
  if not public.is_legacy_admin() then raise exception 'Administrator access required.'; end if;
  if jsonb_typeof(p_fields)<>'object' or octet_length(p_fields::text)>300000 then raise exception 'Invalid proposal data.'; end if;
  update public.ppa_proposals set fields=p_fields,revision=revision+1,state='draft',updated_at=now()
    where id=p_id and revision=p_revision returning * into result;
  if not found then raise exception 'This proposal changed in another session. Reload before saving.'; end if;
  return result;
end; $$;

create function public.ensure_ppa_program(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; v_name text:=regexp_replace(trim(p_name),'\s+',' ','g'); v_count integer;
begin
  if not public.is_legacy_admin() then raise exception 'Administrator access required.'; end if;
  if length(v_name) not between 1 and 160 then raise exception 'Enter a program name of 1 to 160 characters.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(v_name),0));
  select count(*),(array_agg(id))[1] into v_count,result from public.programs where lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(v_name);
  if v_count>1 then raise exception 'Several programs match this name. Select the intended program.'; end if;
  if v_count=0 then insert into public.programs(name,created_by) values(v_name,auth.uid()) returning id into result; end if;
  return result;
end; $$;

create function public.retry_ppa_extraction(p_id uuid,p_revision integer,p_extraction jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_version integer;
begin
  if not public.is_legacy_admin() then raise exception 'Administrator access required.'; end if;
  if octet_length(p_extraction::text)>1200000 or jsonb_array_length(coalesce(p_extraction->'pages','[]'))>20 then raise exception 'The extracted document exceeds the processing limit.'; end if;
  select document_version into v_version from public.ppa_proposals where id=p_id and revision=p_revision for update;
  if not found then raise exception 'This proposal changed. Reload before retrying extraction.'; end if;
  update public.ppa_documents set extraction=p_extraction where proposal_id=p_id and version=v_version;
  update public.ppa_proposals set revision=revision+1,state='draft',updated_at=now() where id=p_id;
end; $$;

create function public.publish_ppa_proposal(p_id uuid,p_revision integer,p_approval_confirmed boolean,p_review_confirmed boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.ppa_proposals; f jsonb; v_id uuid; v_start date; v_end date; v_st time; v_et time;
  v_slots integer; v_budget numeric; v_planned numeric; v_other numeric; v_expenses numeric; v_item jsonb;
  v_facilitators uuid[]; v_existing uuid[]; v_alloc_id uuid; v_state text;
begin
  if not public.is_legacy_admin() then raise exception 'Administrator access required.'; end if;
  select * into p from public.ppa_proposals where id=p_id for update;
  if not found then raise exception 'Proposal not found.'; end if;
  if p.state='published' and p.published_revision=p_revision then return p.activity_id; end if;
  if p.revision<>p_revision then raise exception 'This proposal changed. Reload before publishing.'; end if;
  if p_approval_confirmed is not true or p_review_confirmed is not true then raise exception 'Confirm the signed approval and review all extracted information.'; end if;
  if not exists(select 1 from public.ppa_documents where proposal_id=p.id and version=p.document_version) then raise exception 'Attach the signed PPA design.'; end if;
  f:=p.fields;
  if length(trim(coalesce(f->>'title',''))) not between 1 and 160 or trim(coalesce(f->>'venue',''))='' or trim(coalesce(f->>'summary',''))='' or trim(coalesce(f->>'rationale',''))='' then raise exception 'Complete the title, venue, public summary, and full description.'; end if;
  if not exists(select 1 from public.programs where id=(f->>'programId')::uuid) then raise exception 'Select a valid program.'; end if;
  v_start:=nullif(f->>'startDate','')::date; v_end:=nullif(f->>'endDate','')::date;
  v_st:=nullif(f->>'startTime','')::time; v_et:=nullif(f->>'endTime','')::time;
  if v_start is null or v_end is null or v_st is null or v_et is null or v_end+v_et<=v_start+v_st then raise exception 'Supply exact dates and times, with the end after the start.'; end if;
  if (v_start+v_st) at time zone 'Asia/Manila'<=now() then raise exception 'The activity must start in the future. Completed records cannot be overwritten.'; end if;
  v_slots:=nullif(f->>'slots','')::integer; v_budget:=nullif(f->>'allocation','')::numeric;
  if v_slots is null or v_slots<1 or v_budget is null or v_budget<0 or v_budget>9999999999.99 then raise exception 'Confirm a positive capacity and valid budget allocation.'; end if;
  select coalesce(array_agg(distinct value::uuid),'{}') into v_facilitators from jsonb_array_elements_text(coalesce(f->'facilitatorIds','[]'));
  if cardinality(v_facilitators)<1 or exists(select 1 from unnest(v_facilitators) x where not exists(select 1 from public.facilitators where id=x and user_uuid is not null)) then raise exception 'Assign at least one valid facilitator account.'; end if;
  v_planned:=0;
  for v_item in select * from jsonb_array_elements(coalesce(f->'budgetItems','[]')) loop
    if trim(coalesce(v_item->>'description',''))='' or coalesce(jsonb_typeof(v_item->'quantity'),'')<>'number' or coalesce(jsonb_typeof(v_item->'unitCost'),'')<>'number' or (v_item->>'quantity')::numeric<=0 or (v_item->>'unitCost')::numeric<0 then raise exception 'Review each planned expense.'; end if;
    v_planned:=v_planned+(v_item->>'quantity')::numeric*(v_item->>'unitCost')::numeric;
  end loop;
  if jsonb_array_length(coalesce(f->'budgetItems','[]'))>0 and abs(v_planned-v_budget)>0.01 and trim(coalesce(f->>'reviewNote',''))='' then raise exception 'Explain the difference between planned expenses and the approved allocation.'; end if;
  v_id:=p.activity_id;
  if v_id is null then
    insert into public.legacy_activities(program_id,title,slots,start_date,end_date,start_time,end_time,venue,preview_desc,full_desc,objectives,outcomes,schedule,status,proposal_id)
    values((f->>'programId')::uuid,trim(f->>'title'),v_slots,v_start,v_end,v_st,v_et,trim(f->>'venue'),f->>'summary',f->>'rationale',
      regexp_split_to_array(coalesce(f->>'objectives',''),'\n+'),regexp_split_to_array(coalesce(f->>'outputs',''),'\n+'),regexp_split_to_array(coalesce(f->>'schedule',''),'\n+'),'upcoming',p.id) returning id into v_id;
  else
    select status into v_state from public.legacy_activities where id=v_id for update;
    if (select public.activity_lifecycle(start_date,start_time,end_date,end_time) from public.legacy_activities where id=v_id)='completed' then raise exception 'Completed activities are historical records. Upload a new proposal for a new run.'; end if;
    if v_slots<(select count(*) from public.registrations where activity_id=v_id and status<>'inactive') then raise exception 'Capacity cannot be lower than active registrations.'; end if;
    update public.legacy_activities set program_id=(f->>'programId')::uuid,title=trim(f->>'title'),slots=v_slots,start_date=v_start,end_date=v_end,start_time=v_st,end_time=v_et,
      venue=trim(f->>'venue'),preview_desc=f->>'summary',full_desc=f->>'rationale',objectives=regexp_split_to_array(coalesce(f->>'objectives',''),'\n+'),outcomes=regexp_split_to_array(coalesce(f->>'outputs',''),'\n+'),schedule=regexp_split_to_array(coalesce(f->>'schedule',''),'\n+') where id=v_id;
  end if;
  -- Synchronize the approved allocation once; planned expense items are never spending entries.
  select coalesce(sum(amount),0) into v_other from public.budget_entries where activity_id=v_id and entry_type='allocation' and proposal_id is distinct from p.id;
  select coalesce(sum(amount),0) into v_expenses from public.budget_entries where activity_id=v_id and entry_type='expense';
  if v_budget<v_other or v_budget<v_expenses then raise exception 'Approved allocation cannot be less than existing allocations or actual spending. Review Budget Monitor.'; end if;
  select id into v_alloc_id from public.budget_entries where proposal_id=p.id and entry_type='allocation';
  if v_budget-v_other>0 then
    insert into public.budget_entries(id,activity_id,proposal_id,category,description,amount,entry_type)
      values(coalesce(v_alloc_id,gen_random_uuid()),v_id,p.id,'Approved PPA','Approved allocation from signed PPA design',v_budget-v_other,'allocation')
      on conflict(id) do update set amount=excluded.amount;
  elsif v_alloc_id is not null then delete from public.budget_entries where id=v_alloc_id; end if;
  select coalesce(array_agg(facilitator_id),'{}') into v_existing from public.activity_facilitators where activity_id=v_id;
  delete from public.activity_facilitators where activity_id=v_id and not(facilitator_id=any(v_facilitators));
  insert into public.activity_facilitators(activity_id,facilitator_id) select v_id,x from unnest(v_facilitators) x where not(x=any(v_existing));
  insert into public.ppa_publications(proposal_id,revision,document_version,fields) values(p.id,p.revision,p.document_version,f);
  update public.ppa_proposals set activity_id=v_id,state='published',published_revision=p.revision,published_version=p.document_version,updated_at=now() where id=p.id;
  return v_id;
end; $$;

create function public.ppa_age_on(p_birthday date,p_date date) returns integer language sql immutable set search_path='' as $$
  select extract(year from age(p_date,p_birthday))::integer;
$$;
create function public.guard_registration_age_dates() returns trigger language plpgsql security definer set search_path='' as $$
declare b date; d date; today date:=(now() at time zone 'Asia/Manila')::date;
begin
  if new.status<>'registered' then return new; end if;
  if tg_op='UPDATE' then if old.status='registered' and old.activity_id=new.activity_id and old.user_uuid=new.user_uuid then return new; end if; end if;
  select birthday into b from public.participants where user_uuid=new.user_uuid;
  select start_date into d from public.legacy_activities where id=new.activity_id;
  if b is null or public.ppa_age_on(b,today) not between 15 and 30 or public.ppa_age_on(b,d) not between 15 and 30 then
    raise exception 'Participants must be 15–30 years old on both registration day and the activity start date.';
  end if;
  return new;
end; $$;
create trigger registrations_guard_age_dates before insert or update of status,activity_id,user_uuid on public.registrations for each row execute function public.guard_registration_age_dates();

create table public.registration_eligibility_reviews (
  registration_id uuid primary key references public.registrations(id) on delete cascade,
  activity_id uuid not null references public.legacy_activities(id) on delete cascade,
  reason text not null, detected_at timestamptz not null default now(), resolved boolean not null default false,
  reviewed_at timestamptz, review_note text not null default ''
);
alter table public.registration_eligibility_reviews enable row level security;
create policy "Admins review eligibility" on public.registration_eligibility_reviews for all to authenticated using((select public.is_legacy_admin())) with check((select public.is_legacy_admin()));
grant select,update(reviewed_at,review_note) on public.registration_eligibility_reviews to authenticated;
create function public.flag_rescheduled_eligibility() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.start_date=old.start_date then return new; end if;
  insert into public.registration_eligibility_reviews(registration_id,activity_id,reason)
    select r.id,new.id,'Schedule changed: participant is outside age 15–30 on registration day or the revised start date, or birthday is missing.'
    from public.registrations r left join public.participants p on p.user_uuid=r.user_uuid where r.activity_id=new.id and r.status<>'inactive'
      and (p.birthday is null or public.ppa_age_on(p.birthday,(r.registered_at at time zone 'Asia/Manila')::date) not between 15 and 30 or public.ppa_age_on(p.birthday,new.start_date) not between 15 and 30)
    on conflict(registration_id) do update set reason=excluded.reason,detected_at=now(),resolved=false,reviewed_at=null;
  update public.registration_eligibility_reviews er set resolved=true from public.registrations r join public.participants p on p.user_uuid=r.user_uuid
    where er.registration_id=r.id and er.activity_id=new.id and public.ppa_age_on(p.birthday,(r.registered_at at time zone 'Asia/Manila')::date) between 15 and 30 and public.ppa_age_on(p.birthday,new.start_date) between 15 and 30;
  return new;
end; $$;
create trigger flag_rescheduled_eligibility after update of start_date on public.legacy_activities for each row execute function public.flag_rescheduled_eligibility();

-- The existing notification trigger covers schedule/title/venue changes. Handle
-- description-only revisions separately so recipients get one update per edit.
create function public.notify_ppa_content_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.proposal_id is null or row(new.preview_desc,new.full_desc,new.objectives,new.outcomes,new.schedule)
    is not distinct from row(old.preview_desc,old.full_desc,old.objectives,old.outcomes,old.schedule) then return new; end if;
  if row(new.title,new.start_date,new.end_date,new.start_time,new.end_time,new.venue,new.manually_closed,new.note)
    is distinct from row(old.title,old.start_date,old.end_date,old.start_time,old.end_time,old.venue,old.manually_closed,old.note) then return new; end if;
  insert into public.notifications(recipient_id,activity_id,kind,title,message,link)
    select user_uuid,new.id,'activity','Activity details updated',format('The information for "%s" has changed. Review the latest activity details.',new.title),'/participant/my-activities'
      from public.registrations where activity_id=new.id and status<>'inactive';
  perform public.notify_activity_staff(new.id,'activity','Activity details updated',format('The information for "%s" has changed.',new.title));
  return new;
end; $$;
create trigger notify_ppa_content_change after update on public.legacy_activities for each row execute function public.notify_ppa_content_change();
revoke all on function public.notify_ppa_content_change() from public,anon,authenticated;

revoke all on function public.import_ppa_document(uuid,integer,text,jsonb,jsonb,jsonb), public.save_ppa_draft(uuid,integer,jsonb), public.ensure_ppa_program(text), public.publish_ppa_proposal(uuid,integer,boolean,boolean), public.retry_ppa_extraction(uuid,integer,jsonb) from public,anon;
grant execute on function public.import_ppa_document(uuid,integer,text,jsonb,jsonb,jsonb), public.save_ppa_draft(uuid,integer,jsonb), public.ensure_ppa_program(text), public.publish_ppa_proposal(uuid,integer,boolean,boolean), public.retry_ppa_extraction(uuid,integer,jsonb) to authenticated;
revoke all on function public.guard_registration_age_dates(),public.flag_rescheduled_eligibility() from public,anon,authenticated;
