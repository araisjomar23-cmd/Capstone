alter table public.legacy_activities
  add column attendance_finalized_at timestamptz,
  add column attendance_finalized_by uuid references auth.users(id);

alter table public.registrations drop constraint registrations_status_check;
alter table public.registrations add constraint registrations_status_check
  check (status in ('registered', 'attended', 'completed', 'inactive', 'absent'));
alter table public.registration_details drop constraint registration_details_status_check;
alter table public.registration_details add constraint registration_details_status_check
  check (status in ('registered', 'attended', 'completed', 'inactive', 'absent'));

create or replace function public.finalize_activity_attendance(p_activity_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_activity public.legacy_activities%rowtype;
  v_absent integer;
begin
  if auth.uid() is null or not (
    public.is_legacy_admin() or public.is_legacy_facilitator_for_activity(p_activity_id)
  ) then
    raise exception 'Only an administrator or the assigned facilitator can finalize attendance.';
  end if;
  -- Match submission lock order: registrations first, then the activity.
  perform id from public.registrations where activity_id = p_activity_id order by id for update;
  select * into v_activity from public.legacy_activities where id = p_activity_id for update;
  if not found then raise exception 'Activity not found.'; end if;
  if v_activity.attendance_finalized_at is not null then return 0; end if;
  if v_activity.manually_closed or public.activity_lifecycle(
    v_activity.start_date, v_activity.start_time, v_activity.end_date, v_activity.end_time
  ) <> 'completed' then
    raise exception 'Attendance can only be finalized after the activity ends. Manually closed activities cannot be finalized.';
  end if;

  update public.registrations r set status = 'attended'
    where r.activity_id = p_activity_id and r.status = 'registered'
      and (r.attended_at is not null or exists (
        select 1 from public.attendance_log al where al.registration_id = r.id
      ));
  update public.registrations r set status = 'absent'
    where r.activity_id = p_activity_id and r.status = 'registered';
  get diagnostics v_absent = row_count;
  update public.legacy_activities set attendance_finalized_at = now(), attendance_finalized_by = auth.uid()
    where id = p_activity_id;
  return v_absent;
end;
$$;
revoke all on function public.finalize_activity_attendance(uuid) from public, anon;
grant execute on function public.finalize_activity_attendance(uuid) to authenticated;

create or replace function public.guard_finalized_attendance_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_finalized timestamptz;
begin
  select a.attendance_finalized_at into v_finalized
    from public.legacy_activities a where a.id = new.activity_id for share;
  if v_finalized is not null then
    raise exception 'Attendance has been finalized. Further evaluation and attendance submissions are unavailable.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_finalized_attendance_submission() from public, anon, authenticated;
create trigger evaluations_guard_finalized_attendance before insert on public.evaluations
  for each row execute function public.guard_finalized_attendance_submission();
create trigger attendance_guard_finalized_attendance before insert on public.attendance_log
  for each row execute function public.guard_finalized_attendance_submission();
