create table if not exists public.legacy_activities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  color_bg text not null default '#1a5c3a',
  tags text[] not null default '{}',
  status text not null default 'open'
    check (status in ('open', 'full', 'upcoming', 'closed')),
  slots integer not null default 0 check (slots >= 0),
  taken integer not null default 0 check (taken >= 0),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  date_text text not null default '',
  venue text not null default '',
  preview_desc text not null default '',
  full_desc text not null default '',
  outcomes text[] not null default '{}',
  schedule text[] not null default '{}',
  bring text[] not null default '{}',
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  user_uuid uuid not null unique references auth.users (id) on delete cascade,
  email text not null default '',
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  birthday date,
  age smallint check (age is null or age between 15 and 30),
  gender_identity text,
  contact text,
  barangay text,
  city_municipality text,
  province text,
  organization text,
  youth_classification text,
  sectoral_group text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_uuid uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('superadmin', 'facilitator')),
  created_at timestamptz not null default now()
);

create table if not exists public.facilitators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text not null default '',
  user_uuid uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_facilitators (
  activity_id uuid not null references public.legacy_activities (id) on delete cascade,
  facilitator_id uuid not null references public.facilitators (id) on delete cascade,
  primary key (activity_id, facilitator_id)
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.legacy_activities (id) on delete cascade,
  user_uuid uuid not null references auth.users (id) on delete cascade,
  ref_code text not null unique,
  status text not null default 'registered'
    check (status in ('registered', 'attended', 'completed', 'inactive')),
  registered_at timestamptz not null default now(),
  attended_at timestamptz,
  cancel_reason text,
  unique (activity_id, user_uuid)
);

create table if not exists public.registration_details (
  id uuid primary key references public.registrations (id) on delete cascade,
  activity_id uuid not null references public.legacy_activities (id) on delete cascade,
  user_uuid uuid not null references auth.users (id) on delete cascade,
  ref_code text not null unique,
  name text not null,
  age smallint,
  gender_identity text not null default '',
  contact text not null default '',
  barangay text not null default '',
  organization text not null default '',
  sectoral_group text not null default '',
  status text not null default 'registered'
    check (status in ('registered', 'attended', 'completed', 'inactive')),
  registered_at timestamptz not null default now(),
  attended_at timestamptz,
  notes text not null default ''
);

create table if not exists public.attendance_log (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  activity_id uuid not null references public.legacy_activities (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  attendance_date date not null default current_date,
  day_number smallint not null default 1 check (day_number > 0),
  method text not null default 'manual' check (method in ('manual', 'qr'))
);

create unique index if not exists attendance_log_once_per_day_idx
  on public.attendance_log (registration_id, attendance_date, day_number);

create table if not exists public.budget_entries (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.legacy_activities (id) on delete cascade,
  category text not null default '',
  description text not null default '',
  amount numeric(12, 2) not null check (amount > 0),
  entry_type text not null check (entry_type in ('allocation', 'expense')),
  recorded_at timestamptz not null default now(),
  recorded_by text not null default 'Admin'
);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  activity_id uuid not null references public.legacy_activities (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text not null default '',
  would_recommend boolean not null default false,
  responses jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (registration_id)
);

create index if not exists legacy_activities_program_date_idx
  on public.legacy_activities (program_id, start_date);
create index if not exists registrations_activity_status_idx
  on public.registrations (activity_id, status);
create index if not exists registration_details_activity_date_idx
  on public.registration_details (activity_id, registered_at desc);
create index if not exists attendance_log_activity_date_idx
  on public.attendance_log (activity_id, checked_in_at desc);
create index if not exists budget_entries_activity_date_idx
  on public.budget_entries (activity_id, recorded_at desc);
create index if not exists evaluations_activity_date_idx
  on public.evaluations (activity_id, submitted_at desc);

insert into public.legacy_activities (
  id, program_id, title, status, slots, start_date, end_date, date_text,
  venue, created_by, created_at, updated_at
)
select
  a.id,
  a.program_id,
  a.title,
  case a.status::text
    when 'Completed' then 'closed'
    when 'Ongoing' then 'open'
    else 'upcoming'
  end,
  a.target_participants,
  a.activity_date,
  a.activity_date,
  to_char(a.activity_date, 'Mon FMDD, YYYY'),
  a.location,
  a.created_by,
  a.created_at,
  a.created_at
from public.activities a
on conflict (id) do nothing;

insert into public.participants (
  user_uuid, email, first_name, last_name, age, barangay
)
select
  p.id,
  coalesce(u.email, ''),
  nullif(split_part(trim(p.full_name), ' ', 1), ''),
  case
    when strpos(trim(p.full_name), ' ') > 0
      then nullif(substring(trim(p.full_name) from strpos(trim(p.full_name), ' ') + 1), '')
    else null
  end,
  null,
  nullif(pd.barangay, '')
from public.profiles p
join auth.users u on u.id = p.id
left join public.participant_details pd on pd.participant_id = p.id
where p.role::text = 'participant'
on conflict (user_uuid) do nothing;

insert into public.registrations (
  id, activity_id, user_uuid, ref_code, status, registered_at, attended_at
)
select
  ar.id,
  ar.activity_id,
  ar.participant_id,
  'PM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  case
    when ar.status::text = 'Cancelled' then 'inactive'
    when ar.status::text = 'Evaluated' then 'completed'
    when ar.status::text = 'Attended' or att.attended_at is not null then 'attended'
    else 'registered'
  end,
  ar.registered_at,
  att.attended_at
from public.activity_registrations ar
join public.profiles p on p.id = ar.participant_id
left join (
  select activity_id, participant_id,
    min(recorded_at) filter (where attendance_status = 'Present') as attended_at
  from public.attendance
  group by activity_id, participant_id
) att on att.activity_id = ar.activity_id and att.participant_id = ar.participant_id
on conflict (id) do nothing;

insert into public.registration_details (
  id, activity_id, user_uuid, ref_code, name, age, gender_identity, contact,
  barangay, organization, sectoral_group, status, registered_at, attended_at
)
select
  r.id,
  r.activity_id,
  r.user_uuid,
  r.ref_code,
  coalesce(nullif(trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)), ''), 'Participant'),
  p.age,
  coalesce(p.gender_identity, ''),
  coalesce(p.contact, ''),
  coalesce(p.barangay, ''),
  coalesce(p.organization, ''),
  coalesce(p.sectoral_group, ''),
  r.status,
  r.registered_at,
  r.attended_at
from public.registrations r
join public.participants p on p.user_uuid = r.user_uuid
on conflict (id) do nothing;

insert into public.budget_entries (activity_id, category, description, amount, entry_type, recorded_at, recorded_by)
select activity_id, 'Initial Budget', 'Migrated allocation from the existing activity budget',
  allocated_amount, 'allocation', updated_at, updated_by::text
from public.activity_budgets
where allocated_amount > 0;

insert into public.budget_entries (activity_id, category, description, amount, entry_type, recorded_at, recorded_by)
select activity_id, category, description, amount, 'expense',
  expense_date::timestamp at time zone 'UTC', recorded_by::text
from public.activity_expenses;

insert into public.evaluations (
  registration_id, activity_id, rating, feedback, would_recommend, responses, submitted_at
)
select
  r.id,
  e.activity_id,
  e.rating,
  concat_ws(E'\n\nRecommendation: ', nullif(e.feedback, ''), nullif(e.recommendation, '')),
  false,
  jsonb_build_object('migrated_from_prime', true),
  e.submitted_at
from public.activity_evaluations e
join public.registrations r on r.activity_id = e.activity_id and r.user_uuid = e.participant_id
on conflict (registration_id) do nothing;

update public.legacy_activities a
set taken = counts.registered_count,
    status = case
      when a.slots > 0 and counts.registered_count >= a.slots then 'full'
      else a.status
    end
from (
  select activity_id, count(*)::integer as registered_count
  from public.registrations
  where status <> 'inactive'
  group by activity_id
) counts
where counts.activity_id = a.id;

create or replace function public.is_legacy_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_uuid = (select auth.uid()) and role = 'superadmin'
  );
$$;

create or replace function public.is_legacy_facilitator_for_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.facilitators f
    join public.activity_facilitators af on af.facilitator_id = f.id
    where f.user_uuid = (select auth.uid())
      and af.activity_id = p_activity_id
  );
$$;

create or replace function public.close_expired_legacy_activities()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'Asia/Manila';
begin
  update public.legacy_activities
  set status = 'closed'
  where status <> 'closed'
    and (
      end_date < v_now::date
      or (end_date = v_now::date and end_time is not null and end_time < v_now::time)
    );
end;
$$;

create or replace function public.set_legacy_activity_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists legacy_activities_updated_at on public.legacy_activities;
create trigger legacy_activities_updated_at
  before update on public.legacy_activities
  for each row execute function public.set_legacy_activity_updated_at();

create or replace function public.sync_legacy_registration_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.registration_details
  set status = new.status, attended_at = new.attended_at
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists registrations_sync_details on public.registrations;
create trigger registrations_sync_details
  after update of status, attended_at on public.registrations
  for each row execute function public.sync_legacy_registration_details();

create or replace function public.register_participant(p_activity_id uuid)
returns table (success boolean, message text, ref_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_participant public.participants%rowtype;
  v_activity public.legacy_activities%rowtype;
  v_registration_id uuid;
  v_ref_code text;
  v_name text;
  v_registered_count integer;
  v_existing_status text;
  v_existing_registration boolean := false;
begin
  if v_user_id is null then
    return query select false, 'Please login first.', null::text;
    return;
  end if;

  select * into v_participant
  from public.participants
  where user_uuid = v_user_id;

  if not found then
    return query select false, 'Please complete your profile before registering.', null::text;
    return;
  end if;
  if v_participant.first_name is null
    or v_participant.last_name is null
    or v_participant.birthday is null
    or v_participant.gender_identity is null
    or v_participant.contact is null
    or v_participant.barangay is null
    or v_participant.city_municipality is null
    or v_participant.province is null
    or v_participant.youth_classification is null then
    return query select false, 'Please complete your profile before registering.', null::text;
    return;
  end if;

  select * into v_activity
  from public.legacy_activities
  where id = p_activity_id
  for update;

  if not found then
    return query select false, 'Activity not found.', null::text;
    return;
  end if;

  if v_activity.status not in ('open', 'upcoming') or v_activity.start_date < current_date then
    return query select false, 'Registration is closed for this activity.', null::text;
    return;
  end if;

  select id, status into v_registration_id, v_existing_status
  from public.registrations
  where activity_id = p_activity_id and user_uuid = v_user_id
  for update;

  if found then
    v_existing_registration := true;
    if v_existing_status <> 'inactive' then
      return query select false, 'You are already registered for this activity.', null::text;
      return;
    end if;
  else
    v_registration_id := gen_random_uuid();
  end if;

  select count(*) into v_registered_count
  from public.registrations
  where activity_id = p_activity_id and status <> 'inactive';

  if v_activity.slots > 0 and v_registered_count >= v_activity.slots then
    update public.legacy_activities set status = 'full', taken = v_registered_count where id = p_activity_id;
    return query select false, 'This activity is full.', null::text;
    return;
  end if;

  v_ref_code := 'PM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_name := concat_ws(' ', v_participant.first_name, v_participant.middle_name, v_participant.last_name, v_participant.suffix);

  if v_existing_registration then
    update public.registrations
    set ref_code = v_ref_code, status = 'registered', registered_at = now(),
      attended_at = null, cancel_reason = null
    where id = v_registration_id;

    update public.registration_details
    set ref_code = v_ref_code, name = v_name, age = v_participant.age,
      gender_identity = v_participant.gender_identity, contact = v_participant.contact,
      barangay = v_participant.barangay, organization = coalesce(v_participant.organization, ''),
      sectoral_group = coalesce(v_participant.sectoral_group, ''), status = 'registered',
      registered_at = now(), attended_at = null, notes = ''
    where id = v_registration_id;
  else
    insert into public.registrations (id, activity_id, user_uuid, ref_code)
    values (v_registration_id, p_activity_id, v_user_id, v_ref_code);

    insert into public.registration_details (
      id, activity_id, user_uuid, ref_code, name, age, gender_identity, contact,
      barangay, organization, sectoral_group
    )
    values (
      v_registration_id, p_activity_id, v_user_id, v_ref_code, v_name, v_participant.age,
      v_participant.gender_identity, v_participant.contact, v_participant.barangay,
      coalesce(v_participant.organization, ''), coalesce(v_participant.sectoral_group, '')
    );
  end if;

  update public.legacy_activities
  set taken = v_registered_count + 1,
      status = case when slots > 0 and v_registered_count + 1 >= slots then 'full' else status end
  where id = p_activity_id;

  return query select true, 'Registration successful.', v_ref_code;
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
  select r.id, r.activity_id, a.title, a.color_bg, r.status, r.registered_at,
    (a.start_date::timestamp - interval '24 hours') at time zone 'UTC',
    r.status = 'registered'
      and (a.start_date::timestamp - interval '24 hours') at time zone 'UTC' > now()
  from public.registrations r
  join public.legacy_activities a on a.id = r.activity_id
  where r.user_uuid = (select auth.uid())
  order by r.registered_at desc;
$$;

create or replace function public.cancel_registration(p_registration_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_start_date date;
begin
  select * into v_registration
  from public.registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;
  if v_registration.user_uuid <> (select auth.uid()) then
    raise exception 'NOT_OWNER';
  end if;
  if v_registration.status <> 'registered' then
    raise exception 'NOT_CANCELLABLE';
  end if;

  select start_date into v_start_date
  from public.legacy_activities
  where id = v_registration.activity_id;

  if (v_start_date::timestamp - interval '24 hours') at time zone 'UTC' <= now() then
    raise exception 'CUTOFF_PASSED';
  end if;

  update public.registrations
  set status = 'inactive', cancel_reason = left(coalesce(p_reason, ''), 300)
  where id = p_registration_id;

  update public.legacy_activities a
  set taken = greatest(0, a.taken - 1),
      status = case when a.status = 'full' then 'open' else a.status end
  where a.id = v_registration.activity_id;
end;
$$;

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
  if v_registration.status not in ('attended', 'completed') then
    raise exception 'Evaluation is available after attendance is recorded.';
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

create or replace view public.public_legacy_activity_counts as
select r.activity_id, count(*)::integer as registration_count
from public.registrations r
join public.legacy_activities a on a.id = r.activity_id
where r.status <> 'inactive' and a.status <> 'closed'
group by r.activity_id;

alter table public.legacy_activities enable row level security;
alter table public.participants enable row level security;
alter table public.admin_users enable row level security;
alter table public.facilitators enable row level security;
alter table public.activity_facilitators enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_details enable row level security;
alter table public.attendance_log enable row level security;
alter table public.budget_entries enable row level security;
alter table public.evaluations enable row level security;

drop policy if exists "Legacy public programs read" on public.programs;
create policy "Legacy public programs read"
  on public.programs for select to anon using (true);

create policy "Legacy activities are public or assigned"
  on public.legacy_activities for select to anon, authenticated
  using (
    status <> 'closed'
    or (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(id))
  );
create policy "Legacy admins manage activities"
  on public.legacy_activities for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

create policy "Participants read own profile"
  on public.participants for select to authenticated
  using (user_uuid = (select auth.uid()) or (select public.is_legacy_admin()));
create policy "Participants create own profile"
  on public.participants for insert to authenticated
  with check (user_uuid = (select auth.uid()));
create policy "Participants update own profile"
  on public.participants for update to authenticated
  using (user_uuid = (select auth.uid()) or (select public.is_legacy_admin()))
  with check (user_uuid = (select auth.uid()) or (select public.is_legacy_admin()));

create policy "Users and admins read legacy account roles"
  on public.admin_users for select to authenticated
  using (user_uuid = (select auth.uid()) or (select public.is_legacy_admin()));
create policy "Admins manage legacy account roles"
  on public.admin_users for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

create policy "Admins and assigned facilitators read facilitators"
  on public.facilitators for select to authenticated
  using (
    (select public.is_legacy_admin())
    or user_uuid = (select auth.uid())
  );
create policy "Admins manage facilitators"
  on public.facilitators for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

create policy "Admins and assigned facilitators read activity assignments"
  on public.activity_facilitators for select to authenticated
  using (
    (select public.is_legacy_admin())
    or exists (
      select 1 from public.facilitators f
      where f.id = facilitator_id and f.user_uuid = (select auth.uid())
    )
  );
create policy "Admins manage activity assignments"
  on public.activity_facilitators for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

create policy "Owners and assigned staff read registrations"
  on public.registrations for select to authenticated
  using (
    user_uuid = (select auth.uid())
    or (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );
create policy "Legacy admins manage registrations"
  on public.registrations for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));
create policy "Assigned facilitators update registration attendance"
  on public.registrations for update to authenticated
  using ((select public.is_legacy_facilitator_for_activity(activity_id)))
  with check ((select public.is_legacy_facilitator_for_activity(activity_id)));

create policy "Owners and assigned staff read registration details"
  on public.registration_details for select to authenticated
  using (
    user_uuid = (select auth.uid())
    or (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );
create policy "Legacy admins manage registration details"
  on public.registration_details for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

create policy "Assigned staff read and record attendance"
  on public.attendance_log for select to authenticated
  using (
    (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );
create policy "Assigned staff record attendance"
  on public.attendance_log for insert to authenticated
  with check (
    (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );

create policy "Admins manage budget entries"
  on public.budget_entries for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

create policy "Admins and assigned facilitators read evaluations"
  on public.evaluations for select to authenticated
  using (
    (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(activity_id))
  );
create policy "Admins manage evaluations"
  on public.evaluations for all to authenticated
  using ((select public.is_legacy_admin()))
  with check ((select public.is_legacy_admin()));

grant select on public.programs, public.legacy_activities to anon, authenticated;
grant select on public.public_legacy_activity_counts to anon, authenticated;
grant select, insert, update, delete on public.legacy_activities to authenticated;
grant select, insert, update, delete on public.participants, public.admin_users, public.facilitators,
  public.activity_facilitators to authenticated;
grant select, update (status, attended_at) on public.registrations to authenticated;
grant select on public.registration_details to authenticated;
grant select, insert on public.attendance_log to authenticated;
grant select, insert, update, delete on public.budget_entries to authenticated;
grant select on public.evaluations to authenticated;
grant execute on function public.register_participant(uuid) to authenticated;
grant execute on function public.get_my_registrations() to authenticated;
grant execute on function public.cancel_registration(uuid, text) to authenticated;
grant execute on function public.submit_legacy_evaluation(text, smallint, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.close_expired_legacy_activities() to anon, authenticated;

insert into public.admin_users (user_uuid, email, display_name, role)
select p.id, coalesce(u.email, ''), p.full_name, 'superadmin'
from public.profiles p
join auth.users u on u.id = p.id
where p.role in ('admin', 'staff')
on conflict (user_uuid) do nothing;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['legacy_activities', 'registrations', 'attendance_log', 'evaluations']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;
