-- Persist the reason for closure so elapsed dates do not turn manual closure into completion.
alter table public.legacy_activities add column if not exists manually_closed boolean not null default false;

-- A closed record last changed before its scheduled end was closed manually.
update public.legacy_activities
set manually_closed = true
where status = 'closed' and (
  public.activity_lifecycle(start_date, start_time, end_date, end_time) <> 'completed'
  or updated_at < ((end_date + coalesce(end_time, time '23:59:59.999999')) at time zone 'Asia/Manila')
);

create or replace function public.track_manual_activity_closure()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'closed' then
    new.manually_closed := false;
  elsif old.status <> 'closed' and public.activity_lifecycle(new.start_date, new.start_time, new.end_date, new.end_time) <> 'completed' then
    new.manually_closed := true;
  end if;
  return new;
end;
$$;
drop trigger if exists legacy_activities_track_manual_closure on public.legacy_activities;
create trigger legacy_activities_track_manual_closure
  before update of status, manually_closed on public.legacy_activities
  for each row execute function public.track_manual_activity_closure();
revoke all on function public.track_manual_activity_closure() from public, anon, authenticated;

create or replace function public.close_expired_legacy_activities()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.legacy_activities
  set status = 'closed'
  where status <> 'closed' and not manually_closed
    and public.activity_lifecycle(start_date, start_time, end_date, end_time) = 'completed';
end;
$$;

create or replace function public.get_my_registrations()
returns table (
  id uuid,
  activity_id uuid,
  title text,
  color_bg text,
  status text,
  registered_at timestamptz,
  cancel_deadline timestamptz,
  can_cancel boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.activity_id, a.title, a.color_bg,
    case
      when not a.manually_closed and r.status in ('attended', 'completed')
        and public.activity_lifecycle(a.start_date, a.start_time, a.end_date, a.end_time) = 'completed'
      then 'completed'
      else r.status
    end,
    r.registered_at,
    (a.start_date::timestamp - interval '24 hours') at time zone 'UTC',
    r.status = 'registered'
      and (a.start_date::timestamp - interval '24 hours') at time zone 'UTC' > now()
  from public.registrations r
  join public.legacy_activities a on a.id = r.activity_id
  where r.user_uuid = (select auth.uid())
  order by r.registered_at desc;
$$;

create or replace function public.get_my_evaluation_status()
returns table (
  registration_id uuid,
  ref_code text,
  activity_title text,
  evaluated boolean,
  attended boolean,
  activity_status text,
  checkin_opens_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.ref_code, a.title,
    exists (select 1 from public.evaluations e where e.registration_id = r.id),
    (r.status in ('attended', 'completed') or exists (
      select 1 from public.attendance_log al where al.registration_id = r.id
    )),
    case when a.manually_closed then 'closed' else public.activity_lifecycle(a.start_date, a.start_time, a.end_date, a.end_time) end,
    case when a.start_time is null
      then (a.start_date + time '00:00:00') at time zone 'Asia/Manila'
      else (a.start_date + a.start_time
        - make_interval(mins => a.checkin_early_access_minutes::integer)) at time zone 'Asia/Manila'
    end
  from public.registrations r
  join public.legacy_activities a on a.id = r.activity_id
  where r.user_uuid = (select auth.uid())
$$;
