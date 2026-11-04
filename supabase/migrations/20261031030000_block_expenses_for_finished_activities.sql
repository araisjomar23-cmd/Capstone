-- Enforce the same activity status rule even for stale clients and direct inserts.
create or replace function public.guard_activity_expense_recording()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_activity public.legacy_activities%rowtype;
begin
  if new.entry_type <> 'expense' then
    return new;
  end if;

  select * into v_activity from public.legacy_activities
    where id = new.activity_id for update;
  if found and (
    v_activity.manually_closed or v_activity.status = 'closed'
    or public.activity_lifecycle(v_activity.start_date, v_activity.start_time, v_activity.end_date, v_activity.end_time) = 'completed'
  ) then
    raise exception 'Expenses cannot be recorded for closed or completed activities.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_activity_expense_recording() from public, anon, authenticated;

create trigger budget_entries_guard_activity_expense_recording
  before insert on public.budget_entries
  for each row execute function public.guard_activity_expense_recording();
