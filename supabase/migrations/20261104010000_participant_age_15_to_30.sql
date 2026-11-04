-- Match participant onboarding's inclusive age range.
alter table public.participants drop constraint if exists participants_age_check;
alter table public.participants add constraint participants_age_check
  check (age is null or age between 15 and 30);

-- Require a valid age on new profiles and prevent birthday/age mismatches.
create or replace function public.validate_participant_age()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_age integer;
begin
  if new.birthday is not null then
    v_age := extract(year from age((now() at time zone 'Asia/Manila')::date, new.birthday));
    if v_age < 15 or v_age > 30 then
      raise exception 'Participants must be 15–30 years old. Please double-check your birthday.';
    end if;
    new.age := v_age;
  elsif new.age is null or new.age < 15 or new.age > 30 then
    raise exception 'Participant age is required and must be between 15 and 30.';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_participant_age() from public, anon, authenticated;
drop trigger if exists participants_validate_age on public.participants;
create trigger participants_validate_age
  before insert or update of birthday, age on public.participants
  for each row execute function public.validate_participant_age();
