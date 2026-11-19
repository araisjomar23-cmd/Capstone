-- One editable post-activity report per activity, shared by administrators.
-- These are report snapshots; editing them never changes operational records.
create table public.activity_post_reports (
  activity_id uuid primary key references public.legacy_activities(id),
  fields jsonb not null check (jsonb_typeof(fields) = 'object' and octet_length(fields::text) <= 100000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.activity_post_reports enable row level security;
create policy "Admins read post reports" on public.activity_post_reports
  for select to authenticated using ((select public.is_legacy_admin()));
create policy "Admins create post reports" on public.activity_post_reports
  for insert to authenticated with check ((select public.is_legacy_admin()));
create policy "Admins update post reports" on public.activity_post_reports
  for update to authenticated using ((select public.is_legacy_admin())) with check ((select public.is_legacy_admin()));
revoke all on public.activity_post_reports from public, anon, authenticated;
grant select, insert, update on public.activity_post_reports to authenticated;
