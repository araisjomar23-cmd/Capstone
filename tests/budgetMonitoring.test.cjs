const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(file, mocks = {}) {
  file = path.resolve(file)
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
const { summarizeBudgets } = load('src/features/budget/budgetSummary.ts')
const activity = (id, props = {}) => ({ id, title: 'Activity ' + id, programId: 'p1', programName: 'Program A', startDate: '2026-11-01', endDate: '2026-11-01', status: 'open', manuallyClosed: false, budgetAlloc: 100, budgetSpent: 120, ...props })

test('program budgets use sums, preserve negative balances and keep same-named programs separate', () => {
  const result = summarizeBudgets([activity('a', { budgetAlloc: 0.1, budgetSpent: 0.2 }), activity('b', { budgetAlloc: 0.2, budgetSpent: 0.1 }), activity('c', { programId: 'p2', budgetAlloc: 100, budgetSpent: 125 })])
  assert.equal(result.programs.length, 2)
  assert.equal(result.programs[0].allocated, 0.3)
  assert.equal(result.programs[0].spent, 0.3)
  assert.equal(result.programs[0].remaining, 0)
  assert.equal(result.programs[1].remaining, -25)
  assert.equal(result.programs[1].utilization, 125)
  assert.equal(summarizeBudgets([activity('zero', { budgetAlloc: 0, budgetSpent: 10 })]).utilization, null)
})

function budgetService(entries, failure = '') {
  const supabase = { from(table) { const query = { select() { return query }, order() { return query }, then(resolve, reject) { return Promise.resolve({ data: table === 'budget_entries' ? entries : [], error: table === failure ? { message: 'Read failed' } : null }).then(resolve, reject) } }; return query } }
  return load('src/features/budget/budgetService.ts', {
    '../../lib/supabase': { supabase },
    '../activities/activityService': { async fetchActivities(strict) { assert.equal(strict, true); return [activity('a', { budgetAlloc: 9999, budgetSpent: 9999 })] } },
  })
}
const ledger = (type, amount, id = type) => ({ id, activity_id: 'a', entry_type: type, amount, recorded_at: '2026-11-01T00:00:00Z' })

test('one ledger snapshot reconciles activity cards, expense rows and overview totals after corrections/deletions', async () => {
  const entries = [ledger('allocation', '100.10'), ledger('allocation', '0.20', 'extra'), ledger('expense', '120.15')]
  let result = await budgetService(entries).fetchBudgetOverview()
  assert.equal(result.totalAlloc, 100.3)
  assert.equal(result.totalSpent, 120.15)
  assert.equal(result.totalRemain, -19.85)
  assert.equal(result.activities[0].budgetSpent, result.entriesByActivity.a[0].amount)
  entries[2].amount = '80.15'
  result = await budgetService(entries).fetchBudgetOverview()
  assert.equal(result.totalRemain, 20.15)
  entries.pop()
  result = await budgetService(entries).fetchBudgetOverview()
  assert.equal(result.totalSpent, 0)
  assert.deepEqual(result.entriesByActivity, {})
})

test('budget and audit failures or invalid amounts cannot silently produce zero totals', async () => {
  for (const table of ['budget_entries', 'budget_entry_audit']) await assert.rejects(budgetService([], table).fetchBudgetOverview(), /Unable to load/)
  await assert.rejects(budgetService([ledger('expense', 'invalid')]).fetchBudgetOverview(), /invalid/)
})

function renderBudget(activities, selected = null, program = '') {
  let index = 0
  const states = [{ year: '2026', month: '11' }, { activities, entriesByActivity: {}, auditByActivity: {} }, false, '', selected, program]
  const Page = load('src/pages/admin/AdminBudget.tsx', {
    react: { ...React, useState: initial => React.useState(index < states.length ? states[index++] : initial) },
    '../../lib/supabase': { supabase: {} }, '../../components/ToastProvider': { useToast: () => ({ showToast() {} }) },
    '../../features/budget/budgetService': {},
  }).default
  return renderToStaticMarkup(React.createElement(Page))
}

test('budget date/program filters drive the same totals, summaries and activity cards', () => {
  const html = renderBudget([activity('included'), activity('other-program', { programId: 'p2', programName: 'Program B' }), activity('previous', { startDate: '2025-11-01', endDate: '2025-11-01' })], null, 'p1')
  assert.doesNotMatch(html, /Budget by program/)
  assert.match(html, /Activity included/)
  assert.doesNotMatch(html, /Activity other-program|Activity previous/)
  assert.match(html, /120%/)
  assert.match(html, /-20/)
  assert.match(html, /Remaining/)
  const overview = renderBudget([activity('included'), activity('other-program', { programId: 'p2', programName: 'Program B' })])
  assert.doesNotMatch(overview, /Budget by program/)
  assert.match(overview, /Activity included/)
  assert.match(overview, /Activity other-program/)
})

test('zero-allocation spending remains visible in summaries and activity details', () => {
  const item = activity('a', { budgetAlloc: 0, budgetSpent: 10 })
  const summary = renderBudget([item])
  assert.match(summary, /Spending without allocation/)
  assert.match(summary, /N\/A/)
  assert.match(summary, /-10/)
  const detail = renderBudget([item], 'a')
  assert.match(detail, /Spending is recorded without an allocation/)
  assert.match(detail, /Allocate budget/)
  assert.match(detail, /N\/A/)
})

test('a program remains selectable when it has no activities in the current period', () => {
  const html = renderBudget([activity('current'), activity('older', { programId: 'p2', programName: 'Program B', startDate: '2025-01-01', endDate: '2025-01-01' })], null, 'p2')
  assert.match(html, /<option value="p2" selected="">Program B<\/option>/)
  assert.match(html, /No activities match the selected dates and program/)
  assert.doesNotMatch(html, /Activity current|Activity older/)
})

test('changing dates preserves the program; changing programs exits activity details', () => {
  let index = 0, filters
  const states = [{ year: '2026', month: '11' }, { activities: [activity('a')], entriesByActivity: {}, auditByActivity: {} }, false, '', null, 'p1']
  const Page = load('src/pages/admin/AdminBudget.tsx', {
    react: { ...React, useState(initial) {
      const slot = index++
      const [value] = React.useState(slot < states.length ? states[slot] : initial)
      return [value, next => { states[slot] = typeof next === 'function' ? next(states[slot]) : next }]
    } },
    '../../components/ActivityDateFilter': { __esModule: true, default: props => { filters = props; return React.createElement('div', null, props.actions) } },
    '../../lib/supabase': { supabase: {} }, '../../components/ToastProvider': { useToast: () => ({ showToast() {} }) }, '../../features/budget/budgetService': {},
  }).default
  renderToStaticMarkup(React.createElement(Page))
  states[4] = 'a'
  filters.onChange({ year: '2026', month: '12' })
  assert.equal(states[5], 'p1')
  assert.equal(states[4], null)
  const select = React.Children.toArray(filters.actions.props.children).find(child => React.isValidElement(child) && child.type === 'select')
  states[4] = 'a'
  select.props.onChange({ target: { value: '' } })
  assert.equal(states[5], '')
  assert.equal(states[4], null)
})
