-- Allow facilitator portals to receive live changes to their assigned activities.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'activity_facilitators'
    ) then
    alter publication supabase_realtime add table public.activity_facilitators;
  end if;
end;
$$;
