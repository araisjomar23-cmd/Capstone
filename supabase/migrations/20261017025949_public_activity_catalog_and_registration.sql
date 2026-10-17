create or replace view public.public_activity_catalog
with (security_barrier = true)
as
select
  a.id,
  a.program_id,
  a.title,
  a.activity_date,
  a.location,
  a.target_participants,
  a.status,
  p.name as program_name,
  p.description as program_description,
  coalesce(registrations.registration_count, 0)::integer as registration_count
from public.activities a
left join public.programs p on p.id = a.program_id
left join lateral (
  select count(*) as registration_count
  from (
    select r.participant_id
    from public.activity_registrations r
    where r.activity_id = a.id
      and r.status in ('Registered', 'Attended', 'Evaluated')
    union
    select e.participant_id
    from public.program_enrollments e
    where e.program_id = a.program_id
      and e.status in ('Registered', 'Active')
  ) registered_participants
) registrations on true
where a.status in ('Upcoming', 'Ongoing')
  and a.activity_date >= current_date
  and (
    a.program_id is null
    or (
      p.status in ('Planning', 'Ongoing')
      and (p.end_date is null or p.end_date >= current_date)
    )
  );

grant select on public.public_activity_catalog to anon, authenticated;

create or replace function public.register_for_activity(p_activity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status public.activity_status;
  v_activity_date date;
  v_capacity integer;
  v_registration_id uuid;
  v_registration_status text;
  v_registered_count integer;
  v_is_already_counted boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in before registering for an activity.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_user_id and role = 'participant'
  ) then
    raise exception 'Only youth participant accounts can register for activities.';
  end if;

  select a.status, a.activity_date, a.target_participants
    into v_status, v_activity_date, v_capacity
    from public.activities a
    where a.id = p_activity_id
    for update;

  if not found then
    raise exception 'This activity is no longer available.';
  end if;

  if v_status <> 'Upcoming' or v_activity_date < current_date then
    raise exception 'Registration for this activity is closed.';
  end if;

  select r.id, r.status
    into v_registration_id, v_registration_status
    from public.activity_registrations r
    where r.activity_id = p_activity_id
      and r.participant_id = v_user_id;

  if v_registration_status in ('Registered', 'Attended', 'Evaluated') then
    raise exception 'You are already registered for this activity.';
  end if;

  select exists (
    select 1
    from public.activities a
    join public.program_enrollments e on e.program_id = a.program_id
    where a.id = p_activity_id
      and e.participant_id = v_user_id
      and e.status in ('Registered', 'Active')
  ) into v_is_already_counted;

  if v_capacity > 0 and not v_is_already_counted then
    select count(*)::integer
      into v_registered_count
      from (
        select r.participant_id
        from public.activity_registrations r
        where r.activity_id = p_activity_id
          and r.status in ('Registered', 'Attended', 'Evaluated')
        union
        select e.participant_id
        from public.activities a
        join public.program_enrollments e on e.program_id = a.program_id
        where a.id = p_activity_id
          and e.status in ('Registered', 'Active')
      ) registered_participants;

    if v_registered_count >= v_capacity then
      raise exception 'This activity has reached its participant capacity.';
    end if;
  end if;

  if v_registration_id is not null then
    update public.activity_registrations
      set status = 'Registered', registered_at = now()
      where id = v_registration_id;
    return v_registration_id;
  end if;

  insert into public.activity_registrations (activity_id, participant_id, status)
    values (p_activity_id, v_user_id, 'Registered')
    returning id into v_registration_id;

  return v_registration_id;
end;
$$;

revoke all on function public.register_for_activity(uuid) from public, anon;
grant execute on function public.register_for_activity(uuid) to authenticated;