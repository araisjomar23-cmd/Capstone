const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')

function load(file, mocks = {}) {
  file = path.resolve(file)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8').replaceAll('import.meta.env', '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const m = { exports: {} }
  new Function('require', 'module', 'exports', output)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.endsWith('/FinalizeAttendanceButton')) return { __esModule: true, default: () => null }
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    return load([base, base + '.ts', base + '.tsx'].find((file) => fs.existsSync(file)), mocks)
  }, m, m.exports)
  return m.exports
}

test('facilitator dashboard derives all four activity statuses and accurate Upcoming count', async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const acts = [
    { id: 'manual', status: 'closed', manually_closed: true, start_date: '2000-01-01', end_date: '2000-01-01' },
    { id: 'finished', status: 'closed', manually_closed: false, start_date: '2000-01-01', end_date: '2000-01-01' },
    { id: 'future', status: 'open', start_date: '2100-01-01', end_date: '2100-01-01' },
    { id: 'current', status: 'full', start_date: today, end_date: today },
  ]
  const regs = [{ status: 'registered' }, { status: 'attended' }, { status: 'inactive' }]
  const supabase = { from: (table) => ({ select: () => ({ in: () => table === 'legacy_activities' ? { order: async () => ({ data: acts }) } : Promise.resolve({ data: regs }) }) }) }
  const service = load('src/features/facilitators/facilitatorPortalService.ts', { '../../lib/supabase': { supabase } })
  const result = await service.fetchFacilitatorDashboard(acts.map((a) => a.id))
  assert.deepEqual(result.activities.map((a) => a.status), ['closed', 'completed', 'upcoming', 'ongoing'])
  assert.equal(result.upcoming, 1)
  assert.equal(result.totalParticipants, 2)
  assert.equal(result.totalAttended, 1)
})

test('facilitators without assignments have no activity statuses or participants', async () => {
  const service = load('src/features/facilitators/facilitatorPortalService.ts', { '../../lib/supabase': { supabase: {} } })
  assert.deepEqual(await service.fetchFacilitatorDashboard([]), { activities: [], totalParticipants: 0, totalAttended: 0, upcoming: 0 })
})

const registration = { id: 'r', activityId: 'a', title: 'Closed workshop', colorBg: '#1a5c3a', status: 'attended', registeredAt: '2026-10-01T00:00:00Z', canCancel: false, refCode: 'TEST', hasEvaluation: false, hasAttended: true, activityStatus: 'closed', checkInOpensAt: '2026-10-01T00:00:00Z' }
function renderPortal(file, states) {
  let index = 0
  const mocks = {
    react: { ...React, useState: (initial) => React.useState(index < states.length ? states[index++] : initial) },
    '../../layouts/ParticipantLayout': { __esModule: true, default: ({ children }) => React.createElement('main', null, children) },
    '../../components/CancelRegistrationModal': { __esModule: true, default: () => null },
    '../../features/public/registrationService': {},
    '../../lib/supabase': { supabase: {} },
  }
  const Component = load(file, mocks).default
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component)))
}

test('participant My Activities shows Closed, preserves history, and offers no check-in/evaluation', () => {
  const html = renderPortal('src/pages/user/MyActivities.tsx', [[registration], false, '', '', null, false, ''])
  assert.match(html, /Closed workshop/)
  assert.match(html, />Closed<\/span>/)
  assert.match(html, /This activity was manually closed/)
  assert.doesNotMatch(html, /Complete activity evaluation/)
  assert.equal(html.includes('/checkin/a'), false)
})
test('participant evaluations shows Closed rather than promising future completion', () => {
  const html = renderPortal('src/pages/user/ParticipantEvaluations.tsx', [[registration], false, ''])
  assert.match(html, />Closed<\/span>/)
  assert.match(html, /Activity Closed/)
  assert.match(html, /Evaluation is unavailable/)
  assert.doesNotMatch(html, /Open evaluation|will become available|Not available yet/)
})

test('facilitator participant records include the activity Closed state without changing attendance history', async () => {
  const row = { id: 'r', user_uuid: 'u', name: 'Participant', status: 'attended', registered_at: '2000-01-01T00:00:00Z', attended_at: '2000-01-01T01:00:00Z', activity_id: 'a', legacy_activities: { id: 'a', title: 'Historical workshop', status: 'closed', manually_closed: true, start_date: '2000-01-01', end_date: '2000-01-01', programs: { name: 'Education' } } }
  const supabase = { from: (table) => ({ select: () => table === 'registration_details' ? { order: async () => ({ data: [row], error: null }) } : { in: () => ({ order: async () => ({ data: [], error: null }) }) } }) }
  const service = load('src/features/participants/participantService.ts', { '../../lib/supabase': { supabase } })
  const result = await service.fetchParticipants(true)
  assert.equal(result[0].activityStatus, 'closed')
  assert.equal(result[0].status, 'attended')
  assert.equal(result[0].attendedAt, row.attended_at)
})

for (const [view, file, authPath, servicePath] of [
  ['public', 'src/features/public/ActivityModal.tsx', '../auth/AuthContext', './registrationService'],
  ['participant', 'src/pages/user/ActivityDetail.tsx', '../../features/auth/AuthContext', '../../features/public/registrationService'],
]) {
  test(view + ' activity details show the complete description before registration', () => {
    const activity = { id: 'a', title: 'Open workshop', programName: 'Education', startDate: '2100-01-01', endDate: '2100-01-01', status: 'open', slots: 20, taken: 0, previewDesc: 'Activity summary.', fullDesc: 'Complete activity information.', venue: 'Hall', date: 'Jan 1, 2100' }
    const states = [activity, false, false, '', '', Date.now(), false]
    let index = 0
    const Component = load(file, {
      react: { ...React, useState: (initial) => React.useState(index < states.length ? states[index++] : initial) },
      [authPath]: { useAuth: () => ({ loading: false, role: view === 'participant' ? 'participant' : null }) },
      [servicePath]: {},
      '../../lib/supabase': { supabase: {} },
    }).default
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, { activityId: 'a', onClose() {} })))
    assert.match(html, /Activity summary./)
    assert.match(html, /Complete activity information./)
    assert.doesNotMatch(html, /unlock after|unlocked after/)
    assert.match(html, /Register Now/)
  })
}

for (const facilitator of [false, true]) {
  test((facilitator ? 'facilitator' : 'admin') + ' attendance labels manual closure as Closed, matching Activities', () => {
    const activity = { id: 'a', title: 'Manually closed activity', status: 'closed', manuallyClosed: true, startDate: '2000-01-01', endDate: '2000-01-01', date: 'Jan 1, 2000', venue: 'Hall' }
    const states = facilitator ? [[activity], [], '', '', 1, 'manual', null, false, Date.now()] : [[activity], [], false, '', '', 1, null, false, null, Date.now()]
    let index = 0
    const file = facilitator ? 'src/pages/facilitator/FacilitatorAttendance.tsx' : 'src/pages/admin/AdminAttendance.tsx'
    const Component = load(file, {
      react: { ...React, useState: (initial) => React.useState(index < states.length ? states[index++] : initial) },
      '../../features/facilitators/useMyActivityIds': { useMyActivityIds: () => ({ activityIds: ['a'], loading: false }) },
      '../../features/activities/activityService': {},
      '../../features/attendance/attendanceService': {},
      '../../lib/supabase': { supabase: {} },
      '../../components/QrCameraScanner': { __esModule: true, default: () => null },
    }).default
    const html = renderToStaticMarkup(React.createElement(Component))
    assert.match(html, />Closed<\/span>/)
    assert.doesNotMatch(html, />Completed<\/span>|>Ongoing<\/span>/)
    assert.doesNotMatch(html, /<option value="a"/)
    if (facilitator) assert.match(html, /manually closed. Check-in is unavailable/)
  })
}

for (const status of ['closed', 'completed', 'ongoing']) {
  test('budget ' + status + ' controls expense recording while preserving history', () => {
    const activity = { id: 'a', title: 'Budget activity', status: status === 'closed' ? 'closed' : 'open', manuallyClosed: status === 'closed', startDate: '2000-01-01', endDate: status === 'completed' ? '2000-01-01' : '2100-01-01', budgetAlloc: 1000, budgetSpent: 100, programName: 'Education' }
    const data = { activities: [activity], entriesByActivity: {}, auditByActivity: {} }
    const states = [{ year: '2000', month: '' }, data, false, '', 'a']
    let index = 0
    const Component = load('src/pages/admin/AdminBudget.tsx', {
      react: { ...React, useState: (initial) => React.useState(index < states.length ? states[index++] : initial) },
      '../../features/budget/budgetService': {},
      '../../components/ToastProvider': { useToast: () => ({ showToast() {} }) },
      '../../lib/supabase': { supabase: {} },
    }).default
    const html = renderToStaticMarkup(React.createElement(Component))
    assert.match(html, /Transaction History/)
    if (status === 'ongoing') assert.match(html, /Record Expense/)
    else {
      assert.doesNotMatch(html, /Record Expense/)
      assert.match(html, /New expenses cannot be recorded/)
    }
  })
}

for (const approved of [false, true]) {
  test('attendance finalization ' + (approved ? 'saves after confirmation' : 'Keep Open prevents changes'), async () => {
    let calls = 0
    let refreshed = 0
    const messages = []
    const Component = load('src/features/attendance/FinalizeAttendanceButton.tsx', {
      react: { ...React, useState: () => [false, () => {}], useRef: () => ({ current: false }) },
      '../../components/ConfirmationProvider': { useConfirmation: () => async (options) => { assert.equal(options.confirmLabel, 'Finalize Attendance'); return approved } },
      '../../components/ToastProvider': { useToast: () => ({ showToast: (message) => messages.push(message) }) },
      '../../lib/supabase': { supabase: { rpc: async (name, args) => { calls++; assert.equal(name, 'finalize_activity_attendance'); assert.equal(args.p_activity_id, 'a'); return { data: 3, error: null } } } },
    }).default
    const props = { activity: { id: 'a', title: 'Workshop', status: 'closed', manuallyClosed: false, startDate: '2000-01-01', endDate: '2000-01-01' }, now: Date.now(), onFinalized: () => refreshed++ }
    const button = Component(props)
    button.props.onClick()
    await new Promise(setImmediate)
    assert.equal(calls, approved ? 1 : 0)
    assert.equal(refreshed, approved ? 1 : 0)
    if (approved) assert.match(messages[0], /3 participant.*Absent/)
    assert.equal(Component({ ...props, activity: { ...props.activity, manuallyClosed: true } }), null)
    assert.equal(Component({ ...props, activity: { ...props.activity, startDate: '2100-01-01', endDate: '2100-01-01' } }), null)
    assert.equal(Component({ ...props, activity: { ...props.activity, attendanceFinalizedAt: '2026-01-01' } }).props.children, 'Attendance finalized')
  })
}

test('participants see Absent in their activity history', () => {
  const html = renderPortal('src/pages/user/MyActivities.tsx', [[{ ...registration, status: 'absent', hasAttended: false, hasEvaluation: false, activityStatus: 'completed' }], false, '', '', null, false, ''])
  assert.match(html, /Absent|absent/)
  assert.doesNotMatch(html, /Complete activity evaluation/)
})
