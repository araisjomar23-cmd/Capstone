-- Support the organization's Assessment questions 6-14 without rewriting
-- historical evaluations, changing attendance eligibility, or collecting Q1-5.
-- Apply before deploying the updated participant form. Legacy clients remain valid.

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
  v_saved_rating smallint := p_rating;
  v_saved_recommendation boolean := coalesce(p_would_recommend, false);
  v_score_total numeric := 0;
  v_score integer;
begin
  if v_user_id is null then
    raise exception 'Sign in with your participant account to submit an evaluation.';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;
  if p_responses is null or jsonb_typeof(p_responses) <> 'object' then
    raise exception 'Please complete every required evaluation question.';
  end if;
  if p_responses ->> 'form_version' = 'cydo-assessment-v1' then
    if jsonb_typeof(p_responses -> 'facilitator_name') is distinct from 'string'
      or nullif(btrim(p_responses ->> 'facilitator_name'), '') is null
      or char_length(btrim(p_responses ->> 'facilitator_name')) > 300 then
      raise exception 'Enter the facilitator/trainer/speaker name (up to 300 characters).';
    end if;
    if nullif(btrim(p_feedback), '') is null or char_length(btrim(p_feedback)) > 3000 then
      raise exception 'Comments/Suggestions are required and must be within 3000 characters.';
    end if;
    foreach v_required_key in array array[
      'assessment_content', 'assessment_job_support', 'assessment_technical_knowledge',
      'assessment_participation', 'assessment_methods', 'assessment_relevance', 'assessment_speaker'
    ] loop
      v_score := case p_responses ->> v_required_key
        when 'Poor' then 1 when 'Average' then 2 when 'Good' then 3
        when 'Very Good' then 4 when 'Excellent' then 5 else null end;
      if v_score is null then
        raise exception 'Choose Poor, Average, Good, Very Good or Excellent for every assessment question.';
      end if;
      v_score_total := v_score_total + v_score;
    end loop;
    -- Preserve the existing smallint column/RPC contract. Exact seven-item
    -- responses remain authoritative for averages in the application.
    v_saved_rating := round(v_score_total / 7)::smallint;
    if p_rating <> v_saved_rating then
      raise exception 'The calculated assessment rating is invalid.';
    end if;
    -- The organization form does not ask whether the participant recommends it.
    -- Never infer an affirmative recommendation from a rating or comment.
    v_saved_recommendation := false;
  elsif p_responses ? 'form_version' then
    raise exception 'This evaluation form version is not supported.';
  else
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
    v_registration.id, v_registration.activity_id, v_saved_rating,
    left(coalesce(p_feedback, ''), 3000), v_saved_recommendation,
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
