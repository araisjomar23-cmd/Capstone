-- Persistent inboxes are private to their recipient. Only database triggers create
-- notifications; clients can only read their inbox and change its read timestamp.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.legacy_activities(id) on delete set null,
  kind text not null check (kind in ('registration', 'activity', 'assignment', 'attendance', 'evaluation')),
  title text not null,
  message text not null,
  link text not null check (link like '/%' and link not like '//%'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_inbox_idx on public.notifications(recipient_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications(recipient_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy "Read own notifications" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Mark own notifications read" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create function public.notify_activity_staff(p_activity uuid, p_kind text, p_title text, p_message text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(recipient_id, activity_id, kind, title, message, link)
  select recipients.user_id, p_activity, p_kind, p_title, p_message,
    case when recipients.role = 'superadmin' then
      case p_kind when 'evaluation' then '/admin/evaluations' when 'activity' then '/admin/activities' else '/admin/participants' end
    else case p_kind when 'activity' then '/admin/facilitator-portal' else '/admin/facilitator-portal/participants' end end
  from (
    select a.user_uuid as user_id, a.role from public.admin_users a where a.role = 'superadmin'
    union
    select f.user_uuid, a.role from public.activity_facilitators af
      join public.facilitators f on f.id = af.facilitator_id
      join public.admin_users a on a.user_uuid = f.user_uuid and a.role = 'facilitator'
      where af.activity_id = p_activity
  ) recipients
  where recipients.user_id is distinct from auth.uid();
$$;
revoke all on function public.notify_activity_staff(uuid, text, text, text) from public, anon, authenticated;

create function public.notify_portal_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  activity_title text;
  participant_user uuid;
  facilitator_user uuid;
  event_title text;
  event_message text;
begin
  if tg_table_name = 'legacy_activities' then
    if tg_op = 'INSERT' then
      if new.status in ('open', 'upcoming') and not new.manually_closed
        and new.end_date >= (now() at time zone 'Asia/Manila')::date then
        insert into public.notifications(recipient_id, activity_id, kind, title, message, link)
          select p.user_uuid, new.id, 'activity', 'New youth activity',
            format('"%s" is now available. View the activity and register to take part.', new.title),
            '/participant'
          from public.participants p
          where not exists(select 1 from public.admin_users a where a.user_uuid = p.user_uuid);
      end if;
      return new;
    end if;
    -- Counters and automatic open/full transitions must not flood inboxes.
    if row(new.title, new.start_date, new.end_date, new.start_time, new.end_time, new.venue, new.manually_closed, new.note)
      is not distinct from
      row(old.title, old.start_date, old.end_date, old.start_time, old.end_time, old.venue, old.manually_closed, old.note) then
      return new;
    end if;
    event_title := case when new.manually_closed and not old.manually_closed then 'Activity closed'
      when old.manually_closed and not new.manually_closed then 'Activity reopened' else 'Activity details updated' end;
    event_message := case when new.manually_closed and not old.manually_closed
      then format('Registration for "%s" has been closed. Review your activity for details.', new.title)
      else format('The schedule, venue, or details for "%s" have changed. Review the latest activity information.', new.title) end;
    insert into public.notifications(recipient_id, activity_id, kind, title, message, link)
      select r.user_uuid, new.id, 'activity', event_title, event_message, '/participant/my-activities'
      from public.registrations r where r.activity_id = new.id and r.status <> 'inactive';
    perform public.notify_activity_staff(new.id, 'activity', event_title, event_message);
    return new;
  end if;

  if tg_table_name = 'activity_facilitators' then
    if tg_op = 'DELETE' then
      select title into activity_title from public.legacy_activities where id = old.activity_id;
      select user_uuid into facilitator_user from public.facilitators where id = old.facilitator_id;
    else
      select title into activity_title from public.legacy_activities where id = new.activity_id;
      select user_uuid into facilitator_user from public.facilitators where id = new.facilitator_id;
    end if;
    if facilitator_user is not null and activity_title is not null then
      insert into public.notifications(recipient_id, activity_id, kind, title, message, link)
      values (facilitator_user, case when tg_op = 'DELETE' then old.activity_id else new.activity_id end,
        'assignment', case when tg_op = 'DELETE' then 'Activity assignment removed' else 'New activity assignment' end,
        case when tg_op = 'DELETE' then format('You are no longer assigned to "%s".', activity_title)
          else format('You have been assigned to "%s". Review your dashboard for its schedule and participants.', activity_title) end,
        '/admin/facilitator-portal');
    end if;
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select title into activity_title from public.legacy_activities where id = new.activity_id;
  if tg_table_name = 'registrations' then
    if tg_op = 'UPDATE' then
      if new.status = old.status or (new.status <> 'inactive' and old.status <> 'inactive') then return new; end if;
    end if;
    event_title := case when new.status = 'inactive' then 'Registration cancelled' else 'Registration confirmed' end;
    event_message := case when new.status = 'inactive' then format('Your registration for "%s" has been cancelled.', activity_title)
      else format('You are registered for "%s". Find your schedule and reference code in My Activities.', activity_title) end;
    insert into public.notifications(recipient_id, activity_id, kind, title, message, link)
      values(new.user_uuid, new.activity_id, 'registration', event_title, event_message, '/participant/my-activities');
    perform public.notify_activity_staff(new.activity_id, 'registration',
      case when new.status = 'inactive' then 'Participant cancelled registration' else 'New activity registration' end,
      case when new.status = 'inactive' then format('A participant cancelled their registration for "%s".', activity_title)
        else format('A participant registered for "%s". Review the updated participant list.', activity_title) end);
  elsif tg_table_name = 'attendance_log' then
    select user_uuid into participant_user from public.registrations where id = new.registration_id;
    insert into public.notifications(recipient_id, activity_id, kind, title, message, link)
      values(participant_user, new.activity_id, 'attendance', 'Attendance recorded',
        format('Your attendance for "%s" on %s has been recorded.', activity_title, to_char(new.attendance_date, 'Mon DD, YYYY')),
        '/participant/my-activities');
  elsif tg_table_name = 'evaluations' then
    select user_uuid into participant_user from public.registrations where id = new.registration_id;
    insert into public.notifications(recipient_id, activity_id, kind, title, message, link)
      values(participant_user, new.activity_id, 'evaluation', 'Evaluation received',
        format('Thank you! Your evaluation for "%s" has been submitted.', activity_title), '/participant/evaluations');
    perform public.notify_activity_staff(new.activity_id, 'evaluation', 'New evaluation received',
      format('A participant submitted an evaluation for "%s".', activity_title));
  end if;
  return new;
end;
$$;
revoke all on function public.notify_portal_event() from public, anon, authenticated;

create trigger notify_registration_event after insert or update of status on public.registrations
  for each row execute function public.notify_portal_event();
create trigger notify_activity_event after insert or update on public.legacy_activities
  for each row execute function public.notify_portal_event();
create trigger notify_assignment_event after insert or delete on public.activity_facilitators
  for each row execute function public.notify_portal_event();
create trigger notify_attendance_event after insert on public.attendance_log
  for each row execute function public.notify_portal_event();
create trigger notify_evaluation_event after insert on public.evaluations
  for each row execute function public.notify_portal_event();

do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
