const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Exercise the actual TypeScript helpers and page components without a live database.
function load(relative, mocks = {}) {
  if (/\.(jpeg|png)$/.test(relative)) return { default: relative }
  const file = path.resolve(relative)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    const resolved = [base, base + '.ts', base + '.tsx'].find((candidate) => fs.existsSync(candidate))
    return load(resolved, mocks)
  }, module, module.exports)
  return module.exports
}
const { matchesDatePeriod, activityDateLabel, currentYearPeriod } = load('src/lib/activityDatePeriod.ts')
const { fiscalYearFor, fiscalYearRange } = load('src/lib/fiscalYear.ts')
const { summarizeDashboard } = load('src/features/dashboard/dashboardSummary.ts')
const { manilaDate } = load('src/lib/calendarDate.ts')
const period = { year: '2026', month: '07' }
const activities = [
  { id: 'old', title: 'Previous workshop', programId: 'p1', programName: 'Program A', startDate: '2026-06-30', endDate: '2026-06-30', slots: 10, budgetAlloc: 100, budgetSpent: 20, status: 'closed', date: 'Jun 30, 2026' },
  { id: 'new', title: 'Selected workshop', programId: 'p2', programName: 'Program B', startDate: '2026-07-01', endDate: '2026-07-02', slots: 20, budgetAlloc: 200, budgetSpent: 250, status: 'open', date: 'Jul 1, 2026' },
]
const participant = (id, activity, status = 'registered') => ({
  id, activityId: activity.id, activityTitle: activity.title, activityStartDate: activity.startDate, activityEndDate: activity.endDate,
  status, name: 'Person ' + id, age: 20, gender: 'Male', contact: '09123456789', barangay: 'Test barangay', ref: id,
  org: '', program: activity.programName, registeredAt: '2026-07-01T00:00:00Z', attendedAt: null, attendanceHistory: [], sectoralGroup: 'None',
})
const participants = [participant('old-person', activities[0], 'attended'), participant('new-person', activities[1], 'completed'), participant('inactive-person', activities[1], 'inactive')]
const evaluations = activities.map((a, index) => ({ id: a.id, activityId: a.id, activityStartDate: a.startDate, activityEndDate: a.endDate, activityTitle: a.title, participantName: 'Reviewer ' + a.id, rating: index ? 5 : 1, wouldRecommend: Boolean(index), feedback: 'Feedback ' + a.id, submittedAt: '2026-07-0' + (index + 1) + 'T00:00:00Z' }))

function renderPage(name, states) {
  let stateIndex = 0
  const hooks = { ...React, useState: (initial) => React.useState(stateIndex < states.length ? states[stateIndex++] : initial) }
  const service = {}
  const mocks = {
    react: hooks,
    '../../lib/supabase': { supabase: {} },
    '../../components/ToastProvider': { useToast: () => ({ showToast() {} }) },
    '../../features/participants/participantService': service,
    '../../features/activities/activityService': service,
    '../../features/evaluations/evaluationService': service,
    '../../features/budget/budgetService': service,
    '../../features/participants/ParticipantModal': { default: () => null },
    '../../features/activities/ActivityFormModal': { default: () => null },
  }
  const Component = load('src/pages/admin/' + name + '.tsx', mocks).default
  return renderToStaticMarkup(React.createElement(Component))
}

test('month/year filters support each selector and combined inclusive boundaries', () => {
  assert.equal(matchesDatePeriod('2026-07-01', undefined, period), true)
  assert.equal(matchesDatePeriod('2026-06-30', '2026-07-01', period), true)
  assert.equal(matchesDatePeriod('2026-06-30', undefined, period), false)
  assert.equal(matchesDatePeriod('2025-07-01', undefined, period), false)
  assert.equal(matchesDatePeriod('2025-07-01', undefined, { year: '', month: '07' }), true)
  assert.equal(matchesDatePeriod('2026-12-31', undefined, { year: '2026', month: '' }), true)
  assert.equal(matchesDatePeriod('2025-12-31', '2026-01-02', { year: '2026', month: '01' }), true)
})
test('invalid and undated records cannot leak into a selected period', () => {
  for (const date of [undefined, '', '2026-02-30', '2026-13-01', 'invalid']) assert.equal(matchesDatePeriod(date, undefined, period), false)
  assert.equal(matchesDatePeriod(undefined, undefined, { year: '', month: '' }), true)
  assert.equal(matchesDatePeriod('2026-07-01', undefined, { year: '2026', month: '99' }), false)
  assert.equal(activityDateLabel('invalid'), 'Activity date unavailable')
})
test('leap day and every fiscal start month use accurate year boundaries', () => {
  assert.equal(matchesDatePeriod('2024-02-29', undefined, { year: '2024', month: '02' }), true)
  assert.equal(fiscalYearFor('2025-02-29', 1), null)
  for (let month = 1; month <= 12; month++) {
    const start = '2026-' + String(month).padStart(2, '0') + '-01'
    const previous = new Date(Date.parse(start + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
    assert.equal(fiscalYearFor(start, month), 2026)
    assert.equal(fiscalYearFor(previous, month), 2025)
  }
  assert.equal(fiscalYearRange(2026, 7), 'Jul 1, 2026 to Jun 30, 2027')
})
test('fiscal selection filters every dashboard summary and keeps same-title activities separate', () => {
  const snapshot = { acts: activities, all: participants, evaluations }
  const result = summarizeDashboard(snapshot, { year: 2026, startMonth: 7 }, new Date('2026-07-03T00:00:00Z'))
  assert.deepEqual(result.acts.map((a) => a.id), ['new'])
  assert.equal(result.totalReg, 1)
  assert.equal(result.totalAtt, 1)
  assert.equal(result.statusBreakdown[0].value, 1)
  assert.equal(result.totalBudgetAllocated, 200)
  assert.equal(result.totalBudgetSpent, 250)
  assert.equal(result.activityRegistrations[0].registrations, 1)
  assert.equal(result.budgetOverview.length, 1)
  assert.equal(result.evaluationStats.averageRating, 5)
  assert.equal(result.evaluationStats.recommendRate, 100)
  assert.deepEqual(result.recentEvaluations.map((r) => r.id), ['new'])
  const all = summarizeDashboard({ ...snapshot, evaluations: evaluations.map((e) => ({ ...e, activityTitle: 'Same title' })) }, { year: 'all', startMonth: 7 })
  assert.equal(all.activitySatisfaction.length, 2)
  assert.equal(all.totalBudgetAllocated, 300)
})
test('empty fiscal years return zero totals and no stale records', () => {
  const result = summarizeDashboard({ acts: activities, all: participants, evaluations }, { year: 2020, startMonth: 7 })
  assert.equal(result.totalReg, 0)
  assert.equal(result.totalBudgetSpent, 0)
  assert.equal(result.evaluationStats.totalResponses, 0)
  assert.deepEqual(result.recentEvaluations, [])
})
test('attendance trends use Manila dates and deduplicate repeated check-ins per registration/day', () => {
  assert.equal(manilaDate('2026-06-30T16:05:00Z'), '2026-07-01')
  const row = { ...participants[1], registeredAt: '2026-06-30T16:05:00Z', attendedAt: '2026-06-30T16:10:00Z', attendanceHistory: [{ checkedInAt: '2026-06-30T16:10:00Z' }, { checkedInAt: '2026-06-30T16:20:00Z' }] }
  const result = summarizeDashboard({ acts: activities, all: [row], evaluations: [] }, { year: 2026, startMonth: 7 }, new Date('2026-06-30T17:00:00Z'))
  assert.deepEqual(result.attendanceTrend.at(-1), { date: '2026-07-01', registrations: 1, attendance: 1 })
})
test('Evaluations renders only feedback matching the date filter, with matching totals', () => {
  const html = renderPage('AdminEvaluations', [period, evaluations, false])
  assert.match(html, /Feedback new/)
  assert.doesNotMatch(html, /Feedback old/)
  assert.match(html, /Showing 1 of 2 evaluations/)
})
test('organization attendance template preserves columns, separates events and sorts by surname', () => {
  const { attendanceName } = load('src/features/participants/printAttendance.ts')
  assert.deepEqual(attendanceName({ name: 'Erica Gonzales Luridan' }), { first: 'Erica', middle: 'G.', last: 'Luridan' })
  assert.deepEqual(attendanceName({ name: 'Juan Dela Cruz Jr.' }), { first: 'Juan', middle: '', last: 'Dela Cruz Jr.' })
  assert.deepEqual(attendanceName({ name: 'Maria Anne Santos Reyes', firstName: 'Maria Anne', middleName: 'Santos', lastName: 'Reyes' }), { first: 'Maria Anne', middle: 'S.', last: 'Reyes' })
  const { ATTENDANCE_COLUMNS, attendanceTemplateRows } = load('src/features/participants/printAttendance.ts')
  assert.deepEqual(ATTENDANCE_COLUMNS, ['NO', 'LAST NAME', 'FIRST NAME', 'M.I', 'AGE', 'SEX AT BIRTH', 'ADDRESS/OFFICE', 'SIGNATURE'])
  const rows = [
    { ...participant('z', activities[0]), lastName: 'Zulu', firstName: 'Ana' },
    { ...participant('b', activities[1]), lastName: 'Bravo', firstName: 'Ben' },
    { ...participant('a', activities[0]), lastName: 'alvarez', firstName: 'Zoe' },
    { ...participant('profile', activities[0], 'not_registered'), activityId: '' },
  ]
  assert.deepEqual(attendanceTemplateRows(rows).map(group => group.map(row => row.id)), [['a', 'z'], ['b']])
  assert.equal(rows[0].id, 'z')
})

test('attendance print is enabled for matching registrations and disabled for empty periods', () => {
  const available = renderPage('AdminParticipants', [period, participants, false, '', '', '', null, ''])
  assert.match(available, /Print attendance/)
  assert.doesNotMatch(available, /<button[^>]*disabled=""[^>]*>[^]*?Print attendance/)
  const empty = renderPage('AdminParticipants', [{ year: '2027', month: '' }, participants, false, '', '', '', null, ''])
  assert.match(empty, /<button[^>]*disabled=""[^>]*>[^]*?Print attendance/)
})

test('Participants combines date, activity, status and numeric contact search', () => {
  const html = renderPage('AdminParticipants', [period, participants, false, '09123456789', 'new', 'completed', null])
  assert.match(html, /Person new-person/)
  assert.doesNotMatch(html, /Person old-person|Person inactive-person/)
  assert.match(html, /Showing 1 of 2 participants/)
})
test('Participants supports age search and empty combined results', () => {
  assert.match(renderPage('AdminParticipants', [period, participants, false, '20', '', 'completed', null]), /Showing 1 of 2 participants/)
  assert.match(renderPage('AdminParticipants', [period, participants, false, '', 'old', 'completed', null]), /Showing 0 of 2 participants/)
})

test('participant total follows the selected month and year', () => {
  assert.match(renderPage('AdminParticipants', [{ year: '2026', month: '11' }, participants, false, '', '', '', null, '']), /Showing 0 of 0 participants/)
  assert.match(renderPage('AdminParticipants', [{ year: '2026', month: '07' }, participants, false, '', '', '', null, '']), /Showing 2 of 2 participants/)
  assert.match(renderPage('AdminParticipants', [{ year: '2027', month: '' }, participants, false, '', '', '', null, '']), /Showing 0 of 0 participants/)
})

test('profiles without activities appear by profile creation date and respect combined filters', () => {
  const rows = [
    { ...participants[1], id: 'profile:new', name: 'New profile', activityId: '', activityTitle: 'Not registered', status: 'not_registered', activityStartDate: undefined, activityEndDate: undefined, registeredAt: '2026-06-30T16:05:00Z' },
    { ...participants[1], id: 'profile:old', name: 'Old profile', activityId: '', activityTitle: 'Not registered', status: 'not_registered', activityStartDate: undefined, activityEndDate: undefined, registeredAt: '2025-07-01T00:00:00Z' },
  ]
  const html = renderPage('AdminParticipants', [period, rows, false, '', '', 'not_registered', null, 'Core Youth'])
  assert.match(html, /New profile/)
  assert.doesNotMatch(html, /Old profile/)
  assert.match(html, /Showing 1 of 1 participants/)
  assert.match(renderPage('AdminParticipants', [period, rows, false, '', 'new', '', null, '']), /Showing 0 of 1 participants/)
})

test('participant age groups filter inclusive boundaries and combine with other filters', () => {
  const ages = [14, 15, 17, 18, 24, 25, 30, 31]
  const rows = ages.map((age) => ({ ...participants[1], id: `age-${age}`, name: `Person age-${age}`, age }))
  for (const [group, expected] of [['Child Youth', [15, 17]], ['Core Youth', [18, 24]], ['Adult Youth', [25, 30]]]) {
    const html = renderPage('AdminParticipants', [period, rows, false, '', '', '', null, group])
    assert.match(html, /Showing 2 of 8 participants/)
    for (const age of ages) {
      assert.equal(html.includes(`Person age-${age}`), expected.includes(age), `${group}: age ${age}`)
    }
    const empty = renderPage('AdminParticipants', [period, rows, false, 'no-match', '', '', null, group])
    assert.match(empty, /Showing 0 of 8 participants/)
  }
  assert.match(renderPage('AdminParticipants', [period, rows, false, '', '', '', null, '']), /Showing 8 of 8 participants/)
})
test('Activities combines date, program and activity status filters', () => {
  const html = renderPage('AdminActivities', [period, activities, false, 'p2', false, null, Date.parse('2026-07-01T00:00:00Z'), null, 'ongoing'])
  assert.match(html, /Selected workshop/)
  assert.doesNotMatch(html, /Previous workshop/)
  assert.match(html, /Showing 1 of 2 activities/)
})
test('Budget cards and totals use the same filtered activities, preserving overspending', () => {
  const data = { activities, entriesByActivity: {}, auditByActivity: {} }
  const html = renderPage('AdminBudget', [period, data, false, '', null])
  assert.match(html, /Selected workshop/)
  assert.doesNotMatch(html, /Previous workshop/)
  assert.match(html, /Showing 1 of 2 activities/)
  assert.match(html, /-50/)
  assert.match(html, /125%/)
})

 test('date filters default and reset to the current Manila year with all months', () => {
  assert.deepEqual(currentYearPeriod(new Date('2026-12-31T15:59:59Z')), { year: '2026', month: '' })
  assert.deepEqual(currentYearPeriod(new Date('2026-12-31T16:00:00Z')), { year: '2027', month: '' })
})

test('dashboard exposes only year and month controls and selects a numeric year', () => {
  const Filter = load('src/features/dashboard/FiscalYearFilter.tsx').default
  let next
  const tree = Filter({ value: { year: 2026, startMonth: 1 }, activities, today: '2026-10-31', onChange: (value) => { next = value } })
  const selects = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    if (node.type === 'select') selects.push(node)
    visit(node.props?.children)
  }
  visit(tree)
  selects[0].props.onChange({ target: { value: '2025' } })
  assert.deepEqual(next, { year: 2025, startMonth: 1 })
  assert.equal(selects.length, 2)
  const html = renderToStaticMarkup(tree)
  assert.doesNotMatch(html, /All years|All fiscal years|Fiscal year starts in|\(current\)/)
})

test('switching fiscal years updates summaries and switching back restores exact totals', () => {
  const snapshot = { acts: activities, all: participants, evaluations }
  const current = summarizeDashboard(snapshot, { year: 2026, startMonth: 7 })
  const previous = summarizeDashboard(snapshot, { year: 2025, startMonth: 7 })
  assert.equal(previous.totalBudgetAllocated, 100)
  assert.equal(previous.totalBudgetSpent, 20)
  assert.equal(previous.evaluationStats.averageRating, 1)
  assert.equal(previous.acts[0].id, 'old')
  const restored = summarizeDashboard(snapshot, { year: 2026, startMonth: 7 })
  assert.deepEqual(restored, current)
  assert.equal(snapshot.acts.length, 2)
})

test('dashboard Month control selects a month while preserving the fiscal year and start month', () => {
  const Filter = load('src/features/dashboard/FiscalYearFilter.tsx').default
  let next
  const tree = Filter({ value: { year: 2026, startMonth: 7 }, activities, today: '2026-10-31', onChange: (value) => { next = value } })
  const selects = []
  function visit(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(visit); if (node.type === 'select') selects.push(node); visit(node.props?.children) }
  visit(tree)
  selects[1].props.onChange({ target: { value: '1' } })
  assert.deepEqual(next, { year: 2026, startMonth: 7, month: 1 })
  selects[1].props.onChange({ target: { value: '' } })
  assert.deepEqual(next, { year: 2026, startMonth: 7, month: undefined })
})
test('dashboard month selection filters all summaries and maps January into the next calendar year', () => {
  const { fiscalPeriodRange } = load('src/lib/fiscalYear.ts')
  const extra = { ...activities[1], id: 'jan', startDate: '2027-01-10', endDate: '2027-01-10', budgetAlloc: 500, budgetSpent: 30 }
  const snapshot = { acts: [...activities, extra], all: [...participants, participant('jan-person', extra)], evaluations }
  const july = summarizeDashboard(snapshot, { year: 2026, startMonth: 7, month: 7 })
  const january = summarizeDashboard(snapshot, { year: 2026, startMonth: 7, month: 1 })
  assert.deepEqual(july.acts.map((a) => a.id), ['new'])
  assert.equal(july.totalBudgetAllocated, 200)
  assert.equal(july.totalReg, 1)
  assert.equal(july.evaluationStats.averageRating, 5)
  assert.deepEqual(january.acts.map((a) => a.id), ['jan'])
  assert.equal(january.totalBudgetAllocated, 500)
  assert.equal(january.totalReg, 1)
  assert.equal(january.evaluationStats.totalResponses, 0)
  assert.equal(fiscalPeriodRange({ year: 2026, startMonth: 7, month: 1 }), 'Jan 1, 2027 to Jan 31, 2027')
  assert.equal(summarizeDashboard(snapshot, { year: 2026, startMonth: 7, month: 3 }).acts.length, 0)
  assert.equal(summarizeDashboard(snapshot, { year: 2026, startMonth: 7 }).acts.length, 2)
})

test('admin Closed filter and badge reflect manual closure during an ongoing schedule', () => {
  const rows = activities.map((a) => ({ ...a, status: 'closed' }))
  const html = renderPage('AdminActivities', [period, rows, false, '', false, null, Date.parse('2026-07-01T12:00:00+08:00'), null, 'closed'])
  assert.match(html, /Selected workshop/)
  assert.doesNotMatch(html, /Previous workshop/)
  assert.match(html, />Closed<\/span>/)
  assert.match(html, /Showing 1 of 2 activities/)
})

test('saving an activity reveals it even when year, month, program and status filters previously excluded it', async () => {
  const saved = { ...activities[1], id: 'saved', title: 'Newly saved activity', startDate: '2027-02-01', endDate: '2027-02-01' }
  const states = [{ year: '2026', month: '07' }, [], false, 'p1', true, null, Date.now(), null, 'completed', null, false, '']
  let index = 0
  let strict
  const Component = load('src/pages/admin/AdminActivities.tsx', {
    react: { ...React, useState: (initial) => { const at = index++; if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial; return [states[at], (next) => { states[at] = typeof next === 'function' ? next(states[at]) : next }] }, useEffect() {}, useMemo: (fn) => fn(), useRef: () => ({ current: 0 }) },
    '../../features/activities/activityService': { autoCloseExpiredActivities: async () => {}, fetchActivities: async (value) => { strict = value; return [saved] } },
    '../../features/activities/ActivityFormModal': { default: () => null },
    '../../components/ToastProvider': { useToast: () => ({ showToast() {} }) },
    '../../lib/supabase': { supabase: {} },
  }).default
  const tree = Component()
  let onSaved
  function visit(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(visit); if (node.props?.onSaved) onSaved = node.props.onSaved; visit(node.props?.children) }
  visit(tree)
  onSaved(saved)
  await new Promise(setImmediate)
  assert.deepEqual(states[0], { year: '2027', month: '02' })
  assert.equal(states[3], '')
  assert.equal(states[8], '')
  assert.equal(strict, true)
  assert.equal(states[1][0].id, 'saved')
  assert.equal(matchesDatePeriod(saved.startDate, saved.endDate, states[0]), true)
})

test('Activities explains why a saved 2027 activity is hidden by the default 2026 filter', () => {
  const future = { ...activities[1], id: 'future', title: 'FitForward: Step Into Strength', startDate: '2027-10-22', endDate: '2027-10-22', status: 'upcoming' }
  const html = renderPage('AdminActivities', [{ year: '2026', month: '' }, [activities[0], future], false, '', false, null, Date.now(), null, '', null, false, ''])
  assert.match(html, /1 activity is.*outside the selected date period/)
  assert.match(html, /View 2027/)
  assert.doesNotMatch(html, /FitForward: Step Into Strength/)
})
