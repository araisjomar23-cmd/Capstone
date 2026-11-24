const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')
const path = require('node:path')
function load(file) {
  file = path.resolve(file)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText
  const mod = {exports: {}}
  new Function('require', 'exports', output)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name.replace(/\.ts$/, '') + '.ts')) : require(name), mod.exports)
  return mod.exports
}
const model = load('src/features/evaluations/organizationEvaluation.ts')

async function flow(registration, answers = {}, success = true, feedback = 'Nindot ang training.') {
  const state = []
  let index = 0
  const effects = []
  const lock = {current: false}
  const submissions = []
  const mocks = {
    react: { ...React, useState(initial) {
      const at = index++
      if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial
      return [state[at], (next) => { state[at] = typeof next === 'function' ? next(state[at]) : next }]
    }, useRef: () => lock, useEffect(effect) { effects.push(effect) } },
    'react-router-dom': { useNavigate: () => () => {}, useParams: () => ({ activityId: 'a' }), useSearchParams: () => [new URLSearchParams()] },
    '../../features/evaluations/organizationEvaluation': model,
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
  state[4] = feedback
  const tree = render()
  let submit
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    if (node.type === 'button' && node.props.children === 'Submit Evaluation') submit = node.props.onClick
    visit(node.props?.children)
  }
  visit(tree)
  return { state, submissions, submit, tree, render }
}
const registration = { activityId: 'a', refCode: 'REF', status: 'registered', hasEvaluation: false, hasAttended: false, activityStatus: 'ongoing', checkInOpensAt: '2000-01-01T00:00:00Z' }
const answers = {facilitator_name: 'Training Facilitator', ...Object.fromEntries(model.ASSESSMENT_QUESTIONS.map(question => [question.key, 'Excellent']))}

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

test('organization form requires comments or suggestions and submits only the new questions', async () => {
  const missingComment = await flow(registration, answers, true, '   ')
  await missingComment.submit()
  assert.equal(missingComment.submissions.length, 0)
  const f = await flow(registration, answers)
  await f.submit()
  const payload = f.submissions[0]
  assert.equal(payload.responses.form_version, model.ASSESSMENT_VERSION)
  assert.equal(payload.responses.facilitator_name, 'Training Facilitator')
  assert.equal(payload.rating, 5)
  assert.equal(payload.wouldRecommend, false)
  assert.equal(payload.feedback, 'Nindot ang training.')
  for (const omitted of ['name', 'age', 'address', 'contact', 'organization', 'q1', 'q4', 'fb_improve', 'overall_star']) assert.ok(!(omitted in payload.responses))
})

test('rating choices are visible radios with no dropdowns, with multiple suggestion checkboxes', async () => {
  const {renderToStaticMarkup} = require('react-dom/server')
  const f = await flow(registration)
  const html = renderToStaticMarkup(f.tree)
  assert.equal((html.match(/type="radio"/g) || []).length, 35)
  assert.doesNotMatch(html, /<select/)
  assert.match(html, /Comments \/ Suggestions/)
  assert.equal((html.match(/role="checkbox"/g) || []).length, 8)
  assert.doesNotMatch(html, /aria-checked="true"/)
})

test('selecting and deselecting suggestions preserves the typed comment through submission', async () => {
  const comment = 'The examples were helpful.'
  const f = await flow(registration, {...answers}, true, comment)
  function chip(tree, label) {
    if (!tree || typeof tree !== 'object') return
    if (Array.isArray(tree)) return tree.map(node => chip(node, label)).find(Boolean)
    if (tree.props?.role === 'checkbox' && tree.props.children.includes(label)) return tree
    return chip(tree.props?.children, label)
  }
  chip(f.tree, 'More hands-on activities').props.onClick()
  chip(f.render(), 'More time for questions').props.onClick()
  assert.ok(f.state[4].startsWith(comment))
  assert.equal(model.assessmentSuggestionsInText(f.state[4]).length, 2)
  chip(f.render(), 'More hands-on activities').props.onClick()
  const current = f.render()
  assert.ok(f.state[4].startsWith(comment))
  assert.deepEqual(model.assessmentSuggestionsInText(f.state[4]).map(item => item.id), ['questions'])
  let submit
  function find(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(find)
    if (node.type === 'button' && node.props.children === 'Submit Evaluation') submit = node.props.onClick
    find(node.props?.children)
  }
  find(current)
  await submit()
  assert.equal(f.submissions[0].responses.written_comment, f.state[4].trim())
  assert.equal(f.submissions[0].responses.feedback_format, model.EDITABLE_FEEDBACK_FORMAT)
  assert.match(f.submissions[0].feedback, /Please allow more time for questions and discussion/)
  assert.ok(f.submissions[0].feedback.startsWith(comment))
  assert.doesNotMatch(f.submissions[0].feedback, /hands-on/)
})

test('suggestions alone can answer Comments / Suggestions without a forced extra comment', async () => {
  const text = model.toggleAssessmentSuggestion(model.toggleAssessmentSuggestion('', 'hands-on').text, 'examples').text
  const f = await flow(registration, {...answers}, true, text)
  await f.submit()
  assert.equal(f.submissions.length, 1)
  assert.equal(f.submissions[0].responses.written_comment, text.trim())
  assert.equal(model.selectedAssessmentSuggestions(f.submissions[0].responses).length, 2)
  assert.match(f.submissions[0].feedback, /hands-on/)
  assert.match(f.submissions[0].feedback, /real-life examples/)
})
