-- Keep participant-facing identity fields consistent across all registrations.
-- Registration status, attendance, reference codes and timestamps remain unchanged.
alter table public.registration_details
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists suffix text,
  add column if not exists city_municipality text,
  add column if not exists province text;

create or replace function public.sync_participant_registration_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.registration_details d
  set name = coalesce(nullif(trim(concat_ws(' ', new.first_name, new.middle_name, new.last_name, new.suffix)), ''), d.name),
      first_name = new.first_name, middle_name = new.middle_name,
      last_name = new.last_name, suffix = new.suffix,
      age = new.age, gender_identity = coalesce(new.gender_identity, ''),
      contact = coalesce(new.contact, ''), barangay = coalesce(new.barangay, ''),
      city_municipality = new.city_municipality, province = new.province,
      organization = coalesce(new.organization, ''), sectoral_group = coalesce(new.sectoral_group, '')
  where d.user_uuid = new.user_uuid;
  return new;
end;
$$;
revoke all on function public.sync_participant_registration_profile() from public, anon, authenticated;
drop trigger if exists participants_sync_registration_profile on public.participants;
create trigger participants_sync_registration_profile
after update of first_name, middle_name, last_name, suffix, age, gender_identity,
  contact, barangay, city_municipality, province, organization, sectoral_group
on public.participants for each row
when (old.* is distinct from new.*)
execute function public.sync_participant_registration_profile();

-- Populate structured fields on every newly created registration as well.
create or replace function public.populate_registration_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare p public.participants%rowtype;
begin
  select * into p from public.participants where user_uuid = new.user_uuid;
  if found then
    new.name := coalesce(nullif(trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)), ''), new.name);
    new.first_name := p.first_name; new.middle_name := p.middle_name;
    new.last_name := p.last_name; new.suffix := p.suffix;
    new.age := p.age; new.gender_identity := coalesce(p.gender_identity, '');
    new.contact := coalesce(p.contact, ''); new.barangay := coalesce(p.barangay, '');
    new.city_municipality := p.city_municipality; new.province := p.province;
    new.organization := coalesce(p.organization, ''); new.sectoral_group := coalesce(p.sectoral_group, '');
  end if;
  return new;
end;
$$;
revoke all on function public.populate_registration_profile() from public, anon, authenticated;
drop trigger if exists registration_details_populate_profile on public.registration_details;
create trigger registration_details_populate_profile before insert on public.registration_details
for each row execute function public.populate_registration_profile();

update public.registration_details d
set name = coalesce(nullif(trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix)), ''), d.name),
    first_name = p.first_name, middle_name = p.middle_name, last_name = p.last_name, suffix = p.suffix,
    age = p.age, gender_identity = coalesce(p.gender_identity, ''), contact = coalesce(p.contact, ''),
    barangay = coalesce(p.barangay, ''), city_municipality = p.city_municipality, province = p.province,
    organization = coalesce(p.organization, ''), sectoral_group = coalesce(p.sectoral_group, '')
from public.participants p where p.user_uuid = d.user_uuid;

do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['participants', 'registration_details'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
