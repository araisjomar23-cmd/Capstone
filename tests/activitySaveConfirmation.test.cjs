const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')

const descriptionModule = { exports: {} }
new Function('exports', ts.transpileModule(fs.readFileSync('src/features/activities/activityDescription.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(descriptionModule.exports)

test('one description preserves legacy content and avoids duplicate text', () => {
  const { activityDescription } = descriptionModule.exports
  assert.equal(activityDescription('Summary', 'Details'), 'Summary\n\nDetails')
  assert.equal(activityDescription('Same', 'Same'), 'Same')
  assert.equal(activityDescription('Summary', 'Summary and details'), 'Summary and details')
  assert.equal(activityDescription('', 'Full details'), 'Full details')
  assert.equal(activityDescription('Description', ''), 'Description')
})

function formHandler({ edit = true, repeat = false, viewOnly = false, status = 'open', initialize = false, approve = async () => true, save = async () => ({ ok: true }) } = {}) {
  let stateIndex = 0
  let seededForm
  let confirmations = 0
  let saves = 0
  let closed = 0
  let saved = 0
  const valid = { title: 'Workshop', programId: 'p1', slots: '10', colorBg: '#1a5c3a', venue: 'Hall', startDate: '2026-11-01', endDate: '2026-11-01', startTime: '09:00', endTime: '10:00', checkInEarlyAccessMinutes: '30', previewDesc: 'Workshop', fullDesc: '', budget: '', note: '' }
  const mocks = {
    './activityDescription': descriptionModule.exports,
    '../../components/TimePicker': { __esModule: true, default: () => null },
    react: { ...React, useEffect(effect) { if (initialize) effect() }, useRef: () => ({ current: false }), useState: (initial) => { const index = stateIndex++; return [index === 0 ? valid : initial, (value) => { if (index === 0) seededForm = value }] } },
    './activityLifecycle': { getActivityLifecycleStatus: () => 'upcoming', getActivityDisplayStatus: (a) => a.status === 'closed' ? 'closed' : 'upcoming', ACTIVITY_STATUS_DISPLAY: { upcoming: { label: 'Upcoming', cls: '' }, closed: { label: 'Closed', cls: '' } } },
    './activityService': { fetchPrograms: async () => [], fetchFacilitators: async () => [], fetchActivityFacilitators: async () => [], saveActivity: async (...args) => { saves++; return save(...args) } },
    '../../components/ToastProvider': { useToast: () => ({ showToast() {} }) },
    '../../components/ConfirmationProvider': { useConfirmation: () => async (options) => { confirmations++; assert.equal(options.confirmLabel, repeat ? 'Create New Run' : 'Save Changes'); return approve() } },
    '../../components/DatePicker': { __esModule: true, default: () => null },
  }
  const source = fs.readFileSync('src/features/activities/ActivityFormModal.tsx', 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('require', 'exports', 'module', output)((name) => mocks[name] || require(name), module.exports, module)
  const tree = module.exports.default({ viewOnly, editingActivity: edit ? { id: 'a', status, budgetSpent: 0, regCount: 2, slots: 10 } : null, repeatActivity: repeat ? { ...valid, slots: 10, budgetAlloc: 1000, startDate: '2000-01-01', endDate: '2000-01-01', id: 'completed-run', tags: [], outcomes: [], schedule: [], bring: [] } : null, onClose: () => closed++, onSaved: () => saved++ })
  let submit
  function visit(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(visit); if (node.type === 'form') submit = node.props.onSubmit; visit(node.props?.children) }
  visit(tree)
  return { tree, seededForm: () => seededForm, submit: () => submit({ preventDefault() {} }), counts: () => ({ confirmations, saves, closed, saved }) }
}

test('edit waits for system confirmation and saves only after approval', async () => {
  let resolve
  const handler = formHandler({ approve: () => new Promise((r) => { resolve = r }) })
  const pending = handler.submit()
  assert.equal(handler.counts().saves, 0)
  await handler.submit()
  assert.equal(handler.counts().confirmations, 1)
  resolve(true)
  await pending
  assert.deepEqual(handler.counts(), { confirmations: 1, saves: 1, closed: 1, saved: 1 })
})
test('Keep Editing cancels the save and leaves the form open', async () => {
  const handler = formHandler({ approve: async () => false })
  await handler.submit()
  assert.deepEqual(handler.counts(), { confirmations: 1, saves: 0, closed: 0, saved: 0 })
  await handler.submit()
  assert.equal(handler.counts().confirmations, 2)
})
test('publishing a new activity keeps its existing flow', async () => {
  const handler = formHandler({ edit: false })
  await handler.submit()
  assert.deepEqual(handler.counts(), { confirmations: 0, saves: 1, closed: 1, saved: 1 })
})
test('a failed save keeps the form open and permits retry', async () => {
  const handler = formHandler({ save: async () => { throw new Error('Connection failed') } })
  await handler.submit()
  await handler.submit()
  assert.deepEqual(handler.counts(), { confirmations: 2, saves: 2, closed: 0, saved: 0 })
})

test('a repeated activity saves as a new ID linked to its source, without using the old ID', async () => {
  const handler = formHandler({ edit: false, repeat: true, save: async (payload, facilitators, editingId) => {
    assert.equal(editingId, null)
    assert.equal(payload.previousActivityId, 'completed-run')
    return { ok: true }
  } })
  await handler.submit()
  assert.deepEqual(handler.counts(), { confirmations: 1, saves: 1, closed: 1, saved: 1 })
})
test('cancelling a new run leaves the completed activity untouched', async () => {
  const handler = formHandler({ edit: false, repeat: true, approve: async () => false })
  await handler.submit()
  assert.deepEqual(handler.counts(), { confirmations: 1, saves: 0, closed: 0, saved: 0 })
})

test('new-run form clears historical dates and budget while preserving activity details', async () => {
  const handler = formHandler({ edit: false, repeat: true, initialize: true })
  await new Promise(setImmediate)
  const form = handler.seededForm()
  assert.equal(form.title, 'Workshop')
  assert.equal(form.slots, '10')
  assert.equal(form.startDate, '')
  assert.equal(form.endDate, '')
  assert.equal(form.budget, '')
})

test('activity View mode is read-only, exposes management controls and cannot submit a save', async () => {
  const handler = formHandler({ viewOnly: true })
  const fieldsets = []
  const buttons = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    if (node.type === 'fieldset') fieldsets.push(node)
    if (node.type === 'button') buttons.push(node)
    visit(node.props?.children)
  }
  visit(handler.tree)
  assert.equal(fieldsets.length, 1)
  assert.equal(fieldsets[0].props.disabled, true)
  assert.ok(buttons.some((button) => button.props.children === 'Edit Activity'))
  assert.ok(buttons.some((button) => button.props.children === 'Close Activity'))
  assert.ok(!buttons.some((button) => button.props.type === 'submit'))
  await handler.submit()
  assert.deepEqual(handler.counts(), { confirmations: 0, saves: 0, closed: 0, saved: 0 })
})

test('closed activity details show Closed and Reopen Activity together', () => {
  const { renderToStaticMarkup } = require('react-dom/server')
  const handler = formHandler({ viewOnly: true, status: 'closed' })
  const html = renderToStaticMarkup(handler.tree)
  assert.match(html, />Closed<\/span>/)
  assert.match(html, /Reopen Activity/)
  assert.match(html, /Closed by an administrator/)
})
