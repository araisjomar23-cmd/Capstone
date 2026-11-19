const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(relative, mocks = {}) {
  const file = path.resolve(relative)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    return load([base, base + '.ts', base + '.tsx'].find(candidate => fs.existsSync(candidate)), mocks)
  }, module, module.exports)
  return module.exports
}
const { participationHistory, participationTotals } = load('src/features/participants/participationHistory.ts')
const row = (id, overrides = {}) => ({
  id, userUuid: 'youth-1', name: 'Sample youth', activityId: id, activityTitle: 'Activity ' + id, program: 'Program A', programId: 'program-a',
  status: 'registered', activityStartDate: '2026-11-01', activityEndDate: '2026-11-01', activityDate: 'Nov 1, 2026', activityVenue: 'Hall',
  registeredAt: '2026-10-20T00:00:00Z', attendedAt: null, attendanceHistory: [], ref: 'DEMO-' + id, age: 20, gender: 'Unspecified', barangay: 'Sample barangay', contact: '', org: '', sectoralGroup: 'None', ...overrides,
})
const records = [
  row('recent', { status: 'attended', attendanceHistory: [{ dayNumber: 1, checkedInAt: '2026-11-01T01:00:00Z' }, { dayNumber: 2, checkedInAt: '2026-11-02T01:00:00Z' }] }),
  row('previous', { activityTitle: 'Older workshop', activityStartDate: '2025-01-01', program: 'Program B', programId: 'program-b', status: 'absent' }),
  row('completed', { status: 'completed' }), row('cancelled', { status: 'inactive' }),
  row('different-youth', { userUuid: 'youth-2' }),
]

test('full participation history joins account identity, keeps prior programs and cancelled/absent rows, and removes duplicate registrations', () => {
  const history = participationHistory(records[0], [...records, records[0]])
  assert.equal(history.length, 4)
  assert.equal(history.at(-1).activityTitle, 'Older workshop')
  assert.ok(history.some(item => item.status === 'inactive'))
  assert.ok(!history.some(item => item.userUuid === 'youth-2'))
  assert.deepEqual(participationTotals(history), { youths: 1, registrations: 4, attended: 2, absent: 1, programs: 2 })
})

test('identical names without account IDs are never merged; unregistered profiles have no invented activity', () => {
  const first = row('first', { userUuid: undefined }), second = row('second', { userUuid: undefined })
  assert.deepEqual(participationHistory(first, [first, second]), [first])
  assert.equal(participationTotals([first, second]).youths, 2)
  const profile = row('profile', { status: 'not_registered', activityId: '' })
  assert.deepEqual(participationHistory(profile, [profile]), [])
})

test('history renders per-activity check-ins, status, program and Manila timestamps without unrelated youths', () => {
  const Modal = load('src/features/participants/ParticipantModal.tsx').default
  const html = renderToStaticMarkup(React.createElement(Modal, { participant: records[0], history: participationHistory(records[0], records), onClose() {} }))
  assert.match(html, /Participation across programs/)
  assert.match(html, /Older workshop/)
  assert.match(html, /Program B/)
  assert.match(html, /Day 2/)
  assert.match(html, /Manila time/)
  assert.doesNotMatch(html, /Activity different-youth/)
})

test('directory program filtering counts distinct youths separately and the selected history includes other periods', () => {
  let index = 0
  const states = [{ year: '2026', month: '11' }, records, false, '', '', '', records[0], '', 'program-a', '']
  const Page = load('src/pages/admin/AdminParticipants.tsx', {
    react: { ...React, useState: initial => React.useState(index < states.length ? states[index++] : initial) },
    '../../lib/supabase': { supabase: {} }, '../../features/participants/participantService': {},
  }).default
  const html = renderToStaticMarkup(React.createElement(Page))
  assert.match(html, /aria-label="Program"/)
  assert.match(html, /2 distinct youths/)
  assert.match(html, /4 activity registrations/)
  assert.match(html, /Older workshop/, 'full history is not restricted to November directory rows')
})

for (const failingTable of ['registration_details', 'participants', 'registrations', 'attendance_log']) {
  test(`strict directory reads reject ${failingTable} failures instead of returning incomplete totals`, async () => {
    const db = { registration_details: [{ id: 'reg', user_uuid: 'u', activity_id: 'a', registered_at: '2026-11-01', legacy_activities: null }], participants: [], registrations: [], attendance_log: [] }
    const supabase = { from(table) { const query = { select() { return query }, order() { return query }, in() { return query }, then(resolve, reject) { return Promise.resolve({ data: db[table], error: table === failingTable ? { message: 'Synthetic read failure' } : null }).then(resolve, reject) } }; return query } }
    const service = load('src/features/participants/participantService.ts', { '../../lib/supabase': { supabase } })
    await assert.rejects(service.fetchAdminParticipants(true), /Unable to/)
  })
}
