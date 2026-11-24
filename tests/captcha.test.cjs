const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')

function load(file, mocks = {}, environment = {}) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env', JSON.stringify(environment))
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    return load([base, base + '.ts', base + '.tsx'].find(candidate => fs.existsSync(candidate)), mocks, environment)
  }, module, module.exports)
  return module.exports
}

function hooks() {
  const values = [], refs = [], effects = []
  let stateIndex = 0, refIndex = 0, effectIndex = 0, pending = []
  return {
    react: {
      ...React,
      useState(initial) {
        const index = stateIndex++
        if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial
        return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value }]
      },
      useRef(initial) { return refs[refIndex++] ||= { current: initial } },
      useEffect(effect, dependencies) {
        const index = effectIndex++, previous = effects[index]
        if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
          pending.push(() => { previous?.cleanup?.(); effects[index] = { dependencies, cleanup: effect() } })
        }
      },
    },
    render(callback) { stateIndex = 0; refIndex = 0; effectIndex = 0; return callback() },
    flush() { const work = pending; pending = []; work.forEach(run => run()) },
    unmount() { effects.forEach(effect => effect?.cleanup?.()) },
    refs,
  }
}

function nodes(tree) {
  const found = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(visit)
    found.push(node); visit(node.props?.children)
  }
  visit(tree)
  return found
}

test('login sends a CAPTCHA proof to Supabase without changing legacy calls', async () => {
  const calls = []
  const service = load('src/features/auth/authService.ts', { '../../lib/supabase': { supabase: { auth: { signInWithPassword: async payload => { calls.push(payload); return { error: null } } } } } })
  await service.loginAdmin('user@example.com', 'password', 'verified-proof')
  await service.loginAdmin('user@example.com', 'password')
  assert.deepEqual(calls, [{ email: 'user@example.com', password: 'password', options: { captchaToken: 'verified-proof' } }, { email: 'user@example.com', password: 'password' }])
})

test('staff creation forwards CAPTCHA only to Auth, restores the admin session, and never stores the proof', async () => {
  const calls = []
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'admin-access', refresh_token: 'admin-refresh' } } }),
      signUp: async payload => { calls.push(['auth', payload]); return { data: { user: { id: 'new-facilitator' } }, error: null } },
      setSession: async session => { calls.push(['restore', session]); return { error: null } },
    },
    from: table => ({ insert: async payload => { calls.push([table, payload]); return { error: null } } }),
  }
  const { createFacilitatorAccount } = load('src/features/facilitators/facilitatorService.ts', { '../../lib/supabase': { supabase } })
  assert.deepEqual(await createFacilitatorAccount({ name: 'Test staff', initials: 'TS', email: 'staff@example.com', password: 'password' }, 'staff-proof'), { ok: true })
  assert.equal(calls[0][1].options.captchaToken, 'staff-proof')
  assert.equal(calls[1][0], 'restore')
  assert.equal(calls[2][0], 'admin_users')
  assert.equal(calls[3][0], 'facilitators')
  assert.ok(!JSON.stringify(calls.slice(1)).includes('staff-proof'))
  supabase.auth.signUp = async () => ({ data: {}, error: { code: 'captcha_failed', message: 'CAPTCHA failed' } })
  calls.length = 0
  assert.equal((await createFacilitatorAccount({ name: 'Test', initials: 'T', email: 'staff@example.com', password: 'password' }, 'invalid')).ok, false)
  assert.deepEqual(calls, [])
})

test('CAPTCHA state discards expired and consumed proofs even before a React rerender', () => {
  const runner = hooks()
  const { useCaptcha } = load('src/hooks/useCaptcha.ts', { react: runner.react, '../lib/turnstile': { turnstileSiteKey: 'configured-public-key' } })
  let control = runner.render(useCaptcha)
  assert.equal(control.ready, false)
  control.onToken('verified-proof')
  control = runner.render(useCaptcha)
  assert.equal(control.ready, true)
  control.onToken(null)
  assert.equal(control.getToken(), undefined)
  control.onToken('new-proof')
  control.reset()
  assert.equal(control.getToken(), undefined)
  control = runner.render(useCaptcha)
  assert.equal(control.ready, false)
  assert.equal(control.resetKey, 1)
})

test('CAPTCHA stays optional until a real site key is configured', () => {
  const runner = hooks()
  const { useCaptcha } = load('src/hooks/useCaptcha.ts', { react: runner.react, '../lib/turnstile': { turnstileSiteKey: '' } })
  const control = runner.render(useCaptcha)
  assert.equal(control.enabled, false)
  assert.equal(control.ready, true)
})

test('SDK loading shares one script, supports retries, and reports blocked loading', async () => {
  const previousWindow = global.window, previousDocument = global.document
  const scripts = []
  global.window = { setTimeout, clearTimeout }
  global.document = { createElement: () => ({ remove() { this.removed = true } }), head: { appendChild(script) { scripts.push(script) } } }
  try {
    const { loadTurnstile } = load('src/lib/turnstile.ts')
    const first = loadTurnstile(), second = loadTurnstile()
    assert.equal(first, second)
    assert.equal(scripts.length, 1)
    const rejected = assert.rejects(first, /security check could not load/)
    scripts[0].onerror()
    await rejected
    assert.equal(scripts[0].removed, true)
    const retried = loadTurnstile()
    assert.equal(scripts.length, 2)
    assert.equal(scripts[1].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
    const api = { ready() { assert.fail('Async SDK scripts must use their load event, not turnstile.ready()') }, render() { return 'widget' }, remove() {} }
    global.window.turnstile = api
    scripts[1].onload()
    assert.equal(await retried, api)
  } finally { global.window = previousWindow; global.document = previousDocument }
})

test('widget adapts to narrow screens, clears failed/expired tokens and ignores callbacks after reset or unmount', async () => {
  const previousObserver = global.ResizeObserver
  let resize, width = 240
  global.ResizeObserver = class { constructor(callback) { resize = callback } observe() {} disconnect() {} }
  const runner = hooks(), rendered = [], removed = [], proofs = []
  const api = { render(element, options) { rendered.push(options); return String(rendered.length) }, remove(id) { removed.push(id) } }
  const Component = load('src/components/CaptchaChallenge.tsx', { react: runner.react, '../lib/turnstile': { turnstileSiteKey: 'public-key', loadTurnstile: async () => api } }).default
  let resetKey = 0
  const render = () => runner.render(() => Component({ action: 'signup', resetKey, onToken: token => proofs.push(token) }))
  try {
    const tree = render()
    for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = { getBoundingClientRect: () => ({ width }) }
    runner.flush(); render(); runner.flush(); await Promise.resolve()
    assert.equal(rendered[0].size, 'compact')
    assert.equal(rendered[0]['response-field'], false)
    rendered[0].callback('proof')
    assert.equal(proofs.at(-1), 'proof')
    rendered[0]['expired-callback']()
    assert.equal(proofs.at(-1), null)
    rendered[0]['error-callback']()
    assert.equal(proofs.at(-1), null)
    resetKey++; render(); runner.flush(); await Promise.resolve()
    rendered[0].callback('stale-proof')
    assert.notEqual(proofs.at(-1), 'stale-proof')
    width = 500; resize(); render(); runner.flush(); await Promise.resolve()
    assert.equal(rendered.at(-1).size, 'flexible')
    runner.unmount()
    rendered.at(-1).callback('unmounted-proof')
    assert.notEqual(proofs.at(-1), 'unmounted-proof')
    assert.deepEqual(removed, ['1', '2', '3'])
  } finally { global.ResizeObserver = previousObserver }
})

test('authentication failures distinguish expired CAPTCHA and throttling from bad credentials', () => {
  const { authenticationError } = load('src/lib/turnstile.ts')
  assert.match(authenticationError({ code: 'captcha_failed' }, 'Wrong password'), /security check expired/)
  assert.match(authenticationError({ status: 429 }, 'Wrong password'), /Too many requests/)
  assert.equal(authenticationError({ code: 'invalid_credentials' }, 'Wrong password'), 'Wrong password')
})

function accountForm(kind, { token = 'verified-proof', authenticate = async () => ({ data: { user: { id: 'user' }, session: {} }, error: null }) } = {}) {
  const runner = hooks(), requests = [], navigation = []
  let proof = token, resets = 0
  const storage = { getItem: () => null, setItem() {}, removeItem() {} }
  const captcha = { enabled: true, ready: Boolean(token), resetKey: 0, onToken() {}, getToken: () => proof, reset() { proof = undefined; resets++ } }
  const execute = async (...args) => { requests.push(args); return authenticate() }
  const query = { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { id: 'participant' } }) }
  const Component = load(kind === 'login' ? 'src/pages/admin/AdminLogin.tsx' : 'src/pages/user/ParticipantSignup.tsx', {
    react: runner.react,
    'react-router-dom': { Link: 'a', useNavigate: () => destination => navigation.push(destination), useSearchParams: () => [new URLSearchParams('returnTo=/participant/my-activities')] },
    '../../assets/CYDO LOGO.jpg': { __esModule: true, default: '' },
    '../../hooks/usePageTitle': { usePageTitle() {} },
    '../../hooks/useCaptcha': { useCaptcha: () => captcha },
    '../../components/CaptchaChallenge': { __esModule: true, default: () => null },
    '../../lib/turnstile': load('src/lib/turnstile.ts'),
    '../../features/auth/AuthContext': { useAuth: () => ({ loading: false, role: null }) },
    '../../features/auth/authService': { loginAdmin: execute, getAdminRole: async () => null },
    '../../lib/supabase': { supabase: { auth: { signUp: execute }, from: () => query } },
  }).default
  const render = () => {
    const previousLocal = global.localStorage, previousSession = global.sessionStorage
    global.localStorage = storage; global.sessionStorage = storage
    try { return nodes(runner.render(Component)) } finally { global.localStorage = previousLocal; global.sessionStorage = previousSession }
  }
  function input(id, value) {
    const node = render().find(node => node.props?.id === id)
    node.props.onChange(typeof node.type === 'string' ? { target: { value } } : value)
  }
  input(kind === 'login' ? 'login-email' : 'email', ' user@example.com ')
  input(kind === 'login' ? 'login-password' : 'password', 'valid-password')
  if (kind !== 'login') input('confirmPassword', 'valid-password')
  return {
    requests, navigation, resets: () => resets,
    errorText: () => JSON.stringify(render().filter(node => node.props?.role === 'alert').map(node => node.props.children)),
    async submit() {
      const previousLocal = global.localStorage, previousSession = global.sessionStorage
      global.localStorage = storage; global.sessionStorage = storage
      try { await render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }) }
      finally { global.localStorage = previousLocal; global.sessionStorage = previousSession }
    },
  }
}

for (const kind of ['login', 'signup']) {
  test(`${kind} cannot submit a request with missing or expired verification`, async () => {
    const unverified = accountForm(kind, { token: '' })
    await unverified.submit()
    assert.deepEqual(unverified.requests, [])
    assert.match(unverified.errorText(), /complete the security check/)
    assert.equal(unverified.resets(), 0)
  })

  test(`${kind} forwards one proof and preserves participant redirects`, async () => {
    const form = accountForm(kind)
    await form.submit()
    assert.equal(form.requests.length, 1)
    if (kind === 'login') assert.deepEqual(form.requests[0], ['user@example.com', 'valid-password', 'verified-proof'])
    else assert.deepEqual(form.requests[0], [{ email: 'user@example.com', password: 'valid-password', options: { captchaToken: 'verified-proof' } }])
    assert.equal(form.resets(), 1)
    assert.deepEqual(form.navigation, [kind === 'login' ? '/participant/my-activities' : '/participant/complete-profile?returnTo=%2Fparticipant%2Fmy-activities'])
    await form.submit()
    assert.equal(form.requests.length, 1)
  })

  test(`${kind} shows a CAPTCHA rejection without navigation and requests fresh verification`, async () => {
    const form = accountForm(kind, { authenticate: async () => ({ data: {}, error: { code: 'captcha_failed', message: 'Captcha verification failed' } }) })
    await form.submit()
    assert.match(form.errorText(), /security check expired/)
    assert.equal(form.resets(), 1)
    assert.deepEqual(form.navigation, [])
  })

  test(`${kind} prevents duplicate submissions while verification is being redeemed`, async () => {
    let answer
    const form = accountForm(kind, { authenticate: () => new Promise(resolve => { answer = resolve }) })
    const pending = form.submit()
    await form.submit()
    assert.equal(form.requests.length, 1)
    answer({ data: { user: { id: 'user' }, session: {} }, error: null })
    await pending
    assert.equal(form.navigation.length, 1)
  })
}
