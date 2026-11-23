const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { PGlite } = require('@electric-sql/pglite')
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports)
  return module.exports
}
const model = load('src/features/reports/postReportModel.ts')
const datePeriod = load('src/lib/activityDatePeriod.ts', { './calendarDate': load('src/lib/calendarDate.ts') })
const paper = load('src/features/reports/PostActivityReport.tsx', {
  '../activities/activityService': {}, '../activities/activityLifecycle': load('src/features/activities/activityLifecycle.ts'),
  './postReportModel': model, './postReportService': {},
  './ReportDocumentPreview': { default: () => null },
  '../../components/ActivityDateFilter': { default: () => null },
  '../../lib/activityDatePeriod': datePeriod,
})
const activity = { title: 'Youth summit', venue: 'City gym', date: 'Nov 18, 2026', slots: 300, budgetAlloc: 500000, fullDesc: 'Activity background' }

test('post report selection excludes upcoming and ongoing activities and sorts completed runs newest first', () => {
  const rows = [
    { id: 'late', title: 'Future run', startDate: '2027-02-01', endDate: '2027-02-01' },
    { id: 'old', title: 'Previous run', startDate: '2026-10-01', endDate: '2026-10-01' },
    { id: 'new', title: 'Recent run', startDate: '2026-11-21', endDate: '2026-11-21' },
    { id: 'live', title: 'In progress', startDate: '2026-11-23', endDate: '2026-11-23' },
    { id: 'soon', title: 'Next run', startDate: '2026-11-25', endDate: '2026-11-25' },
  ]
  const before = rows.map(row => row.id)
  const result = paper.completedReportActivities(rows, { year: '', month: '' }, '', Date.parse('2026-11-23T12:00:00+08:00'))
  assert.deepEqual(result.map(row => row.id), ['new', 'old'])
  assert.deepEqual(rows.map(row => row.id), before)
  assert.deepEqual(paper.completedReportActivities([], { year: '', month: '' }), [])
})

test('completed report options combine month, year and program filters', () => {
  const rows = [
    { id: 'one', title: 'November education', programId: 'education', startDate: '2026-11-12', endDate: '2026-11-12' },
    { id: 'two', title: 'November environment', programId: 'environment', startDate: '2026-11-13', endDate: '2026-11-13' },
    { id: 'three', title: 'October education', programId: 'education', startDate: '2026-10-20', endDate: '2026-10-20' },
    { id: 'four', title: 'Last year', programId: 'education', startDate: '2025-11-12', endDate: '2025-11-12' },
  ]
  const now = Date.parse('2026-11-23T12:00:00+08:00')
  const ids = (period, program = '') => paper.completedReportActivities(rows, period, program, now).map(row => row.id)
  assert.deepEqual(ids({ year: '2026', month: '11' }), ['two', 'one'])
  assert.deepEqual(ids({ year: '2026', month: '11' }, 'education'), ['one'])
  assert.deepEqual(ids({ year: '2026', month: '' }, 'education'), ['one', 'three'])
  assert.deepEqual(ids({ year: '2027', month: '11' }), [])
})

test('post reports use recorded attendance and published context without inventing outcomes or signatories', () => {
  const fields = model.createPostReport(activity, 128, { beneficiaries: 'Youth leaders', rationale: 'Approved rationale', objectives: 'Build leadership' })
  assert.equal(fields.target, '300')
  assert.equal(fields.attended, '128')
  assert.equal(fields.allocation, '500000')
  assert.equal(fields.background, 'Approved rationale')
  assert.equal(fields.objectives, 'Build leadership')
  assert.equal(fields.highlights, '')
  assert.equal(fields.preparedName, '')
  assert.equal(fields.notedName, '')
  assert.ok(model.postReportIssues(fields).includes('Highlight of the Activity'))
  assert.equal(activity.slots, 300)
})

test('post report validation accepts zero and rejects fractional attendance and invalid amounts', () => {
  const fields = Object.fromEntries(Object.keys(model.postReportLabels).map(key => [key, 'Complete']))
  Object.assign(fields, { target: '0', attended: '0', allocation: '0.00' })
  assert.deepEqual(model.postReportIssues(fields), [])
  fields.attended = '2.5'; fields.allocation = '-1'
  assert.equal(model.postReportIssues(fields).length, 2)
})

test('the printable template includes editable signatories and escapes report text', () => {
  const fields = { ...model.createPostReport(activity, 12), preparedName: '<script>alert(1)</script>', preparedPosition: 'Project officer', notedName: 'Assigned head', notedPosition: 'Office head' }
  const html = renderToStaticMarkup(React.createElement(paper.PostReportPaper, { fields }))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  for (const value of ['Prepared by:', 'Noted by:', 'Project officer', 'Assigned head', 'Office head', 'Background of the Activity', 'OBJECTIVES', 'Budget Allocation']) assert.ok(html.includes(value), value)
})

test('printed report follows every section in the organization template in order', () => {
  const fields = { ...model.createPostReport(activity, 128), beneficiaries: 'Youth leaders', highlights: 'Community action plans presented', background: 'Youth leadership development', objectives: 'Build leadership skills', preparedName: 'Assigned preparer', preparedPosition: 'Project coordinator', notedName: 'Assigned officer', notedPosition: 'Office head' }
  const html = renderToStaticMarkup(React.createElement(paper.PostReportPaper, { fields }))
  const labels = [...html.matchAll(/<dt>(.*?)<\/dt>/g)].map(match => match[1])
  assert.deepEqual(labels, ['Date', 'Event Title', 'Venue', 'Beneficiaries', 'No. of Target Participants', 'Number of Actual Attendees', 'Budget Allocation (PHP)', 'Highlight of the Activity', 'Implementing Office'])
  const sections = ['</dl>', 'Background of the Activity</h3>', 'OBJECTIVES</h3>', 'Prepared by:', 'Noted by:']
  for (let i = 1; i < sections.length; i++) assert.ok(html.indexOf(sections[i]) > html.indexOf(sections[i - 1]), sections[i])
  for (const value of Object.values(fields)) assert.ok(html.includes(value), `Missing report value: ${value}`)
  assert.ok(!html.includes('Reviewed By'))
  assert.ok(!html.includes('Approved By'))
})

test('each template field must be complete to print while drafts can remain incomplete', () => {
  const fields = Object.fromEntries(Object.keys(model.postReportLabels).map(key => [key, 'Completed field']))
  Object.assign(fields, { target: '100', attended: '86', allocation: '500000' })
  assert.deepEqual(model.postReportIssues(fields), [])
  for (const key of Object.keys(fields)) {
    const incomplete = { ...fields, [key]: '  ' }
    assert.deepEqual(model.postReportIssues(incomplete), [model.postReportLabels[key]], key)
  }
})

test('saved reports restrict access to admins, retain signatory edits, and reject stale saves', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated;
    create function public.is_legacy_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$;
    create table public.legacy_activities(id uuid primary key);
    insert into public.legacy_activities values ('00000000-0000-0000-0000-000000000001');`)
  await db.exec(fs.readFileSync('supabase/migrations/20261119020000_activity_post_reports.sql', 'utf8'))
  await db.exec("set role authenticated; set test.admin = 'yes'")
  await db.query("insert into public.activity_post_reports(activity_id, fields) values ($1, $2)", ['00000000-0000-0000-0000-000000000001', JSON.stringify({ preparedName: 'First officer', preparedPosition: 'Coordinator' })])
  const update = `update public.activity_post_reports set fields = $1, revision = revision + 1 where activity_id = '00000000-0000-0000-0000-000000000001' and revision = $2 returning revision`
  assert.equal((await db.query(update, [JSON.stringify({ preparedName: 'Second officer', preparedPosition: 'Project lead' }), 1])).rows.length, 1)
  assert.equal((await db.query(update, ['{}', 1])).rows.length, 0)
  assert.equal((await db.query('select fields from public.activity_post_reports')).rows[0].fields.preparedName, 'Second officer')
  await db.exec("set test.admin = 'no'")
  assert.equal((await db.query('select * from public.activity_post_reports')).rows.length, 0)
  await assert.rejects(db.query("insert into public.activity_post_reports(activity_id, fields) values ('00000000-0000-0000-0000-000000000002', '{}')"), /row-level security/)
  assert.equal((await db.query("update public.activity_post_reports set fields = '{}' returning activity_id")).rows.length, 0)
  await db.exec('reset role; set role anon')
  await assert.rejects(db.query('select * from public.activity_post_reports'), /permission denied/)
})
