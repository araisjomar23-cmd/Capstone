-- Expose only facilitator display names and the total allocation, not staff accounts or transactions.
create or replace function public.get_activity_delivery_details(p_activity_id uuid)
returns table (facilitators text[], allocated_budget numeric)
language sql stable security definer set search_path = ''
as $$
  select
    array(select f.name from public.activity_facilitators af
      join public.facilitators f on f.id = af.facilitator_id
      where af.activity_id = a.id order by f.name),
    coalesce((select sum(b.amount) from public.budget_entries b
      where b.activity_id = a.id and b.entry_type = 'allocation'), 0)
  from public.legacy_activities a
  where a.id = p_activity_id and (select auth.uid()) is not null
    and (a.status <> 'closed' or public.is_legacy_admin()
      or public.is_legacy_facilitator_for_activity(a.id)
      or exists (select 1 from public.registrations r
        where r.activity_id = a.id and r.user_uuid = (select auth.uid())));
$$;
revoke all on function public.get_activity_delivery_details(uuid) from public, anon;
grant execute on function public.get_activity_delivery_details(uuid) to authenticated;
