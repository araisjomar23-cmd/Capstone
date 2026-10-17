create or replace view public.public_program_catalog
with (security_barrier = true)
as
select id, name
from public.programs;

grant select on public.public_program_catalog to anon, authenticated;
