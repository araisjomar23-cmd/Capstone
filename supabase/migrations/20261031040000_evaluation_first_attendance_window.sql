-- The event QR opens evaluation near the end; attendance follows successful submission.
create or replace function public.activity_evaluation_opens_at(a public.legacy_activities)
returns timestamptz language sql stable set search_path = '' as $$
  select greatest(
    (a.start_date + coalesce(a.start_time, time '00:00:00')) at time zone 'Asia/Manila',
    ((a.end_date + coalesce(a.end_time, time '23:59:59.999999'))
      - make_interval(mins => a.checkin_early_access_minutes::integer)) at time zone 'Asia/Manila'
  );
$$;

create or replace function public.submit_legacy_evaluation(
  p_ref_code text,
  p_rating smallint,
  p_feedback text,
  p_would_recommend boolean,
  p_responses jsonb,
  p_mark_attended_on_submit boolean
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
  v_required_key text;
begin
  if v_user_id is null then
    raise exception 'Sign in with your participant account to submit an evaluation.';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;
  if p_responses is null or not (p_responses ?& array[
    'fb_valuable', 'fb_improve', 'fb_learning', 'fb_attend_again',
    'fb_participation', 'fb_time_mgmt', 'q1', 'q2', 'q3', 'q4', 'overall_star'
  ]) then
    raise exception 'Please complete every required evaluation question.';
  end if;
  foreach v_required_key in array array[
    'fb_valuable', 'fb_improve', 'fb_learning', 'fb_attend_again',
    'fb_participation', 'fb_time_mgmt', 'q1', 'q2', 'q3', 'q4', 'overall_star'
  ] loop
    if nullif(btrim(p_responses ->> v_required_key), '') is null then
      raise exception 'Please complete every required evaluation question.';
    end if;
  end loop;
  if (p_responses ->> 'overall_star') !~ '^[1-5]$'
    or (p_responses ->> 'overall_star')::smallint <> p_rating then
    raise exception 'The overall rating is invalid.';
  end if;
  if (p_responses ->> 'q1') !~ '^[1-5]$'
    or (p_responses ->> 'q2') !~ '^[1-5]$'
    or (p_responses ->> 'q3') !~ '^[1-5]$'
    or (p_responses ->> 'q4') !~ '^[1-5]$' then
    raise exception 'Please answer each rating question from 1 to 5.';
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
    raise exception 'A cancelled registration cannot submit an evaluation.';
  end if;
  if not p_mark_attended_on_submit
    and v_registration.status not in ('attended', 'completed')
    and not exists (
      select 1 from public.attendance_log al where al.registration_id = v_registration.id
    ) then
    raise exception 'Evaluation is available after attendance is recorded.';
  end if;

  select * into v_activity
  from public.legacy_activities
  where id = v_registration.activity_id for share;

  if not found then
    raise exception 'Activity not found.';
  end if;
  if v_activity.manually_closed then
    raise exception 'This activity was manually closed. Evaluation and check-in are unavailable.';
  end if;
  if v_now < public.activity_evaluation_opens_at(v_activity) then
    raise exception 'Evaluation opens near the end of the activity. Please scan the activity QR when the facilitator displays it.';
  end if;

  insert into public.evaluations (
    registration_id, activity_id, rating, feedback, would_recommend, responses
  )
  values (
    v_registration.id, v_registration.activity_id, p_rating,
    left(coalesce(p_feedback, ''), 3000), coalesce(p_would_recommend, false),
    coalesce(p_responses, '{}'::jsonb)
  );

  if p_mark_attended_on_submit then
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
  end if;
end;
$$;

revoke all on function public.submit_legacy_evaluation(text, smallint, text, boolean, jsonb, boolean) from public, anon;
grant execute on function public.submit_legacy_evaluation(text, smallint, text, boolean, jsonb, boolean) to authenticated;

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
    public.activity_evaluation_opens_at(a)
  from public.registrations r
  join public.legacy_activities a on a.id = r.activity_id
  where r.user_uuid = (select auth.uid())
$$;

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

  if not found or v_activity.manually_closed then
    raise exception 'This activity is unavailable for attendance.';
  end if;
  if v_now < public.activity_evaluation_opens_at(v_activity) then
    raise exception 'Evaluation and attendance open near the end of the activity.';
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
