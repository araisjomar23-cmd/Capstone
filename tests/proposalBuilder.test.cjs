const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const mammoth = require('mammoth')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
function load(relative, mocks = {}) {
  const file = path.resolve(relative), module = { exports: {} }
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', output)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (!name.startsWith('.')) return require(name)
    const base = path.resolve(path.dirname(file), name)
    return load([base, base + '.ts', base + '.tsx'].find(candidate => fs.existsSync(candidate)), mocks)
  }, module, module.exports)
  return module.exports
}
const { emptyProposal } = load('src/features/proposals/proposalModel.ts')
const { proposalDocx, proposalHtml, proposalBlocks, proposalExportIssues, defaultSignatories } = load('src/features/proposals/proposalExport.ts')
const fields = { ...structuredClone(emptyProposal), title: 'Youth skills & leadership', programType: 'Education', venue: 'Panabo hall', slots: '20', beneficiaries: '10 student leaders and 10 youth volunteers', proponent: 'Youth team', implementingOffice: 'CYDO', fundingSource: 'Local youth fund', startDate: '2027-01-12', endDate: '2027-01-12', startTime: '08:00', endTime: '17:00', summary: 'Learn leadership skills.', rationale: 'Build community leadership.', objectives: 'Develop planning skills.', schedule: 'Group workshop and presentations', outputs: 'Twenty youth complete the workshop.', allocation: '300', budgetItems: [{ description: 'Snacks', quantity: 20, unitCost: 15 }] }
const draft = { fields, signatories: defaultSignatories.map((person, i) => ({ ...person, name: `Officer ${i + 1}`, position: 'Youth officer' })) }

test('exports require a complete proposal and reconcile costs without requiring approval or publication', () => {
  assert.deepEqual(proposalExportIssues(fields), [])
  assert.ok(proposalExportIssues(emptyProposal).length > 10)
  assert.ok(proposalExportIssues({ ...fields, allocation: '301' }).some(issue => issue.includes('must match')))
  assert.ok(proposalExportIssues({ ...fields, allocation: '300.01' }).some(issue => issue.includes('must match')))
  assert.ok(proposalExportIssues({ ...fields, slots: '2.5' }).some(issue => issue.includes('whole number')))
  assert.ok(proposalExportIssues({ ...fields, endTime: '07:00' }).some(issue => issue.includes('end after')))
  assert.ok(proposalExportIssues({ ...fields, allocation: '300.001' }).some(issue => issue.includes('two decimal places')))
  assert.ok(proposalExportIssues({ ...fields, budgetItems: [{ description: 'Bad', quantity: NaN, unitCost: 1 }] }).some(issue => issue.includes('valid unit cost')))
})

test('Word export is a readable editable DOCX with tables, Unicode, signatories and blank signature lines', async () => {
  const buffer = Buffer.from(proposalDocx({ ...draft, fields: { ...fields, title: 'Kabatan-onan – Pag-uswag & <Learning>' } }))
  assert.equal(buffer.readUInt32LE(0), 0x04034b50)
  const result = await mammoth.convertToHtml({ buffer })
  assert.match(result.value, /Kabatan-onan – Pag-uswag &amp; &lt;Learning&gt;/)
  assert.match(result.value, /<table>/)
  assert.match(result.value, /Unit cost/)
  assert.match(result.value, /PHP 300.00/)
  assert.match(result.value, /Officer 3/)
  assert.match(result.value, /________________/)
  assert.doesNotMatch(result.value, /reviewNote|facilitatorIds|Approved allocation/)
})

test('generated proposal fields can be extracted by the existing signed-upload parser', () => {
  const { parseProposal } = load('src/features/proposals/parseProposal.ts')
  const text = proposalBlocks(draft).map(block => block.kind === 'table' ? block.rows.map(row => row.map(cell => cell.replace(/\n/g, ' ')).join(' | ')).join('\n') : block.text).join('\n')
  const parsed = parseProposal([{ page: null, text, method: 'text' }])
  for (const key of ['title', 'programType', 'venue', 'slots', 'startDate', 'endDate', 'startTime', 'endTime', 'rationale', 'objectives', 'summary', 'allocation', 'beneficiaries', 'outputs']) assert.equal(parsed.fields[key], fields[key], key)
  assert.deepEqual(parsed.fields.budgetItems, fields.budgetItems)
  assert.ok(!parsed.extraction.warnings.some(warning => warning.includes('differs')))
})

test('Word paragraphs preserve multiline rationale and objectives when read back', async () => {
  const { parseProposal } = load('src/features/proposals/parseProposal.ts')
  const multiline = { ...fields, rationale: 'First paragraph.\nSecond paragraph.', objectives: 'Build skills.\nPractice teamwork.' }
  const result = await mammoth.extractRawText({ buffer: Buffer.from(proposalDocx({ ...draft, fields: multiline })) })
  const parsed = parseProposal([{ page: null, text: result.value, method: 'text' }])
  assert.equal(parsed.fields.rationale, multiline.rationale)
  assert.equal(parsed.fields.objectives, multiline.objectives)
})

test('signed-upload parser preserves short expected outputs', () => {
  const { parseProposal } = load('src/features/proposals/parseProposal.ts')
  const text = proposalBlocks({ ...draft, fields: { ...fields, outputs: '20 kits' } }).map(block => block.kind === 'table' ? block.rows.map(row => row.map(cell => cell.replace(/\n/g, ' ')).join(' | ')).join('\n') : block.text).join('\n')
  assert.equal(parseProposal([{ page: null, text, method: 'text' }]).fields.outputs, '20 kits')
})

test('PDF print markup escapes entered content and matches the Word document sections', () => {
  const html = proposalHtml({ ...draft, fields: { ...fields, rationale: '<script>alert(1)</script> & youth' } })
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; youth/)
  for (const label of ['PPA DESIGN', 'Identifying Information', 'Objectives', 'Schedule of Implementation', 'Budgetary Requirements', 'Signatories', 'Officer 1']) assert.ok(html.includes(label))
  assert.match(html, /size:A4/)
})

test('PDF export opens the print document and cleans up its frame after printing', async () => {
  const { printProposalPdf } = load('src/features/proposals/proposalExport.ts')
  const oldDocument = global.document
  let written = '', printed = false, removed = false, afterPrint
  const frame = { style: {}, contentDocument: { open() {}, write(html) { written = html }, close() {}, fonts: { ready: Promise.resolve() } }, contentWindow: { addEventListener(name, fn) { if (name === 'afterprint') afterPrint = fn }, focus() {}, print() { printed = true } }, remove() { removed = true } }
  global.document = { createElement: () => frame, body: { appendChild() {} } }
  try {
    printProposalPdf(draft); await Promise.resolve()
    assert.ok(printed); assert.match(written, /Youth skills &amp; leadership/)
    assert.match(written, /PHP 300.00/)
    afterPrint(); assert.ok(removed)
  } finally { global.document = oldDocument }
})

test('manual proposal form exports documents and never provides direct publication', () => {
  let step = 0, index = 0
  const Builder = load('src/features/proposals/ProposalBuilder.tsx', { '../activities/activityService': { fetchPrograms: async () => [] }, react: { ...React, useEffect: () => {}, useRef: () => ({ current: null }), useState: initial => [index++ === 4 ? step : typeof initial === 'function' ? initial() : initial, () => {}] } }).default
  const render = () => { index = 0; return renderToStaticMarkup(React.createElement(Builder, { onClose() {}, onUpload() {} })) }
  assert.match(render(), /PPA title/)
  step = 3
  const html = render()
  assert.match(html, /Download Word \(.docx\)/)
  assert.match(html, /Print \/ Save PDF/)
  assert.match(html, /does not create an activity/)
  assert.doesNotMatch(html, /Publish activity|Create Activity/)
})
