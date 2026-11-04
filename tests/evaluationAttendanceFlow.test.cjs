const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')

async function flow(registration, answers = {}, success = true) {
  const state = []
  let index = 0
  const effects = []
  const submissions = []
  const mocks = {
    react: { ...React, useState(initial) {
      const at = index++
      if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial
      return [state[at], (next) => { state[at] = typeof next === 'function' ? next(state[at]) : next }]
    }, useEffect(effect) { effects.push(effect) } },
    'react-router-dom': { useNavigate: () => () => {}, useParams: () => ({ activityId: 'a' }), useSearchParams: () => [new URLSearchParams()] },
    '../../features/public/registrationService': { fetchMyRegistrations: async () => ({ ok: true, data: registration ? [registration] : [] }) },
    '../../features/evaluations/evaluationService': { submitEvaluation: async (payload) => { submissions.push(payload); return { ok: success, error: success ? undefined : 'Submission failed' } }, recordAttendanceForSubmittedEvaluation: async () => ({ ok: true }) },
  }
  const output = ts.transpileModule(fs.readFileSync('src/pages/user/SubmitEvaluation.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const mod = { exports: {} }
  new Function('require', 'exports', 'module', output)((name) => mocks[name] || require(name), mod.exports, mod)
  function render() { index = 0; return mod.exports.default({ markAttendedOnSubmit: true }) }
  render()
  effects[1]()
  await new Promise(setImmediate)
  state[3] = answers
  const tree = render()
  let submit
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    if (node.type === 'button' && node.props.children === 'Submit Evaluation') submit = node.props.onClick
    visit(node.props?.children)
  }
  visit(tree)
  return { state, submissions, submit }
}
const registration = { activityId: 'a', refCode: 'REF', status: 'registered', hasEvaluation: false, hasAttended: false, activityStatus: 'ongoing', checkInOpensAt: '2000-01-01T00:00:00Z' }
const answers = Object.fromEntries(['fb_valuable', 'fb_improve', 'fb_learning', 'fb_attend_again', 'fb_participation', 'fb_time_mgmt', 'q1', 'q2', 'q3', 'q4', 'overall_star'].map((key) => [key, '5']))

test('scanning during the final window opens evaluation without marking attendance', async () => {
  const f = await flow(registration)
  assert.equal(f.state[1], 'ready')
  assert.equal(f.submissions.length, 0)
})
test('every required answer must be completed before submitting', async () => {
  const f = await flow(registration)
  await f.submit()
  assert.equal(f.submissions.length, 0)
  assert.match(f.state[5], /all required questions/)
})
test('successful evaluation requests attendance in the same submission', async () => {
  const f = await flow({ ...registration, activityStatus: 'completed' }, answers)
  await f.submit()
  assert.equal(f.submissions.length, 1)
  assert.equal(f.submissions[0].markAttendedOnSubmit, true)
  assert.equal(f.state[7], true)
})
test('failed submission never shows attendance success', async () => {
  const f = await flow(registration, answers, false)
  await f.submit()
  assert.equal(f.state[7], false)
  assert.equal(f.state[5], 'Submission failed')
})
test('early, manually closed, cancelled and unregistered entries cannot open the form', async () => {
  for (const reg of [{ ...registration, checkInOpensAt: '2100-01-01T00:00:00Z' }, { ...registration, activityStatus: 'closed' }, { ...registration, status: 'inactive' }, null]) {
    const f = await flow(reg)
    assert.notEqual(f.state[1], 'ready')
    assert.equal(f.submit, undefined)
    assert.equal(f.submissions.length, 0)
  }
})
