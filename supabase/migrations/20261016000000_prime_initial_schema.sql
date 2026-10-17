-- Initial PRIME schema, applied before the feature migrations.
create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'staff', 'participant');
create type public.program_status as enum ('Planning', 'Ongoing', 'Completed');
create type public.activity_status as enum ('Upcoming', 'Ongoing', 'Completed');
create type public.feedback_status as enum ('Open', 'In review', 'Resolved');
create type public.feedback_type as enum ('Feedback', 'Grievance');
create type public.learning_status as enum ('To apply', 'In progress', 'Applied');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'participant',
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  status public.program_status not null default 'Planning',
  start_date date,
  end_date date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  activity_date date not null,
  location text not null default '',
  target_participants integer not null default 0 check (target_participants >= 0),
  status public.activity_status not null default 'Upcoming',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  unit text not null default 'people',
  target numeric(12, 2) not null default 0 check (target >= 0),
  current_value numeric(12, 2) not null default 0 check (current_value >= 0),
  updated_at timestamptz not null default now()
);

create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  type public.feedback_type not null,
  subject text not null check (char_length(subject) between 1 and 160),
  message text not null check (char_length(message) between 1 and 5000),
  status public.feedback_status not null default 'Open',
  is_anonymous boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now()
);

create table public.learning_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  insight text not null check (char_length(insight) between 1 and 5000),
  action text not null default '',
  status public.learning_status not null default 'To apply',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  participant_id uuid not null references public.profiles (id) on delete cascade,
  attendance_status text not null check (attendance_status in ('Present', 'Absent')),
  recorded_at timestamptz not null default now(),
  unique (activity_id, participant_id)
);

create index activities_program_id_idx on public.activities (program_id);
create index activities_activity_date_idx on public.activities (activity_date);
create index indicators_program_id_idx on public.indicators (program_id);
create index feedback_reports_submitted_at_idx on public.feedback_reports (submitted_at desc);
create index attendance_activity_id_idx on public.attendance (activity_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'participant'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('staff', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.programs enable row level security;
alter table public.activities enable row level security;
alter table public.indicators enable row level security;
alter table public.feedback_reports enable row level security;
alter table public.learning_notes enable row level security;
alter table public.attendance enable row level security;

create policy "Users read their own profile or staff read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff_or_admin()));
create policy "Authenticated users read programs"
  on public.programs for select to authenticated using (true);
create policy "Staff manage programs"
  on public.programs for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

create policy "Authenticated users read activities"
  on public.activities for select to authenticated using (true);
create policy "Staff manage activities"
  on public.activities for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

create policy "Authenticated users read indicators"
  on public.indicators for select to authenticated using (true);
create policy "Staff manage indicators"
  on public.indicators for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

create policy "Anonymous visitors submit feedback"
  on public.feedback_reports for insert to anon
  with check (created_by is null and is_anonymous and status = 'Open');
create policy "Authenticated users submit feedback"
  on public.feedback_reports for insert to authenticated
  with check (
    status = 'Open'
    and (
      (is_anonymous and created_by is null)
      or (not is_anonymous and created_by = (select auth.uid()))
    )
  );
create policy "Staff read and manage feedback"
  on public.feedback_reports for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

create policy "Staff manage learning notes"
  on public.learning_notes for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

create policy "Participants read their attendance and staff manage attendance"
  on public.attendance for select to authenticated
  using (participant_id = (select auth.uid()) or (select public.is_staff_or_admin()));
create policy "Staff manage attendance"
  on public.attendance for all to authenticated
  using ((select public.is_staff_or_admin()))
  with check ((select public.is_staff_or_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.programs, public.activities, public.indicators to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.programs, public.activities, public.indicators to authenticated;
grant select, insert, update, delete on public.feedback_reports, public.learning_notes, public.attendance to authenticated;
grant insert on public.feedback_reports to anon;
