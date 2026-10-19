-- PRIME already creates these tables, role helpers, and RLS policies in
-- 20261017130000_legacy_app_compatibility.sql. This incremental migration
-- makes the attendance uniqueness guarantee explicit and ensures all
-- objective dashboards receive the relevant Realtime changes.

create unique index if not exists attendance_log_once_per_day_idx
  on public.attendance_log (registration_id, attendance_date, day_number);

alter table public.attendance_log enable row level security;
alter table public.budget_entries enable row level security;
alter table public.evaluations enable row level security;

drop policy if exists "Assigned staff read and record attendance" on public.attendance_log;
create policy "Assigned staff read and record attendance"
  on public.attendance_log for select to authenticated
  using (
    (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );

drop policy if exists "Assigned staff record attendance" on public.attendance_log;
create policy "Assigned staff record attendance"
  on public.attendance_log for insert to authenticated
  with check (
    (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );

drop policy if exists "Admins manage budget entries" on public.budget_entries;
create policy "Admins manage budget entries"
  on public.budget_entries for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

drop policy if exists "Admins and assigned facilitators read evaluations" on public.evaluations;
create policy "Admins and assigned facilitators read evaluations"
  on public.evaluations for select to authenticated
  using (
    (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );

drop policy if exists "Admins manage evaluations" on public.evaluations;
create policy "Admins manage evaluations"
  on public.evaluations for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

grant select, insert on public.attendance_log to authenticated;
grant select, insert, update, delete on public.budget_entries to authenticated;
grant select on public.evaluations to authenticated;
grant execute on function public.submit_legacy_evaluation(text, smallint, text, boolean, jsonb) to anon, authenticated;

create or replace function public.get_my_evaluation_status()
returns table (registration_id uuid, ref_code text, activity_title text, evaluated boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.ref_code, a.title,
    exists (select 1 from public.evaluations e where e.registration_id = r.id)
  from public.registrations r
  join public.legacy_activities a on a.id = r.activity_id
  where r.user_uuid = (select auth.uid())
$$;

revoke all on function public.get_my_evaluation_status() from public, anon;
grant execute on function public.get_my_evaluation_status() to authenticated;

create or replace function public.record_legacy_attendance(
  p_activity_id uuid,
  p_ref_code text,
  p_day_number smallint,
  p_method text
)
returns table (success boolean, message text, participant_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration_id uuid;
  v_registration_activity_id uuid;
  v_registration_status text;
  v_participant_name text;
  v_attendance_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    return query select false, 'Please log in as an administrator or assigned facilitator.', null::text;
    return;
  end if;
  if p_day_number is null or p_day_number < 1 then
    return query select false, 'Event day must be 1 or greater.', null::text;
    return;
  end if;
  if p_method is null or p_method not in ('manual', 'qr') then
    return query select false, 'Attendance method is invalid.', null::text;
    return;
  end if;

  select r.id, r.activity_id, r.status, d.name
    into v_registration_id, v_registration_activity_id, v_registration_status, v_participant_name
  from public.registrations r
  join public.registration_details d on d.id = r.id
  where r.ref_code = upper(trim(p_ref_code));

  if not found then
    return query select false, 'Participant reference code was not found.', null::text;
    return;
  end if;
  if v_registration_activity_id <> p_activity_id then
    return query select false, 'Participant is registered for a different activity.', v_participant_name;
    return;
  end if;
  if v_registration_status = 'inactive' then
    return query select false, 'Participant registration has been cancelled.', v_participant_name;
    return;
  end if;
  if not (select public.is_legacy_admin())
     and not (select public.is_legacy_facilitator_for_activity(p_activity_id)) then
    return query select false, 'You are not assigned to record attendance for this activity.', v_participant_name;
    return;
  end if;

  insert into public.attendance_log (registration_id, activity_id, day_number, method)
  values (v_registration_id, p_activity_id, p_day_number, p_method)
  on conflict (registration_id, attendance_date, day_number) do nothing
  returning id into v_attendance_id;

  if v_attendance_id is null then
    return query select false, 'Participant is already checked in for this event day.', v_participant_name;
    return;
  end if;

  update public.registrations r
  set status = case when r.status = 'registered' then 'attended' else r.status end,
      attended_at = coalesce(r.attended_at, v_now)
  where r.id = v_registration_id;

  return query select true, 'Attendance recorded successfully.', v_participant_name;
end;
$$;

revoke all on function public.record_legacy_attendance(uuid, text, smallint, text) from public, anon;
grant execute on function public.record_legacy_attendance(uuid, text, smallint, text) to authenticated;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['programs', 'legacy_activities', 'registrations', 'attendance_log', 'budget_entries', 'evaluations']
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;
