const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')

function formHandler({ edit = true, approve = async () => true, save = async () => ({ ok: true }) } = {}) {
  let stateIndex = 0
  let confirmations = 0
  let saves = 0
  let closed = 0
  let saved = 0
  const valid = { title: 'Workshop', programId: 'p1', slots: '10', colorBg: '#1a5c3a', venue: 'Hall', startDate: '2026-11-01', endDate: '2026-11-01', startTime: '09:00', endTime: '10:00', checkInEarlyAccessMinutes: '30', previewDesc: 'Workshop', fullDesc: '', budget: '', note: '' }
  const mocks = {
    react: { ...React, useEffect() {}, useRef: () => ({ current: false }), useState: (initial) => [stateIndex++ === 0 ? valid : initial, () => {}] },
    './activityService': { saveActivity: async (...args) => { saves++; return save(...args) } },
    '../../components/ToastProvider': { useToast: () => ({ showToast() {} }) },
    '../../components/ConfirmationProvider': { useConfirmation: () => async (options) => { confirmations++; assert.equal(options.confirmLabel, 'Save Changes'); return approve() } },
    '../../components/DatePicker': { default: () => null },
  }
  const source = fs.readFileSync('src/features/activities/ActivityFormModal.tsx', 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('require', 'exports', 'module', output)((name) => mocks[name] || require(name), module.exports, module)
  const tree = module.exports.default({ editingActivity: edit ? { id: 'a', status: 'open' } : null, onClose: () => closed++, onSaved: () => saved++ })
  let submit
  function visit(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(visit); if (node.type === 'form') submit = node.props.onSubmit; visit(node.props?.children) }
  visit(tree)
  return { submit: () => submit({ preventDefault() {} }), counts: () => ({ confirmations, saves, closed, saved }) }
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
