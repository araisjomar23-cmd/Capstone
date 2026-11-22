const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(relative, mocks = {}) {
  const file = path.resolve(relative)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    return load([base, base + '.ts', base + '.tsx'].find(candidate => fs.existsSync(candidate)), mocks)
  }, module, module.exports)
  return module.exports
}
const { startDashboardSync, DASHBOARD_LIVE_TABLES } = load('src/features/dashboard/dashboardSync.ts')
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

function environment() {
  let now = 0, id = 0
  const timers = new Map(), windowListeners = new Map(), pageListeners = new Map()
  const events = map => ({
    addEventListener(name, callback) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback) },
    removeEventListener(name, callback) { map.get(name)?.delete(callback) },
    emit(name) { for (const callback of [...(map.get(name) ?? [])]) callback() },
  })
  const browser = {
    navigator: { onLine: true }, ...events(windowListeners),
    setTimeout(fn, delay) { timers.set(++id, { fn, due: now + delay }); return id },
    clearTimeout(key) { timers.delete(key) },
    setInterval(fn, delay) { timers.set(++id, { fn, due: now + delay, interval: delay }); return id },
    clearInterval(key) { timers.delete(key) },
  }
  const page = { visibilityState: 'visible', ...events(pageListeners) }
  return {
    browser, page, timers, windowListeners, pageListeners,
    async tick(ms) {
      const target = now + ms
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0]
        if (!next) break
        const [key, timer] = next
        now = timer.due
        if (timer.interval) timer.due += timer.interval
        else timers.delete(key)
        timer.fn(); await flush()
      }
      now = target; await flush()
    },
  }
}
function setup(overrides = {}) {
  const env = environment(), states = [], errors = [], channels = []
  let reads = 0
  const sync = startDashboardSync({
    ...env, load: async () => { reads++ }, onError: error => errors.push(error), onConnection: state => states.push(state),
    subscribe(change, status) { const channel = { change, status, removed: false }; channels.push(channel); return () => { channel.removed = true } },
    ...overrides,
  })
  return { ...env, sync, states, errors, channels, get reads() { return reads } }
}

test('initial read, subscription catch-up and event bursts refresh without concurrent reads', async () => {
  let reads = 0, running = 0, maxRunning = 0, release
  const state = setup({ load: async () => { reads++; running++; maxRunning = Math.max(maxRunning, running); await new Promise(resolve => { release = resolve }); running-- } })
  assert.equal(reads, 1)
  state.channels[0].status('SUBSCRIBED')
  for (let i = 0; i < 25; i++) state.channels[0].change()
  await state.tick(1000)
  assert.equal(reads, 1)
  release(); await flush(); await state.tick(250)
  assert.equal(reads, 2)
  assert.equal(maxRunning, 1)
  release(); await flush(); state.sync.stop()
})

test('lost realtime uses periodic refresh, rejoin catches up, and CLOSED replaces the channel', async () => {
  const state = setup(); await flush()
  state.channels[0].status('CHANNEL_ERROR')
  assert.equal(state.states.at(-1), 'reconnecting')
  await state.tick(30_250)
  assert.equal(state.reads, 2)
  state.channels[0].status('SUBSCRIBED'); await state.tick(250)
  assert.equal(state.states.at(-1), 'live')
  assert.equal(state.reads, 3)
  state.channels[0].status('CLOSED'); await state.tick(5000)
  assert.equal(state.channels.length, 2)
  assert.equal(state.channels[0].removed, true)
  state.channels[0].status('SUBSCRIBED')
  assert.equal(state.states.at(-1), 'reconnecting', 'old callbacks cannot change connection state')
  state.sync.stop()
})

test('offline and hidden tabs skip polling; returning online or visible catches up', async () => {
  const state = setup(); await flush()
  state.browser.navigator.onLine = false; state.browser.emit('offline')
  await state.tick(60_000)
  assert.equal(state.reads, 1)
  assert.equal(state.states.at(-1), 'offline')
  state.browser.navigator.onLine = true; state.browser.emit('online'); await state.tick(250)
  assert.equal(state.reads, 2)
  state.page.visibilityState = 'hidden'; await state.tick(60_000)
  assert.equal(state.reads, 2)
  state.page.visibilityState = 'visible'; state.page.emit('visibilitychange'); state.browser.emit('focus'); await state.tick(250)
  assert.equal(state.reads, 3)
  state.sync.stop()
})

test('failed loads report an error and remain recoverable; cleanup stops timers and callbacks', async () => {
  let fail = true, reads = 0
  const state = setup({ load: async () => { reads++; if (fail) throw new Error('read failed') } })
  await flush(); assert.equal(state.errors.length, 1)
  fail = false; await state.sync.refresh(); assert.equal(reads, 2)
  state.sync.stop(); state.channels[0].change(); state.channels[0].status('CLOSED')
  await state.tick(60_000); await state.sync.refresh()
  assert.equal(reads, 2)
  assert.equal(state.timers.size, 0)
  assert.ok([...state.windowListeners.values(), ...state.pageListeners.values()].every(listeners => listeners.size === 0))
})

test('a dashboard opened offline waits for the connection and then loads', async () => {
  const env = environment(); env.browser.navigator.onLine = false
  let reads = 0
  const state = setup({ ...env, load: async () => { reads++ } })
  assert.equal(reads, 0)
  assert.equal(state.states.at(-1), 'offline')
  env.browser.navigator.onLine = true; env.browser.emit('online'); await env.tick(250)
  assert.equal(reads, 1)
  state.sync.stop()
})

test('actual hook subscribes to all seven tables, preserves a good snapshot on failure, and ignores reads after cleanup', async () => {
  let effect, callbacks, fail = false, reads = 0
  const states = [], filters = []
  let resolveActivities
  const hook = load('src/features/dashboard/useDashboardData.ts', {
    react: {
      useState(initial) { const cell = { value: initial }; states.push(cell); return [initial, value => { cell.value = value }] },
      useRef: value => ({ current: value }), useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => { effect = fn },
    },
    './dashboardSync': { startDashboardSync(options) { callbacks = options; options.subscribe(() => {}, () => {}); return { refresh: options.load, stop() {} } }, DASHBOARD_LIVE_TABLES },
    '../activities/activityService': { fetchActivities: async strict => { assert.equal(strict, true); reads++; if (fail) throw new Error('network'); if (resolveActivities) return new Promise(resolve => { resolveActivities = resolve }); return [] } },
    '../participants/participantService': { fetchParticipants: async strict => { assert.equal(strict, true); return [] } },
    '../evaluations/evaluationService': { fetchEvaluations: async strict => { assert.equal(strict, true); return { rows: [] } } },
    '../../lib/supabase': { supabase: { channel() { return { on(_event, filter) { filters.push(filter.table); return this }, subscribe() {} } }, removeChannel() {} } },
  })
  hook.useDashboardData({ year: 2026, startMonth: 1 })
  const cleanup = effect()
  assert.deepEqual(filters.sort(), ['programs', 'legacy_activities', 'registrations', 'attendance_log', 'budget_entries', 'evaluations', 'participants'].sort())
  await callbacks.load()
  const goodSnapshot = states[0].value, goodUpdatedAt = states[1].value
  fail = true
  await assert.rejects(callbacks.load()); callbacks.onError(new Error('network'))
  assert.equal(states[0].value, goodSnapshot)
  assert.equal(states[1].value, goodUpdatedAt)
  assert.ok(states[3].value.includes('Failed to refresh'))
  fail = false; await callbacks.load(); assert.equal(states[3].value, null)
  resolveActivities = true
  const pending = callbacks.load(); await flush(); cleanup()
  const before = states.map(state => state.value)
  resolveActivities([{ id: 'late' }]); await pending
  assert.deepEqual(states.map(state => state.value), before)
  assert.equal(reads, 4)
})

test('program summaries honor the selected period, count participation, and weight satisfaction by responses', () => {
  const { summarizeDashboard } = load('src/features/dashboard/dashboardSummary.ts')
  const acts = [
    { id: 'a', title: 'Workshop A', programId: 'p', programName: 'Youth development', startDate: '2026-11-01', slots: 10, budgetAlloc: 100, budgetSpent: 120 },
    { id: 'b', title: 'Workshop B', programId: 'p', programName: 'Youth development', startDate: '2026-11-02', slots: 10, budgetAlloc: 100, budgetSpent: 100 },
    { id: 'old', title: 'Previous workshop', programId: 'old', programName: 'Last year', startDate: '2025-11-01', slots: 10, budgetAlloc: 900, budgetSpent: 0 },
  ]
  const all = [{ id: '1', userUuid: 'same-youth', activityId: 'a', status: 'attended', registeredAt: '2026-11-01' }, { id: '2', userUuid: 'same-youth', activityId: 'b', status: 'completed', registeredAt: '2026-11-02' }, { id: '3', activityId: 'b', status: 'inactive' }]
  const evaluations = [{ activityId: 'a', rating: 5 }, { activityId: 'b', rating: 1 }, { activityId: 'b', rating: 3 }, { activityId: 'old', rating: 1 }].map((row, index) => ({ ...row, id: String(index), activityTitle: 'Workshop', submittedAt: '2026-11-03T00:00:00Z' }))
  const result = summarizeDashboard({ acts, all, evaluations }, { year: 2026, startMonth: 1, month: 11 })
  assert.deepEqual(result.programSummaries, [{ id: 'p', name: 'Youth development', activities: 2, registrations: 2, attended: 2, allocated: 200, spent: 220, responses: 3, ratingTotal: 9 }])
  const Overview = load('src/features/dashboard/ProgramOverview.tsx').default
  const html = renderToStaticMarkup(React.createElement(Overview, { rows: result.programSummaries }))
  assert.match(html, /3.0 \/ 5/)
  assert.match(html, /Over budget/)
  assert.match(html, /overflow-x-auto/)
  assert.match(html, /same youth may join more than once/)
  assert.doesNotMatch(html, /Last year/)
})

test('satisfaction chart uses real response counts and a fixed five-point scale, excluding unrated activities', () => {
  const { ActivitySatisfactionChart } = load('src/features/dashboard/DashboardCharts.tsx')
  const { BarChart, XAxis, Tooltip } = require('recharts')
  const nodes = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    nodes.push(node); visit(node.props?.children)
  }
  const data = [{ name: 'No responses', responses: 0, averageRating: 0 }, { name: 'Youth workshop', responses: 4, averageRating: 4.25 }]
  visit(ActivitySatisfactionChart({ data }))
  assert.deepEqual(nodes.find(node => node.type === XAxis).props.domain, [0, 5])
  assert.deepEqual(nodes.find(node => node.type === BarChart).props.data, [data[1]])
  assert.equal(data.length, 2, 'the chart must not mutate the shared dashboard data')
  const tooltip = nodes.find(node => node.type === Tooltip).props.content
  const html = renderToStaticMarkup(React.cloneElement(tooltip, { active: true, payload: [{ payload: data[1] }] }))
  assert.match(html, /4.3 \/ 5/)
  assert.match(html, /4 evaluation responses/)
  const empty = renderToStaticMarkup(React.createElement(ActivitySatisfactionChart, { data: [data[0]] }))
  assert.match(empty, /No evaluation responses/)
  assert.doesNotMatch(empty, /NaN|Infinity/)
})

test('admin dashboard leads with summary graphs and keeps detailed comparisons in one switchable panel', () => {
  const { MemoryRouter } = require('react-router-dom')
  const chart = label => () => React.createElement('div', null, label)
  const Page = load('src/pages/admin/AdminDashboard.tsx', {
    '../../features/dashboard/useDashboardData': { useDashboardData: () => ({ data: {
      totalReg: 1, totalAtt: 1, thisWeek: 1, attRate: '100', totalBudgetAllocated: 100, totalBudgetSpent: 20,
      evaluationStats: { totalResponses: 1, averageRating: 4 }, statusBreakdown: [], recentEvaluations: [],
    }, activities: [], loading: false, error: null }) },
    '../../features/dashboard/DashboardControlPanel': { __esModule: true, default: chart('Operational details') },
    '../../features/dashboard/ProgramOverview': { __esModule: true, default: chart('Program details') },
    '../../features/dashboard/DashboardCharts': {
      ParticipationAreaChart: chart('Participation overview graph'), BudgetUsageChart: chart('Budget usage graph'),
    },
    './DashboardCharts': { ActivityRegistrationsChart: chart('Registration graph'), BudgetOverviewChart: chart('Budget graph'), ActivitySatisfactionChart: chart('Satisfaction graph') },
  }).default
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Page)))
  assert.match(html, /<h1[^>]*>Dashboard<\/h1>/)
  assert.doesNotMatch(html, /Your programs, at a glance|dashboard-hero/)
  assert.ok(html.indexOf('Participation overview graph') < html.indexOf('Registration graph'))
  for (const title of ['Registration graph', 'Budget usage graph', 'Participation overview graph', 'Attendees by Sectoral Group']) {
    assert.ok(html.indexOf(title) > html.indexOf('Performance charts'))
    assert.ok(html.indexOf(title) < html.indexOf('Operational details'))
  }
  assert.doesNotMatch(html, /Budget graph|Satisfaction graph/)
  assert.equal((html.match(/role="tab"/g) || []).length, 3)
  assert.match(html, /Activity &amp; program details/)
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/)
})

test('activity comparison tabs render only the selected data view', () => {
  let selected = 'registrations'
  const graphs = { ActivityRegistrationsChart: () => React.createElement('div', null, 'Registration graph'), BudgetOverviewChart: () => React.createElement('div', null, 'Budget graph'), ActivitySatisfactionChart: () => React.createElement('div', null, 'Satisfaction graph') }
  const Comparisons = load('src/features/dashboard/DashboardComparisons.tsx', { react: { useId: () => 'views', useState: () => [selected, next => { selected = next }] }, './DashboardCharts': graphs }).default
  function find(node, role) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(child => find(child, role))
    return [...(node.props?.role === role ? [node] : []), ...find(node.props?.children, role)]
  }
  for (const [index, text] of ['Registration graph', 'Budget graph', 'Satisfaction graph'].entries()) {
    const tabs = find(Comparisons({ data: {} }), 'tab')
    tabs[index].props.onClick()
    const tree = Comparisons({ data: {} })
    assert.equal(find(tree, 'tab').filter(tab => tab.props['aria-selected']).length, 1)
    const html = renderToStaticMarkup(tree)
    assert.match(html, new RegExp(text))
    assert.equal((html.match(/(?:Registration|Budget|Satisfaction) graph/g) || []).length, 1)
  }
})

test('budget ring reports overspending and missing allocation without hiding the actual amounts', () => {
  const { BudgetUsageChart } = load('src/features/dashboard/DashboardCharts.tsx')
  const over = renderToStaticMarkup(React.createElement(BudgetUsageChart, { allocated: 100, spent: 125 }))
  assert.match(over, /125%/)
  assert.match(over, /PHP 125/)
  assert.match(over, /PHP -25/)
  assert.match(over, /over allocation/)
  const missing = renderToStaticMarkup(React.createElement(BudgetUsageChart, { allocated: 0, spent: 10 }))
  assert.match(missing, /N\/A/)
  assert.match(missing, /PHP 10/)
  assert.doesNotMatch(missing, /NaN|Infinity/)
})

test('metric breakdown opens on hover, focus and tap, closes on Escape/blur, and handles missing denominators', () => {
  let open = false
  const Metric = load('src/features/dashboard/DashboardMetricCard.tsx', {
    react: { useId: () => 'metric-detail', useState: () => [open, value => { open = value }] },
  }).default
  const props = { icon: null, color: '#0756a0', label: 'Budget remaining', value: 'PHP -50', caption: 'Spending exceeds allocation', details: [{ label: 'Allocated', value: 'PHP 0' }, { label: 'Spent', value: 'PHP 50' }], note: 'Recorded expenses only.', meter: { value: 50, total: 0, label: 'Budget used' }, to: '/admin/budget', linkLabel: 'View budget' }
  function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return undefined
    if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean)
    return predicate(tree) ? tree : find(tree.props?.children, predicate)
  }
  const tooltip = tree => find(tree, node => node.props?.role === 'tooltip')
  let tree = Metric(props)
  assert.equal(tooltip(tree).props.hidden, true)
  tree.props.onMouseEnter(); tree = Metric(props)
  assert.equal(tooltip(tree).props.hidden, false)
  tree.props.onKeyDown({ key: 'Escape' }); assert.equal(tooltip(Metric(props)).props.hidden, true)
  tree.props.onFocusCapture(); assert.equal(tooltip(Metric(props)).props.hidden, false)
  tree.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null })
  tree = Metric(props)
  find(tree, node => node.type === 'button').props.onClick()
  assert.equal(tooltip(Metric(props)).props.hidden, false)
  const { MemoryRouter } = require('react-router-dom')
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, Metric(props)))
  assert.match(html, /PHP -50/)
  assert.match(html, /aria-describedby="metric-detail"/)
  assert.doesNotMatch(html, /NaN|Infinity/)
})
