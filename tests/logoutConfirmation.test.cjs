const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function setup({ approve = async () => true, signOut = async () => ({ error: null }), destination = '/admin/login' } = {}) {
  const calls = { confirmations: [], signOuts: 0, navigation: [], errors: [], busy: [] }
  const mocks = {
    react: { useRef: value => ({ current: value }), useState: initial => [initial, value => calls.busy.push(value)] },
    'react-router-dom': { useNavigate: () => (...args) => calls.navigation.push(args) },
    '../../components/ConfirmationProvider': { useConfirmation: () => async options => { calls.confirmations.push(options); return approve() } },
    '../../components/ToastProvider': { useToast: () => ({ showToast: (...args) => calls.errors.push(args) }) },
    './authService': { logoutAdmin: async () => { calls.signOuts++; return signOut() } },
  }
  const output = ts.transpileModule(fs.readFileSync('src/features/auth/useLogout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    assert.ok(mocks[name], `Unexpected dependency: ${name}`)
    return mocks[name]
  }, module, module.exports)
  return { ...module.exports.useLogout(destination), calls }
}

test('canceling the custom dialog preserves the session and location', async () => {
  const { logout, calls } = setup({ approve: async () => false })
  await logout()
  assert.equal(calls.confirmations[0].confirmLabel, 'Log out')
  assert.equal(calls.confirmations[0].cancelLabel, 'Stay signed in')
  assert.equal(calls.signOuts, 0)
  assert.deepEqual(calls.navigation, [])
})

for (const destination of ['/admin/login', '/']) {
  test(`confirmation signs out before navigating to ${destination}`, async () => {
    let finish
    const { logout, calls } = setup({ destination, signOut: () => new Promise(resolve => { finish = resolve }) })
    const pending = logout()
    await new Promise(setImmediate)
    assert.equal(calls.signOuts, 1)
    assert.deepEqual(calls.navigation, [])
    finish({ error: null })
    await pending
    assert.deepEqual(calls.navigation, [[destination, { replace: true }]])
    assert.deepEqual(calls.busy, [true, false])
  })
}

test('repeated clicks cannot replace an open confirmation or sign out twice', async () => {
  let answer
  const { logout, calls } = setup({ approve: () => new Promise(resolve => { answer = resolve }) })
  const pending = logout()
  await logout()
  assert.equal(calls.confirmations.length, 1)
  assert.equal(calls.signOuts, 0)
  answer(true)
  await pending
  assert.equal(calls.signOuts, 1)
})

test('sign-out errors show feedback, do not navigate, and allow retry', async () => {
  let attempts = 0
  const { logout, calls } = setup({ signOut: async () => ({ error: ++attempts === 1 ? new Error('offline') : null }) })
  await logout()
  assert.deepEqual(calls.navigation, [])
  assert.equal(calls.errors[0][1], 'error')
  await logout()
  assert.equal(calls.signOuts, 2)
  assert.equal(calls.navigation.length, 1)
})

test('unexpected sign-out failures clear busy state and show an error', async () => {
  const { logout, calls } = setup({ signOut: async () => { throw new Error('network failed') } })
  await logout()
  assert.deepEqual(calls.navigation, [])
  assert.deepEqual(calls.busy, [true, false])
  assert.equal(calls.errors.length, 1)
})
