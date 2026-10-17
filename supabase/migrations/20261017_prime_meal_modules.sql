create table if not exists public.participant_details (
  participant_id uuid primary key references public.profiles (id) on delete cascade,
  age_group text check (age_group is null or age_group in ('15-17', '18-24', '25-30', 'Prefer not to say')),
  barangay text not null default '' check (char_length(barangay) <= 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  participant_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'Registered'
    check (status in ('Registered', 'Active', 'Completed', 'Withdrawn')),
  registered_at timestamptz not null default now(),
  unique (program_id, participant_id)
);

create table if not exists public.activity_registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  participant_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'Registered'
    check (status in ('Registered', 'Attended', 'Evaluated', 'Cancelled')),
  registered_at timestamptz not null default now(),
  unique (activity_id, participant_id)
);

create table if not exists public.activity_qr_tokens (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles (id),
  generated_at timestamptz not null default now()
);

create table if not exists public.activity_budgets (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  allocated_amount numeric(12, 2) not null default 0 check (allocated_amount >= 0),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_expenses (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_evaluations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  participant_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text not null default '' check (char_length(feedback) <= 3000),
  recommendation text not null default '' check (char_length(recommendation) <= 3000),
  submitted_at timestamptz not null default now(),
  unique (activity_id, participant_id)
);

create index if not exists program_enrollments_participant_idx
  on public.program_enrollments (participant_id, registered_at desc);
create index if not exists activity_registrations_participant_idx
  on public.activity_registrations (participant_id, registered_at desc);
create index if not exists activity_expenses_activity_date_idx
  on public.activity_expenses (activity_id, expense_date desc);
create index if not exists activity_evaluations_activity_idx
  on public.activity_evaluations (activity_id, submitted_at desc);

alter table public.participant_details enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.activity_registrations enable row level security;
alter table public.activity_qr_tokens enable row level security;
alter table public.activity_budgets enable row level security;
alter table public.activity_expenses enable row level security;
alter table public.activity_evaluations enable row level security;

drop policy if exists "Participants and staff read participant details" on public.participant_details;
create policy "Participants and staff read participant details"
  on public.participant_details for select to authenticated
  using (participant_id = (select auth.uid()) or (select public.is_staff_or_admin()));
drop policy if exists "Participants manage own details" on public.participant_details;
create policy "Participants manage own details"
  on public.participant_details for all to authenticated
  using (participant_id = (select auth.uid()))
  with check (participant_id = (select auth.uid()));
drop policy if exists "Staff manage participant details" on public.participant_details;
create policy "Staff manage participant details"
  on public.participant_details for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

drop policy if exists "Participants and staff read program enrollments" on public.program_enrollments;
create policy "Participants and staff read program enrollments"
  on public.program_enrollments for select to authenticated
  using (participant_id = (select auth.uid()) or (select public.is_staff_or_admin()));
drop policy if exists "Participants enroll in open programs" on public.program_enrollments;
create policy "Participants enroll in open programs"
  on public.program_enrollments for insert to authenticated
  with check (
    participant_id = (select auth.uid())
    and exists (
      select 1 from public.programs p
      where p.id = program_id
        and p.status in ('Planning', 'Ongoing')
        and (p.end_date is null or p.end_date >= current_date)
    )
    and status = 'Registered'
  );
drop policy if exists "Participants withdraw from own programs" on public.program_enrollments;
drop policy if exists "Participants manage their own enrollment" on public.program_enrollments;
create policy "Participants manage their own enrollment"
  on public.program_enrollments for update to authenticated
  using (participant_id = (select auth.uid()) and status in ('Registered', 'Withdrawn'))
  with check (participant_id = (select auth.uid()) and status in ('Registered', 'Withdrawn'));
drop policy if exists "Staff manage program enrollments" on public.program_enrollments;
create policy "Staff manage program enrollments"
  on public.program_enrollments for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

drop policy if exists "Participants and staff read activity registrations" on public.activity_registrations;
create policy "Participants and staff read activity registrations"
  on public.activity_registrations for select to authenticated
  using (participant_id = (select auth.uid()) or (select public.is_staff_or_admin()));
drop policy if exists "Participants register for activities" on public.activity_registrations;
create policy "Participants register for activities"
  on public.activity_registrations for insert to authenticated
  with check (
    participant_id = (select auth.uid())
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and a.status = 'Upcoming' and a.activity_date >= current_date
    )
    and status = 'Registered'
  );
drop policy if exists "Participants cancel their own activity registration" on public.activity_registrations;
create policy "Participants cancel their own activity registration"
  on public.activity_registrations for update to authenticated
  using (participant_id = (select auth.uid()) and status = 'Registered')
  with check (participant_id = (select auth.uid()) and status = 'Cancelled');
drop policy if exists "Staff manage activity registrations" on public.activity_registrations;
create policy "Staff manage activity registrations"
  on public.activity_registrations for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

drop policy if exists "Staff manage activity QR tokens" on public.activity_qr_tokens;
create policy "Staff manage activity QR tokens"
  on public.activity_qr_tokens for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

drop policy if exists "Staff manage activity budgets" on public.activity_budgets;
create policy "Staff manage activity budgets"
  on public.activity_budgets for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

drop policy if exists "Staff manage activity expenses" on public.activity_expenses;
create policy "Staff manage activity expenses"
  on public.activity_expenses for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

drop policy if exists "Participants and staff read activity evaluations" on public.activity_evaluations;
create policy "Participants and staff read activity evaluations"
  on public.activity_evaluations for select to authenticated
  using (participant_id = (select auth.uid()) or (select public.is_staff_or_admin()));
drop policy if exists "Attendees submit one activity evaluation" on public.activity_evaluations;
create policy "Attendees submit one activity evaluation"
  on public.activity_evaluations for insert to authenticated
  with check (
    participant_id = (select auth.uid())
    and exists (
      select 1 from public.attendance at
      where at.activity_id = activity_evaluations.activity_id
        and at.participant_id = (select auth.uid())
        and at.attendance_status = 'Present'
    )
  );
drop policy if exists "Staff manage activity evaluations" on public.activity_evaluations;
create policy "Staff manage activity evaluations"
  on public.activity_evaluations for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

create or replace function public.check_in_with_qr(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before checking in.';
  end if;

  select a.id
    into v_activity_id
    from public.activity_qr_tokens q
    join public.activities a on a.id = q.activity_id
    where q.token = p_token
      and a.activity_date = current_date
      and a.status = 'Ongoing';

  if v_activity_id is null then
    raise exception 'This QR code is invalid or is not active for today.';
  end if;

  if not exists (
    select 1 from public.activity_registrations r
    where r.activity_id = v_activity_id
      and r.participant_id = (select auth.uid())
      and r.status = 'Registered'
  ) and not exists (
    select 1
      from public.activities a
      join public.program_enrollments e on e.program_id = a.program_id
      where a.id = v_activity_id
        and e.participant_id = (select auth.uid())
        and e.status in ('Registered', 'Active')
  ) then
    raise exception 'Register for this activity or its program before checking in.';
  end if;

  insert into public.attendance (activity_id, participant_id, attendance_status)
  values (v_activity_id, (select auth.uid()), 'Present')
  on conflict (activity_id, participant_id)
  do update set attendance_status = 'Present', recorded_at = now();

  update public.activity_registrations
    set status = 'Attended'
    where activity_id = v_activity_id
      and participant_id = (select auth.uid())
      and status = 'Registered';

  return v_activity_id;
end;
$$;

revoke all on function public.check_in_with_qr(text) from public, anon;
grant execute on function public.check_in_with_qr(text) to authenticated;

grant select, insert, update on public.participant_details to authenticated;
grant select, insert, update, delete on public.program_enrollments, public.activity_registrations to authenticated;
grant select, insert, update, delete on public.activity_qr_tokens to authenticated;
grant select, insert, update, delete on public.activity_budgets, public.activity_expenses to authenticated;
grant select, insert, update, delete on public.activity_evaluations to authenticated;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'profiles',
      'programs',
      'activities',
      'indicators',
      'attendance',
      'feedback_reports',
      'learning_notes',
      'participant_details',
      'program_enrollments',
      'activity_registrations',
      'activity_qr_tokens',
      'activity_budgets',
      'activity_expenses',
      'activity_evaluations'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
