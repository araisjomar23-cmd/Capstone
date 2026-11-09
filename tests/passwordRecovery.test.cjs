const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function harness(mode, overrides = {}) {
  const values = []
  const effects = []
  const calls = []
  let cursor = 0
  let first = true
  const auth = {
    getSession: async () => ({ data: { session: mode === 'reset' ? { user: { id: 'test-user' } } : null }, error: null }),
    resetPasswordForEmail: async (...args) => { calls.push(['request', ...args]); return { error: null } },
    updateUser: async (...args) => { calls.push(['update', ...args]); return { error: null } },
    signOut: async (...args) => { calls.push(['signOut', ...args]); return { error: null } },
    ...overrides,
  }
  const mocks = {
    react: {
      useState(initial) {
        const index = cursor++
        if (!(index in values)) values[index] = initial
        return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value }]
      },
      useEffect(effect) { if (first) effects.push(effect) },
    },
    'react-router-dom': { Link: 'a' },
    '../../lib/supabase': { supabase: { auth } },
    '../../hooks/usePageTitle': { usePageTitle() {} },
    '../../assets/CYDO LOGO.jpg': { default: '' },
    'lucide-react': new Proxy({}, { get: () => () => null }),
  }
  const source = fs.readFileSync('src/pages/user/PasswordRecovery.tsx', 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'window', output)(name => mocks[name] || require(name), module.exports, module, { location: { origin: 'https://prime.example' } })
  const wrapper = module.exports.default({ mode })
  function render() {
    cursor = 0
    const nodes = []
    function visit(node) {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(visit)
      nodes.push(node)
      visit(node.props?.children)
    }
    visit(wrapper.type(wrapper.props))
    first = false
    return nodes
  }
  render()
  effects.forEach(effect => effect())
  return {
    calls,
    values,
    input(id, value) { render().find(node => node.props?.id === id).props.onChange({ target: { value } }) },
    submit() { return render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }) },
    nodes: render,
  }
}

test('reset email uses the trimmed address and same-origin reset callback', async () => {
  const form = harness('request')
  form.input('recovery-email', ' user@example.com ')
  await form.submit()
  assert.deepEqual(form.calls, [['request', 'user@example.com', { redirectTo: 'https://prime.example/reset-password' }]])
  assert.equal(form.values[5], true)
  assert.ok(form.nodes().some(node => node.type === 'p' && String(node.props.children).includes('If an account exists')))
})

test('request rate limits show a retry message without claiming success', async () => {
  const form = harness('request', { resetPasswordForEmail: async () => ({ error: { status: 429 } }) })
  form.input('recovery-email', 'user@example.com')
  await form.submit()
  assert.match(form.values[6], /Too many requests/)
  assert.equal(form.values[5], false)
  assert.equal(form.values[4], false)
})

test('a missing recovery session never exposes the password update form', async () => {
  const form = harness('reset', { getSession: async () => ({ data: { session: null }, error: null }) })
  await Promise.resolve()
  assert.equal(form.values[7], 'invalid')
  assert.equal(form.nodes().some(node => node.type === 'form'), false)
  assert.deepEqual(form.calls, [])
})

test('mismatching passwords never reach the auth update API', async () => {
  const form = harness('reset')
  await Promise.resolve()
  form.input('new-password', 'new-password')
  form.input('confirm-password', 'different-password')
  await form.submit()
  assert.match(form.values[6], /do not match/)
  assert.deepEqual(form.calls, [])
})

test('short passwords never reach the auth update API', async () => {
  const form = harness('reset')
  await Promise.resolve()
  form.input('new-password', 'short')
  form.input('confirm-password', 'short')
  await form.submit()
  assert.match(form.values[6], /at least 6/)
  assert.deepEqual(form.calls, [])
})

test('successful reset updates the password, clears the fields, and ends the recovery session', async () => {
  const form = harness('reset')
  await Promise.resolve()
  form.input('new-password', 'new-password')
  form.input('confirm-password', 'new-password')
  await form.submit()
  assert.deepEqual(form.calls, [['update', { password: 'new-password' }], ['signOut', { scope: 'local' }]])
  assert.equal(form.values[1], '')
  assert.equal(form.values[2], '')
  assert.equal(form.values[5], true)
})

test('expired session at submission returns to the new-link screen', async () => {
  const form = harness('reset', { updateUser: async () => ({ error: { status: 401 } }) })
  await Promise.resolve()
  form.input('new-password', 'new-password')
  form.input('confirm-password', 'new-password')
  await form.submit()
  assert.equal(form.values[7], 'invalid')
  assert.equal(form.values[5], false)
})

test('network failures leave the form available for retry', async () => {
  const form = harness('request', { resetPasswordForEmail: async () => { throw new Error('offline') } })
  form.input('recovery-email', 'user@example.com')
  await form.submit()
  assert.match(form.values[6], /Check your internet/)
  assert.equal(form.values[4], false)
  assert.equal(form.values[5], false)
})
