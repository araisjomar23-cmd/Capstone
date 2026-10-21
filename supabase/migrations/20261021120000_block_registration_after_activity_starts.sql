-- Keep registration available only until the scheduled activity start time.
-- This trigger also protects the participant registration RPC from stale UI state.
create or replace function public.guard_legacy_activity_registration_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity public.legacy_activities%rowtype;
begin
  if new.status <> 'registered' then
    return new;
  end if;

  select * into v_activity
  from public.legacy_activities
  where id = new.activity_id;

  if not found then
    raise exception 'Activity not found.';
  end if;

  if public.activity_lifecycle(
    v_activity.start_date, v_activity.start_time,
    v_activity.end_date, v_activity.end_time
  ) <> 'upcoming' then
    raise exception 'Registration is closed because this activity has started.';
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_guard_activity_window on public.registrations;
create trigger registrations_guard_activity_window
  before insert or update of status, activity_id on public.registrations
  for each row execute function public.guard_legacy_activity_registration_window();

revoke all on function public.guard_legacy_activity_registration_window() from public, anon, authenticated;
