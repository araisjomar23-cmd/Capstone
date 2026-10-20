-- Let a participant who evaluated through an earlier flow finish attendance
-- check-in from the unified event QR without submitting a duplicate evaluation.
create or replace function public.record_attendance_for_submitted_evaluation(
  p_ref_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration public.registrations%rowtype;
  v_activity public.legacy_activities%rowtype;
  v_now timestamptz := now();
  v_attendance_date date;
  v_day_number smallint;
begin
  if v_user_id is null then
    raise exception 'Sign in with your participant account to record attendance.';
  end if;

  select * into v_registration
  from public.registrations
  where ref_code = upper(trim(p_ref_code))
    and user_uuid = v_user_id
  for update;

  if not found then
    raise exception 'This registration does not belong to your participant account.';
  end if;
  if v_registration.status = 'inactive' then
    raise exception 'A cancelled registration cannot record attendance.';
  end if;
  if not exists (
    select 1 from public.evaluations e
    where e.registration_id = v_registration.id
  ) then
    raise exception 'Submit the activity evaluation before recording attendance.';
  end if;

  select * into v_activity
  from public.legacy_activities
  where id = v_registration.activity_id;

  if not found or public.activity_lifecycle(
    v_activity.start_date, v_activity.start_time, v_activity.end_date, v_activity.end_time
  ) <> 'completed' then
    raise exception 'Attendance can be recorded after the activity has ended.';
  end if;

  v_attendance_date := v_activity.end_date;
  v_day_number := greatest(1, v_activity.end_date - v_activity.start_date + 1)::smallint;

  insert into public.attendance_log (
    registration_id, activity_id, checked_in_at, attendance_date, day_number, method
  )
  values (
    v_registration.id, v_activity.id, v_now, v_attendance_date, v_day_number, 'qr'
  )
  on conflict (registration_id, attendance_date, day_number) do nothing;

  update public.registrations
  set status = case when status = 'registered' then 'attended' else status end,
      attended_at = coalesce(attended_at, v_now)
  where id = v_registration.id;
end;
$$;

revoke all on function public.record_attendance_for_submitted_evaluation(text) from public, anon;
grant execute on function public.record_attendance_for_submitted_evaluation(text) to authenticated;
