-- Restrict evaluation submission to the authenticated participant who owns the registration.
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
  v_user_id uuid := auth.uid();
  v_registration public.registrations%rowtype;
  v_activity public.legacy_activities%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in with your participant account to submit an evaluation.';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  select * into v_registration
  from public.registrations
  where ref_code = upper(trim(p_ref_code))
    and user_uuid = v_user_id;

  if not found then
    raise exception 'This registration does not belong to your participant account.';
  end if;
  if v_registration.status = 'inactive' then
    raise exception 'A cancelled registration cannot submit an evaluation.';
  end if;
  if v_registration.status not in ('attended', 'completed') and not exists (
    select 1 from public.attendance_log al where al.registration_id = v_registration.id
  ) then
    raise exception 'Evaluation is available after attendance is recorded.';
  end if;

  select * into v_activity
  from public.legacy_activities
  where id = v_registration.activity_id;

  if not found or public.activity_lifecycle(
    v_activity.start_date, v_activity.start_time, v_activity.end_date, v_activity.end_time
  ) <> 'completed' then
    raise exception 'Evaluation opens after the activity has ended.';
  end if;

  insert into public.evaluations (
    registration_id, activity_id, rating, feedback, would_recommend, responses
  )
  values (
    v_registration.id, v_registration.activity_id, p_rating,
    left(coalesce(p_feedback, ''), 3000), coalesce(p_would_recommend, false),
    coalesce(p_responses, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.submit_legacy_evaluation(text, smallint, text, boolean, jsonb) from public, anon;
grant execute on function public.submit_legacy_evaluation(text, smallint, text, boolean, jsonb) to authenticated;
