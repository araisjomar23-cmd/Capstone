const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { PGlite } = require('@electric-sql/pglite')

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [admin, participant, otherParticipant, facilitator, otherFacilitator] = [1, 2, 3, 4, 5].map(uuid)
const activity = uuid(10), registration = uuid(20), facilitatorId = uuid(30)

test('notification migration: real PostgreSQL triggers and recipient isolation', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  // Minimal versions of the existing legacy tables; the notification migration
  // below is executed unchanged, including its actual RLS policies and grants.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.admin_users(user_uuid uuid primary key references auth.users, role text);
    create table public.participants(user_uuid uuid primary key references auth.users);
    create table public.legacy_activities(id uuid primary key, title text, status text default 'open',
      start_date date default '2100-01-01', end_date date default '2100-01-02',
      start_time time, end_time time, venue text default '', manually_closed boolean default false,
      note text default '', taken integer default 0);
    create table public.facilitators(id uuid primary key, user_uuid uuid references auth.users);
    create table public.activity_facilitators(activity_id uuid references public.legacy_activities on delete cascade,
      facilitator_id uuid references public.facilitators, primary key(activity_id, facilitator_id));
    create table public.registrations(id uuid primary key, activity_id uuid references public.legacy_activities,
      user_uuid uuid references auth.users, status text default 'registered');
    create table public.attendance_log(id uuid primary key, activity_id uuid references public.legacy_activities,
      registration_id uuid references public.registrations, attendance_date date);
    create table public.evaluations(id uuid primary key, activity_id uuid references public.legacy_activities,
      registration_id uuid references public.registrations);
  `)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261117000000_portal_notifications.sql'), 'utf8'))
  for (const user of [admin, participant, otherParticipant, facilitator, otherFacilitator]) {
    await db.query('insert into auth.users values ($1)', [user])
  }
  await db.query("insert into admin_users values ($1, 'superadmin'), ($2, 'facilitator'), ($3, 'facilitator')", [admin, facilitator, otherFacilitator])
  await db.query('insert into participants values ($1), ($2)', [participant, otherParticipant])
  await db.query('insert into facilitators values ($1, $2), ($3, $4)', [facilitatorId, facilitator, uuid(31), otherFacilitator])
  const rows = async () => (await db.query('select * from notifications order by created_at, id')).rows
  const clear = () => db.exec('delete from notifications')
  const claim = user => db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])

  await t.test('a new available activity notifies participants, not staff', async () => {
    await claim(admin)
    await db.query('insert into legacy_activities(id, title) values ($1, $2)', [activity, 'Leadership workshop'])
    assert.deepEqual((await rows()).map(row => row.recipient_id).sort(), [participant, otherParticipant].sort())
    assert.ok((await rows()).every(row => row.link === '/participant'))
    await clear()
  })

  await t.test('only the newly assigned facilitator receives an assignment notification', async () => {
    await db.query('insert into activity_facilitators values ($1, $2)', [activity, facilitatorId])
    assert.deepEqual((await rows()).map(row => [row.recipient_id, row.kind]), [[facilitator, 'assignment']])
    await clear()
  })

  await t.test('registration notifies its owner, admins, and assigned facilitators only', async () => {
    await claim(participant)
    await db.query('insert into registrations(id, activity_id, user_uuid) values ($1, $2, $3)', [registration, activity, participant])
    assert.deepEqual((await rows()).map(row => row.recipient_id).sort(), [admin, participant, facilitator].sort())
    assert.equal((await rows()).find(row => row.recipient_id === participant).title, 'Registration confirmed')
    await clear()
  })

  await t.test('capacity counter changes and attendance status transitions do not create duplicate registration alerts', async () => {
    await db.query('update legacy_activities set taken = 1 where id = $1', [activity])
    await db.query("update registrations set status = 'attended' where id = $1", [registration])
    assert.equal((await rows()).length, 0)
  })

  await t.test('schedule changes notify active registrants and assigned staff, excluding the staff actor', async () => {
    await claim(admin)
    await db.query("update legacy_activities set venue = 'City Hall' where id = $1", [activity])
    assert.deepEqual((await rows()).map(row => row.recipient_id).sort(), [participant, facilitator].sort())
    assert.ok((await rows()).every(row => row.kind === 'activity'))
    await clear()
  })

  await t.test('a check-in is delivered only to the participant who attended', async () => {
    await claim(facilitator)
    await db.query("insert into attendance_log values ($1, $2, $3, '2100-01-01')", [uuid(40), activity, registration])
    assert.deepEqual((await rows()).map(row => [row.recipient_id, row.kind]), [[participant, 'attendance']])
    await clear()
  })

  await t.test('evaluations notify their owner and the responsible staff without exposing feedback text', async () => {
    await claim(participant)
    await db.query('insert into evaluations values ($1, $2, $3)', [uuid(50), activity, registration])
    assert.deepEqual((await rows()).map(row => row.recipient_id).sort(), [admin, participant, facilitator].sort())
    assert.equal((await rows()).find(row => row.recipient_id === admin).link, '/admin/evaluations')
    await clear()
  })

  await t.test('cancellations notify staff, and cancelled registrants do not receive subsequent activity updates', async () => {
    await claim(participant)
    await db.query("update registrations set status = 'inactive' where id = $1", [registration])
    assert.deepEqual((await rows()).map(row => row.recipient_id).sort(), [admin, participant, facilitator].sort())
    await clear()
    await claim(admin)
    await db.query("update legacy_activities set venue = 'Youth Center' where id = $1", [activity])
    assert.deepEqual((await rows()).map(row => row.recipient_id), [facilitator])
    await clear()
  })

  await t.test('removing an assignment notifies its former facilitator', async () => {
    await db.query('delete from activity_facilitators where activity_id = $1', [activity])
    assert.equal((await rows())[0].title, 'Activity assignment removed')
    assert.equal((await rows())[0].recipient_id, facilitator)
    await clear()
  })

  await t.test('RLS prevents reading or changing another account’s notifications, including for admins', async () => {
    await claim(null)
    await db.query("insert into notifications(id, recipient_id, kind, title, message, link) values ($1, $2, 'activity', 'Private', 'Own account', '/participant')", [uuid(60), participant])
    await db.query("insert into notifications(id, recipient_id, kind, title, message, link) values ($1, $2, 'activity', 'Other', 'Other account', '/participant')", [uuid(61), otherParticipant])
    await claim(participant)
    await db.exec('set role authenticated')
    try {
      assert.equal((await rows()).length, 1)
      assert.equal((await rows())[0].recipient_id, participant)
      assert.equal((await db.query('update notifications set read_at = now() returning id')).rows.length, 1)
      assert.equal((await db.query('update notifications set read_at = null where id = $1 returning id', [uuid(61)])).rows.length, 0)
      await assert.rejects(db.query("update notifications set title = 'Forged' where id = $1", [uuid(60)]), /permission denied/)
      await assert.rejects(db.query("insert into notifications(recipient_id, kind, title, message, link) values ($1, 'activity', 'Forged', 'Forged', '/participant')", [participant]), /permission denied/)
      await assert.rejects(db.query('delete from notifications'), /permission denied/)
      await assert.rejects(db.query("select notify_activity_staff($1, 'activity', 'Forged', 'Forged')", [activity]), /permission denied/)
      await claim(admin)
      assert.equal((await rows()).length, 0)
    } finally { await db.exec('reset role') }
  })
})

function loadService(client) {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/notifications/notificationService.ts'), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(() => ({ supabase: client }), module, module.exports)
  return module.exports
}

function fakeClient(result) {
  const calls = []
  const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
  for (const method of ['select', 'eq', 'is', 'order', 'limit', 'update', 'lte']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query }
  }
  return { calls, client: { from: table => { calls.push(['from', table]); return query } } }
}

test('inbox pagination scopes the recipient and unread filter, and preserves the next page', async () => {
  const mock = fakeClient({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null })
  const result = await loadService(mock.client).fetchNotifications(participant, true, 2)
  assert.equal(result.items.length, 2)
  assert.equal(result.hasMore, true)
  assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'recipient_id' && call[2] === participant))
  assert.ok(mock.calls.some(call => call[0] === 'is' && call[1] === 'read_at' && call[2] === null))
  assert.ok(mock.calls.some(call => call[0] === 'order' && call[1] === 'id'))
})

test('mark all read is scoped to the user and the last seen timestamp', async () => {
  const mock = fakeClient({ error: null })
  await loadService(mock.client).markAllNotificationsRead(participant, '2026-11-17T00:00:00Z')
  assert.ok(mock.calls.some(call => call[0] === 'eq' && call[1] === 'recipient_id' && call[2] === participant))
  assert.ok(mock.calls.some(call => call[0] === 'lte' && call[1] === 'created_at' && call[2] === '2026-11-17T00:00:00Z'))
})

test('inbox failures are surfaced instead of returning a misleading empty inbox', async () => {
  const service = loadService(fakeClient({ data: null, error: { message: 'Missing table' } }).client)
  await assert.rejects(service.fetchNotifications(participant, false, 20), /could not be loaded/)
  await assert.rejects(service.fetchUnreadCount(participant), /could not be loaded/)
  await assert.rejects(service.markNotificationRead(participant, 'id'), /Could not mark/)
})

test('notification destinations reject cross-portal and external links', () => {
  const { notificationDestination } = loadService({})
  assert.equal(notificationDestination('participant', '//evil.example'), '/participant')
  assert.equal(notificationDestination('participant', '/admin/evaluations'), '/participant')
  assert.equal(notificationDestination('facilitator', '/admin/participants'), '/admin/facilitator-portal')
  assert.equal(notificationDestination('superadmin', '/admin/evaluations'), '/admin/evaluations')
  assert.equal(notificationDestination('participant', '/participant/my-activities'), '/participant/my-activities')
})
