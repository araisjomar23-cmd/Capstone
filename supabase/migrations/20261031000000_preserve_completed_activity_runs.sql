-- Each repeat is a separate activity, with its own registrations and budget.
alter table public.legacy_activities
  add column if not exists previous_activity_id uuid references public.legacy_activities(id) on delete restrict;
create index if not exists legacy_activities_previous_activity_idx on public.legacy_activities(previous_activity_id);

-- Keep archived schedules stable even when an older client tries to reopen them.
create or replace function public.guard_completed_activity_schedule()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.activity_lifecycle(old.start_date, old.start_time, old.end_date, old.end_time) = 'completed'
    and (new.start_date, new.start_time, new.end_date, new.end_time)
      is distinct from (old.start_date, old.start_time, old.end_date, old.end_time) then
    raise exception 'Completed activity dates are archived. Create a new activity run instead.';
  end if;
  return new;
end;
$$;
drop trigger if exists legacy_activities_preserve_completed_schedule on public.legacy_activities;
create trigger legacy_activities_preserve_completed_schedule
  before update of start_date, start_time, end_date, end_time on public.legacy_activities
  for each row execute function public.guard_completed_activity_schedule();
revoke all on function public.guard_completed_activity_schedule() from public, anon, authenticated;

-- Completed activities remain readable in public and participant history.
grant execute on function public.activity_lifecycle(date, time, date, time) to anon;
drop policy if exists "Legacy activities are public or assigned" on public.legacy_activities;
create policy "Legacy activities are public or assigned"
  on public.legacy_activities for select to anon, authenticated
  using (
    status <> 'closed'
    or public.activity_lifecycle(start_date, start_time, end_date, end_time) = 'completed'
    or (select public.is_legacy_admin())
    or (select public.is_legacy_facilitator_for_activity(id))
  );

-- Keep aggregate counts visible for completed runs, without exposing participant rows.
create or replace view public.public_legacy_activity_counts as
select r.activity_id, count(*)::integer as registration_count
from public.registrations r
join public.legacy_activities a on a.id = r.activity_id
where r.status <> 'inactive'
  and (a.status <> 'closed' or public.activity_lifecycle(a.start_date, a.start_time, a.end_date, a.end_time) = 'completed')
group by r.activity_id;
