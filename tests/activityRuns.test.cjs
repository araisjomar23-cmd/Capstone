const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, client) {
  file = path.resolve(file)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
  const m = { exports: {} }
  new Function('require', 'module', 'exports', output)((name) => name.endsWith('/supabase') ? { supabase: client } : name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts', client) : require(name), m, m.exports)
  return m.exports
}

test('reopening a completed activity cannot update its dates or status in place', async () => {
  let updates = 0
  const service = load('src/features/activities/activityService.ts', { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { start_date: '2000-01-01', end_date: '2000-01-01' }, error: null }) }) }), update: () => { updates++; throw new Error('History must not be updated') } }) })
  assert.equal(await service.toggleActivityStatus('old', 'closed'), false)
  assert.equal(updates, 0)
})
test('reopening a manually closed future activity changes only registration state', async () => {
  let update
  const service = load('src/features/activities/activityService.ts', { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { start_date: '2100-01-01', end_date: '2100-01-01' }, error: null }) }) }), update: (payload) => { update = payload; return { eq: async () => ({ error: null }) } } }) })
  assert.equal(await service.toggleActivityStatus('future', 'closed'), true)
  assert.deepEqual(update, { status: 'open', manually_closed: false })
})
test('new runs insert a separate activity and never clear registrations, attendance, evaluations or old budgets', async () => {
  const writes = []
  const service = load('src/features/activities/activityService.ts', { from: (table) => {
    assert.ok(['legacy_activities', 'budget_entries', 'activity_facilitators'].includes(table))
    return {
      insert: (payload) => { writes.push({ table, action: 'insert', payload }); return { select: () => ({ single: async () => ({ data: { id: 'new-run' }, error: null }) }) } },
      delete: () => ({ eq: async (column, id) => { writes.push({ table, action: 'delete', id }); return { error: null } } }),
      update: () => { throw new Error('Must not overwrite the source activity') },
    }
  } })
  const result = await service.saveActivity({ previousActivityId: 'old-run', title: 'Workshop', programId: 'p', slots: 20, startDate: '2100-01-01', endDate: '2100-01-01', startTime: '09:00', endTime: '10:00', checkInEarlyAccessMinutes: 30, venue: 'Hall', previewDesc: '', fullDesc: '', note: '', colorBg: '', budget: 0 }, [], null)
  assert.equal(result.id, 'new-run')
  assert.equal(writes[0].payload.previous_activity_id, 'old-run')
  assert.equal(writes[0].payload.taken, undefined)
  assert.ok(writes.every((write) => write.action !== 'delete' || write.id === 'new-run'))
  assert.ok(!writes.some((write) => write.table === 'budget_entries'))
})
test('public and participant catalog hides completed and manually closed activities without deleting history', async () => {
  const rows = [
    { id: 'old', title: 'Previous run', status: 'closed', slots: 20, start_date: '2000-01-01', end_date: '2000-01-01' },
    { id: 'new', title: 'New run', status: 'upcoming', slots: 20, start_date: '2100-01-01', end_date: '2100-01-01' },
    { id: 'closed-future', title: 'Closed run', status: 'closed', slots: 20, start_date: '2100-01-01', end_date: '2100-01-01' },
    { id: 'expired-open', title: 'Expired run', status: 'open', slots: 20, start_date: '2000-01-01', end_date: '2000-01-01' },
  ]
  const service = load('src/features/public/publicActivityService.ts', { from: (table) => ({ select: () => table === 'legacy_activities' ? { order: async () => ({ data: rows, error: null }) } : Promise.resolve({ data: [{ activity_id: 'old', registration_count: 12 }], error: null }) }) })
  const result = await service.fetchPublicActivities()
  assert.deepEqual(result.map((a) => a.id), ['new'])
  assert.equal(result[0].taken, 0)
  assert.equal(rows.length, 4)
})

test('manual closure takes precedence over an ongoing schedule; completed history stays Completed', () => {
  const { getActivityDisplayStatus, isActivityVisibleInCatalog } = load('src/features/activities/activityLifecycle.ts')
  const now = Date.parse('2026-10-31T14:00:00+08:00')
  const activity = { startDate: '2026-10-31', endDate: '2026-10-31', startTime: '13:16', endTime: '16:00', status: 'closed' }
  assert.equal(getActivityDisplayStatus(activity, now), 'closed')
  assert.equal(isActivityVisibleInCatalog(activity, now), false)
  assert.equal(getActivityDisplayStatus({ ...activity, status: 'open' }, now), 'ongoing')
  assert.equal(isActivityVisibleInCatalog({ ...activity, status: 'open' }, now), true)
  assert.equal(getActivityDisplayStatus(activity, Date.parse('2026-11-01T00:00:00+08:00')), 'completed')
  assert.equal(getActivityDisplayStatus({ ...activity, manuallyClosed: true }, Date.parse('2026-11-01T00:00:00+08:00')), 'closed')
})

test('manual closure remains Closed after its scheduled end and is excluded from completion counts', () => {
  const { getActivityDisplayStatus, isActivityVisibleInCatalog } = load('src/features/activities/activityLifecycle.ts')
  const activity = { status: 'closed', manuallyClosed: true, startDate: '2000-01-01', endDate: '2000-01-01' }
  assert.equal(getActivityDisplayStatus(activity), 'closed')
  assert.equal(isActivityVisibleInCatalog(activity), false)
  assert.equal(getActivityDisplayStatus({ ...activity, manuallyClosed: false }), 'completed')
})
test('closing saves the manual flag and reloading preserves it', async () => {
  let payload
  const client = { from: (table) => ({
    update: (value) => { payload = value; return { eq: async () => ({ error: null }) } },
    select: () => table === 'legacy_activities' ? { order: async () => ({ data: [{ id: 'closed', status: 'closed', manually_closed: true, start_date: '2000-01-01', end_date: '2000-01-01' }], error: null }) } : Promise.resolve({ data: [], error: null }),
  }) }
  const service = load('src/features/activities/activityService.ts', client)
  assert.equal(await service.toggleActivityStatus('closed', 'open'), true)
  assert.deepEqual(payload, { status: 'closed', manually_closed: true })
  const records = await service.fetchActivities(true)
  const { getActivityDisplayStatus } = load('src/features/activities/activityLifecycle.ts')
  assert.equal(records[0].manuallyClosed, true)
  assert.equal(getActivityDisplayStatus(records[0]), 'closed')
})
