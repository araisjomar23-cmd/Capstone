alter table public.programs
  alter column created_by drop not null;

alter table public.activities
  alter column program_id set not null;

drop policy if exists "Staff manage programs" on public.programs;
revoke insert, update, delete on public.programs from authenticated;

insert into public.programs (id, name, description, status, created_by)
values
  ('00000000-0000-4000-8000-000000000001', 'Health', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000002', 'Education', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000003', 'Economic Empowerment', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000004', 'Social Inclusion and Equity', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000005', 'Peace Building and Security', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000006', 'Governance', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000007', 'Active Citizenship', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000008', 'Environment', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000009', 'Global Mobility', '', 'Ongoing', null),
  ('00000000-0000-4000-8000-000000000010', 'Agriculture', '', 'Ongoing', null)
on conflict (id) do nothing;
