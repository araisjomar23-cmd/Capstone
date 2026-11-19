-- The organization follows its ten established programs. Activity imports
-- may match/select existing programs but must never extend the catalog.
-- Keep the old RPC callable so older clients receive a clear explanation.
create or replace function public.ensure_ppa_program(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not public.is_legacy_admin() then raise exception 'Administrator access required.'; end if;
  raise exception 'CYDO follows 10 established programs. Select the appropriate existing program for this activity; new programs cannot be created.';
end; $$;
revoke insert,update,delete on public.programs from anon,authenticated;
revoke all on function public.ensure_ppa_program(text) from public,anon;
