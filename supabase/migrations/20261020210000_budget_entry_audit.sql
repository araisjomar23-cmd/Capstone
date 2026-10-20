-- Record immutable audit events for every budget entry change.
create table if not exists public.budget_entry_audit (
  id bigint generated always as identity primary key,
  budget_entry_id uuid not null,
  activity_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  actor_email text,
  changed_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);

create index if not exists budget_entry_audit_activity_changed_idx
  on public.budget_entry_audit (activity_id, changed_at desc);

alter table public.budget_entry_audit enable row level security;

drop policy if exists "Admins read budget entry audit" on public.budget_entry_audit;
create policy "Admins read budget entry audit"
  on public.budget_entry_audit for select to authenticated
  using ((select public.is_legacy_admin()));

revoke all on public.budget_entry_audit from anon, authenticated;
grant select on public.budget_entry_audit to authenticated;

create or replace function public.audit_budget_entry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_entry_id uuid;
  v_activity_id uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_entry_id := new.id;
    v_activity_id := new.activity_id;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_entry_id := new.id;
    v_activity_id := new.activity_id;
    if v_old = v_new then
      return new;
    end if;
  else
    v_old := to_jsonb(old);
    v_entry_id := old.id;
    v_activity_id := old.activity_id;
  end if;

  insert into public.budget_entry_audit (
    budget_entry_id,
    activity_id,
    operation,
    actor_id,
    actor_email,
    old_values,
    new_values
  )
  values (
    v_entry_id,
    v_activity_id,
    tg_op,
    auth.uid(),
    auth.jwt() ->> 'email',
    v_old,
    v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_budget_entry_change() from public, anon, authenticated;

drop trigger if exists budget_entries_audit_change on public.budget_entries;
create trigger budget_entries_audit_change
  after insert or update or delete on public.budget_entries
  for each row execute function public.audit_budget_entry_change();
