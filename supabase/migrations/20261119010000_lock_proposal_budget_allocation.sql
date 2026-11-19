-- Preserve the allocation extracted at import time independently of editable
-- draft fields and retryable extraction text. Actual expenses remain editable.
create function public.ppa_extracted_allocation(p_extraction jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare v text:=trim(p_extraction->'suggestedFields'->>'allocation'); n numeric;
begin
  if v is null or length(v)>30 or v !~ '^[0-9]+(\.[0-9]{1,2})?$' then return null; end if;
  n:=v::numeric;
  if n>9999999999.99 then return null; end if;
  return n;
end; $$;
revoke all on function public.ppa_extracted_allocation(jsonb) from public,anon,authenticated;

alter table public.ppa_documents add column approved_allocation numeric check(approved_allocation>=0 and approved_allocation<=9999999999.99);
update public.ppa_documents set approved_allocation=public.ppa_extracted_allocation(extraction);

create function public.freeze_ppa_source_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then new.approved_allocation:=public.ppa_extracted_allocation(new.extraction);
  else new.approved_allocation:=old.approved_allocation; end if;
  return new;
end; $$;
create trigger ppa_documents_freeze_allocation before insert or update on public.ppa_documents
for each row execute function public.freeze_ppa_source_allocation();

create function public.guard_ppa_draft_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_amount numeric; v_submitted numeric;
begin
  select approved_allocation into v_amount from public.ppa_documents where proposal_id=new.id and version=new.document_version;
  v_submitted:=public.ppa_extracted_allocation(jsonb_build_object('suggestedFields',new.fields));
  if v_amount is null then
    if nullif(trim(new.fields->>'allocation'),'') is not null then raise exception 'The allocation could not be extracted. Upload a clearer approved proposal; it cannot be entered manually.'; end if;
  elsif v_submitted is distinct from v_amount then
    raise exception 'The approved allocation is read-only and must match the uploaded proposal. A changed allocation requires a revised approved document.';
  end if;
  return new;
end; $$;
create trigger ppa_proposals_guard_allocation before update of fields on public.ppa_proposals
for each row execute function public.guard_ppa_draft_allocation();

create function public.apply_ppa_source_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.ppa_proposals set fields=jsonb_set(fields,'{allocation}',to_jsonb(coalesce(new.approved_allocation::text,'')))
    where id=new.proposal_id and document_version=new.version;
  return new;
end; $$;
create trigger ppa_documents_apply_allocation after insert on public.ppa_documents
for each row execute function public.apply_ppa_source_allocation();

create function public.guard_ppa_publication_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_amount numeric;
begin
  select approved_allocation into v_amount from public.ppa_documents where proposal_id=new.proposal_id and version=new.document_version;
  if v_amount is null then raise exception 'Upload an approved proposal with a readable budget allocation before publishing.'; end if;
  if public.ppa_extracted_allocation(jsonb_build_object('suggestedFields',new.fields)) is distinct from v_amount then
    raise exception 'The approved allocation must match the uploaded proposal. Reload the draft before publishing.';
  end if;
  return new;
end; $$;
create trigger ppa_publications_guard_allocation before insert on public.ppa_publications
for each row execute function public.guard_ppa_publication_allocation();

-- Restore any privately edited amount from its retained original extraction.
-- Published activities and historical approval snapshots are not rewritten.
update public.ppa_proposals p set fields=jsonb_set(p.fields,'{allocation}',to_jsonb(coalesce(d.approved_allocation::text,''))),revision=p.revision+1,updated_at=now()
from public.ppa_documents d where p.id=d.proposal_id and p.document_version=d.version and p.state='draft'
  and coalesce(p.fields->>'allocation','') is distinct from coalesce(d.approved_allocation::text,'');

-- Approved proposal allocations can only be synchronized by the owner-run
-- publication transaction. Ordinary administrator requests may record costs.
create policy "Protect PPA allocation inserts" on public.budget_entries as restrictive for insert to authenticated
with check(entry_type<>'allocation' or not exists(select 1 from public.legacy_activities a where a.id=activity_id and a.proposal_id is not null));
create policy "Protect PPA allocation updates" on public.budget_entries as restrictive for update to authenticated
using(entry_type<>'allocation' or not exists(select 1 from public.legacy_activities a where a.id=activity_id and a.proposal_id is not null))
with check(entry_type<>'allocation' or not exists(select 1 from public.legacy_activities a where a.id=activity_id and a.proposal_id is not null));
create policy "Protect PPA allocation deletes" on public.budget_entries as restrictive for delete to authenticated
using(entry_type<>'allocation' or not exists(select 1 from public.legacy_activities a where a.id=activity_id and a.proposal_id is not null));
revoke all on function public.freeze_ppa_source_allocation(),public.guard_ppa_draft_allocation(),public.apply_ppa_source_allocation(),public.guard_ppa_publication_allocation() from public,anon,authenticated;
