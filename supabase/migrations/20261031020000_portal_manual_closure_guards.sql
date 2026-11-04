-- Enforce the shared Closed status for stale facilitator scanners and participant links.
create or replace function public.guard_manually_closed_activity_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.registrations r
    join public.legacy_activities a on a.id = r.activity_id
    where r.id = new.registration_id and a.manually_closed
  ) then
    raise exception 'This activity was manually closed. Attendance and evaluation are unavailable.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_manually_closed_activity_submission() from public, anon, authenticated;

drop trigger if exists attendance_block_manually_closed_activity on public.attendance_log;
create trigger attendance_block_manually_closed_activity before insert on public.attendance_log
  for each row execute function public.guard_manually_closed_activity_submission();
drop trigger if exists evaluations_block_manually_closed_activity on public.evaluations;
create trigger evaluations_block_manually_closed_activity before insert on public.evaluations
  for each row execute function public.guard_manually_closed_activity_submission();

create or replace function public.check_in_my_activity(p_activity_id uuid)
returns table (success boolean, code text, message text, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration_id uuid;
  v_registration_status text;
  v_start_at timestamptz;
  v_checkin_opens_at timestamptz;
  v_end_at timestamptz;
  v_now timestamptz := now();
  v_local_date date;
  v_day_number smallint;
  v_attendance_id uuid;
begin
  if v_user_id is null or not exists (
    select 1 from public.participants p where p.user_uuid = v_user_id
  ) then
    return query select false, 'not_registered', 'No participant registration was found for this activity.', null::timestamptz;
    return;
  end if;

  select r.id, r.status
    into v_registration_id, v_registration_status
  from public.registrations r
  where r.user_uuid = v_user_id and r.activity_id = p_activity_id;

  if not found then
    return query select false, 'not_registered', 'You are not registered for this activity.', null::timestamptz;
    return;
  end if;
  if v_registration_status = 'inactive' then
    return query select false, 'cancelled', 'This activity registration has been cancelled.', null::timestamptz;
    return;
  end if;

  if exists (select 1 from public.legacy_activities a where a.id = p_activity_id and a.manually_closed) then
    return query select false, 'closed', 'This activity was manually closed. Check-in is unavailable.', null::timestamptz;
    return;
  end if;

  select
    (a.start_date + coalesce(a.start_time, time '00:00:00')) at time zone 'Asia/Manila',
    case when a.start_time is null
      then (a.start_date + time '00:00:00') at time zone 'Asia/Manila'
      else (a.start_date + a.start_time
        - make_interval(mins => a.checkin_early_access_minutes::integer)) at time zone 'Asia/Manila'
    end,
    (a.end_date + coalesce(a.end_time, time '23:59:59.999999')) at time zone 'Asia/Manila'
    into v_start_at, v_checkin_opens_at, v_end_at
  from public.legacy_activities a
  where a.id = p_activity_id;

  if not found then
    return query select false, 'not_registered', 'This activity could not be found.', null::timestamptz;
    return;
  end if;
  if v_now < v_checkin_opens_at then
    return query select false, 'too_early', 'Check-in has not opened for this activity yet.', null::timestamptz;
    return;
  end if;
  if v_now > v_end_at then
    return query select false, 'ended', 'The check-in window for this activity has ended.', null::timestamptz;
    return;
  end if;

  v_local_date := (v_now at time zone 'Asia/Manila')::date;
  v_day_number := (v_local_date - (v_start_at at time zone 'Asia/Manila')::date + 1)::smallint;

  if exists (
    select 1 from public.attendance_log al
    where al.registration_id = v_registration_id and al.day_number = v_day_number
  ) then
    return query select false, 'already_checked_in', 'You are already checked in for this activity day.', null::timestamptz;
    return;
  end if;

  insert into public.attendance_log (registration_id, activity_id, checked_in_at, attendance_date, day_number, method)
  values (v_registration_id, p_activity_id, v_now, v_local_date, v_day_number, 'qr')
  on conflict (registration_id, attendance_date, day_number) do nothing
  returning id into v_attendance_id;

  if v_attendance_id is null then
    return query select false, 'already_checked_in', 'You are already checked in for this activity day.', null::timestamptz;
    return;
  end if;

  update public.registrations r
  set status = case when r.status = 'registered' then 'attended' else r.status end,
      attended_at = coalesce(r.attended_at, v_now)
  where r.id = v_registration_id;

  return query select true, 'checked_in', 'Your attendance has been recorded. Thank you!', v_now;
end;
$$;
