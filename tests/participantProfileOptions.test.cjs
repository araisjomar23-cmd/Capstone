const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(file) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', code)(require, module, module.exports)
  return module.exports
}
const { YOUTH_CLASSES, SECTORAL_GROUPS } = load('src/features/participants/profileOptions.ts')

for (const page of ['CompleteProfile', 'ParticipantProfile']) {
  test(`${page} saves all youth classifications and sectoral groups to database fields`, async () => {
    const source = fs.readFileSync(`src/pages/user/${page}.tsx`, 'utf8')
    const start = source.indexOf(page === 'CompleteProfile' ? '  async function handleSaveProfile()' : '  async function handleSave()')
    const end = source.indexOf(page === 'CompleteProfile' ? '\n  return (' : '\n  function handleCancel()', start)
    const handler = source.slice(start, end).replace('async function handleSaveProfile()', 'async function save()').replace('async function handleSave()', 'async function save()')
    for (const youth of YOUTH_CLASSES) for (const sector of SECTORAL_GROUPS) {
      let payload
      const form = { id: 'p', firstName: 'Test', lastName: 'User', first_name: 'Test', last_name: 'User', birthday: '2006-01-01', gender: 'Male', contact: '09123456789', province: 'Test', city: 'Test', barangay: 'Test', youthClass: youth, sectoral: sector, youth_classification: youth, sectoral_group: sector }
      const capture = (data) => { payload = data; return { error: { message: 'Stop after database write' } } }
      const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) }, from: (table) => { assert.equal(table, 'participants'); return { upsert: async (data) => capture(data), update: (data) => ({ eq: async () => capture(data) }) } } }
      const noop = () => {}
      await new Function('form', 'supabase', 'calcAge', 'setError', 'setSaving', 'setRow', 'setEditing', 'refreshRole', 'requestedReturnTo', 'activityId', 'navigate', `${handler}; return save();`)(form, supabase, () => 20, noop, noop, noop, noop, noop, null, null, noop)
      assert.equal(payload.youth_classification, youth)
      assert.equal(payload.sectoral_group, sector)
    }
  })
}

test('admin participant details display saved classification and sectoral values', () => {
  const Modal = load('src/features/participants/ParticipantModal.tsx').default
  for (const youth of YOUTH_CLASSES) for (const sector of SECTORAL_GROUPS) {
    const html = renderToStaticMarkup(React.createElement(Modal, { participant: { name: 'Test', status: 'not_registered', youthClassification: youth, sectoralGroup: sector, registeredAt: '2026-11-04T00:00:00Z', attendedAt: null, attendanceHistory: [] }, onClose() {} }))
    assert.ok(html.includes(youth))
    assert.ok(html.includes(sector))
  }
})
