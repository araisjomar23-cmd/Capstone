-- Derive activity lifecycle in the local event timezone (Panabo, Philippines).
create or replace function public.activity_lifecycle(
  p_start_date date,
  p_start_time time,
  p_end_date date,
  p_end_time time
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when now() < ((p_start_date + coalesce(p_start_time, time '00:00:00')) at time zone 'Asia/Manila') then 'upcoming'
    when now() > ((p_end_date + coalesce(p_end_time, time '23:59:59.999999')) at time zone 'Asia/Manila') then 'completed'
    else 'ongoing'
  end;
$$;

revoke all on function public.activity_lifecycle(date, time, date, time) from public, anon;
grant execute on function public.activity_lifecycle(date, time, date, time) to authenticated;

-- Preserve the existing result shape while deriving attended registrations as
-- completed once their activity has ended. This avoids a scheduled timer/job.
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
      when r.status in ('attended', 'completed')
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
grant execute on function public.get_my_registrations() to authenticated;

-- The return shape changes, so replace the prior RPC definition explicitly.
drop function if exists public.get_my_evaluation_status();
create function public.get_my_evaluation_status()
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
    public.activity_lifecycle(a.start_date, a.start_time, a.end_date, a.end_time),
    case when a.start_time is null
      then (a.start_date + time '00:00:00') at time zone 'Asia/Manila'
      else (a.start_date + a.start_time
        - make_interval(mins => a.checkin_early_access_minutes::integer)) at time zone 'Asia/Manila'
    end
  from public.registrations r
  join public.legacy_activities a on a.id = r.activity_id
  where r.user_uuid = (select auth.uid())
$$;
revoke all on function public.get_my_evaluation_status() from public, anon;
grant execute on function public.get_my_evaluation_status() to authenticated;

-- Keep database enforcement aligned with the participant evaluation page.
create or replace function public.submit_legacy_evaluation(
  p_ref_code text,
  p_rating smallint,
  p_feedback text,
  p_would_recommend boolean,
  p_responses jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_activity public.legacy_activities%rowtype;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  select * into v_registration
  from public.registrations
  where ref_code = upper(trim(p_ref_code));

  if not found then
    raise exception 'Reference code not found. Please check and try again.';
  end if;
  if v_registration.status not in ('attended', 'completed') and not exists (
    select 1 from public.attendance_log al where al.registration_id = v_registration.id
  ) then
    raise exception 'Evaluation is available after attendance is recorded.';
  end if;

  select * into v_activity from public.legacy_activities where id = v_registration.activity_id;
  if not found or public.activity_lifecycle(v_activity.start_date, v_activity.start_time, v_activity.end_date, v_activity.end_time) <> 'completed' then
    raise exception 'Evaluation opens after the activity has ended.';
  end if;

  insert into public.evaluations (
    registration_id, activity_id, rating, feedback, would_recommend, responses
  )
  values (
    v_registration.id, v_registration.activity_id, p_rating, left(coalesce(p_feedback, ''), 3000),
    coalesce(p_would_recommend, false), coalesce(p_responses, '{}'::jsonb)
  );
end;
$$;
grant execute on function public.submit_legacy_evaluation(text, smallint, text, boolean, jsonb) to anon, authenticated;
