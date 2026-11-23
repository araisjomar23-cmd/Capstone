import { budgetTotal, type ProposalFields } from './proposalModel'

export interface ProposalSignatory { role: string; name: string; position: string }
export interface ProposalDraft { fields: ProposalFields; signatories: ProposalSignatory[] }
export const defaultSignatories: ProposalSignatory[] = [
  { role: 'Prepared by', name: '', position: '' },
  { role: 'Recommending approval', name: '', position: '' },
  { role: 'Approved by', name: '', position: '' },
]

export function proposalExportIssues(fields: ProposalFields) {
  const issues: string[] = []
  const required = { title: 'PPA title', programType: 'PPA type / program', venue: 'Venue', beneficiaries: 'Beneficiaries', proponent: 'Proponent', implementingOffice: 'Implementing office', fundingSource: 'Funding source', summary: 'Public summary', rationale: 'Rationale', objectives: 'Objectives', outputs: 'Expected outputs', schedule: 'Implementation plan', startDate: 'Start date', endDate: 'End date', startTime: 'Start time', endTime: 'End time' } as const
  for (const [key, label] of Object.entries(required)) if (!String(fields[key as keyof ProposalFields]).trim()) issues.push(`${label} is required.`)
  if (!Number.isSafeInteger(Number(fields.slots)) || Number(fields.slots) < 1) issues.push('Target participants must be a positive whole number.')
  const start = Date.parse(`${fields.startDate}T${fields.startTime}+08:00`)
  const end = Date.parse(`${fields.endDate}T${fields.endTime}+08:00`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) issues.push('Enter a valid schedule with the end after the start.')
  if (!fields.allocation.trim() || !Number.isFinite(Number(fields.allocation)) || Number(fields.allocation) < 0) issues.push('Enter a valid proposed allocation, including zero if applicable.')
  if (fields.budgetItems.some(row => !row.description.trim() || !Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.unitCost) || row.unitCost < 0)) issues.push('Each expense needs a description, positive quantity and valid unit cost.')
  const hasFractionalCent = (value: number) => Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) > 0.000001
  if (hasFractionalCent(Number(fields.allocation)) || fields.budgetItems.some(row => hasFractionalCent(row.unitCost) || hasFractionalCent(row.quantity * row.unitCost))) issues.push('Use amounts with at most two decimal places, including each expense total.')
  if (Number(fields.allocation) > 0 && !fields.budgetItems.length) issues.push('Add the planned expenses for this allocation.')
  if (fields.budgetItems.length && Math.round(budgetTotal(fields.budgetItems) * 100) !== Math.round(Number(fields.allocation) * 100)) issues.push('The planned expense total must match the proposed allocation.')
  return issues
}

type Block = { kind: 'title' | 'heading' | 'paragraph'; text: string } | { kind: 'table'; rows: string[][] }
const php = (value: number) => `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export function proposalBlocks({ fields: f, signatories }: ProposalDraft): Block[] {
  const paragraph = (text: string): Block => ({ kind: 'paragraph', text })
  return [
    { kind: 'title', text: 'PPA DESIGN' },
    { kind: 'heading', text: 'I. Identifying Information' },
    ...[
      `PPA Title: ${f.title}`, `PPA Type: ${f.programType}`, `PPA Area: ${f.venue}`,
      `PPA Beneficiaries: ${f.beneficiaries.replace(/\n/g, '; ')}`, `Target Participants: ${f.slots}`,
      `PPA Duration: ${f.startDate} to ${f.endDate}`, `Start Time: ${f.startTime}`, `End Time: ${f.endTime}`,
      `PPA Proponent: ${f.proponent}`, `Implementing Office: ${f.implementingOffice}`,
      `Source of Funds: ${f.fundingSource}`, `Budget Allocation: ${php(Number(f.allocation || 0))}`,
      `Public Summary: ${f.summary.replace(/\n/g, ' ')}`,
    ].map(paragraph),
    { kind: 'heading', text: 'II. Rationale' }, paragraph(f.rationale),
    { kind: 'heading', text: 'III. Objectives' }, paragraph(f.objectives),
    { kind: 'heading', text: 'IV. Schedule of Implementation' },
    { kind: 'table', rows: [['Activities', 'PPA Duration', 'Expected Output'], [f.schedule, `${f.startDate} to ${f.endDate}\n${f.startTime}–${f.endTime}`, f.outputs]] },
    { kind: 'heading', text: 'V. Budgetary Requirements' },
    { kind: 'table', rows: [['Expense / calculation', 'Quantity', 'Unit cost', 'Amount'], ...f.budgetItems.map(row => [`${row.description} (${row.quantity} x ${row.unitCost.toFixed(2)})`, String(row.quantity), php(row.unitCost), php(row.quantity * row.unitCost)]), ['TOTAL', '', '', php(budgetTotal(f.budgetItems))]] },
    { kind: 'heading', text: 'VI. Signatories' },
    ...signatories.flatMap(person => [paragraph(`${person.role}:`), paragraph('\n_______________________________'), paragraph(person.name), paragraph(person.position)]),
  ]
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
export function proposalHtml(draft: ProposalDraft) {
  const content = proposalBlocks(draft).map(block => block.kind === 'table'
    ? `<table>${block.rows.map((row, i) => `<tr>${row.map(cell => `<${i ? 'td' : 'th'}>${escape(cell)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`
    : `<${block.kind === 'title' ? 'h1' : block.kind === 'heading' ? 'h2' : 'p'}>${escape(block.text)}</${block.kind === 'title' ? 'h1' : block.kind === 'heading' ? 'h2' : 'p'}>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(draft.fields.title || 'PPA Design')}</title><style>@page{size:A4;margin:20mm}body{font:12pt Cambria,Georgia,serif;color:#111;line-height:1.45;margin:24px auto;max-width:760px}h1{text-align:center;font-size:16pt}h2{font-size:12pt;margin-top:24px;break-after:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0}table{width:100%;border-collapse:collapse;margin:12px 0;table-layout:fixed}th,td{border:1px solid #555;padding:8px;text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10pt}tr{break-inside:avoid}thead{display:table-header-group}@media print{body{margin:0;max-width:none}}</style></head><body>${content}</body></html>`
}

// A small uncompressed ZIP writer keeps Word export local, without another library.
// OOXML needs only these package parts; Word and LibreOffice can edit the result.
function zip(parts: Record<string, string>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0, directorySize = 0
  const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
    return (crc ^ 0xffffffff) >>> 0
  }
  const join = (arrays: Uint8Array[]) => { const result = new Uint8Array(arrays.reduce((sum, row) => sum + row.length, 0)); let index = 0; for (const row of arrays) { result.set(row, index); index += row.length } return result }
  for (const [path, text] of Object.entries(parts)) {
    const name = encoder.encode(path), data = encoder.encode(text), crc = crc32(data)
    const header = new Uint8Array(30), h = new DataView(header.buffer)
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 33, true)
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true)
    local.push(header, name, data)
    const entry = new Uint8Array(46), e = new DataView(entry.buffer)
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x800, true); e.setUint16(14, 33, true)
    e.setUint32(16, crc, true); e.setUint32(20, data.length, true); e.setUint32(24, data.length, true); e.setUint16(28, name.length, true); e.setUint32(42, offset, true)
    central.push(entry, name); directorySize += entry.length + name.length; offset += header.length + name.length + data.length
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, central.length / 2, true); e.setUint16(10, central.length / 2, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true)
  return join([...local, ...central, end])
}
export function proposalDocx(draft: ProposalDraft): Uint8Array<ArrayBuffer> {
  const run = (text: string, bold = false) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`
  const paragraph = (text: string, bold = false, center = false) => text.split('\n').map(line => `<w:p><w:pPr><w:spacing w:after="120"/>${center ? '<w:jc w:val="center"/>' : ''}${bold ? '<w:keepNext/>' : ''}</w:pPr>${run(line, bold)}</w:p>`).join('')
  const body = proposalBlocks(draft).map(block => block.kind === 'table'
    ? `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="555555"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${block.rows[0].map(() => `<w:gridCol w:w="${Math.floor(9638 / block.rows[0].length)}"/>`).join('')}</w:tblGrid>${block.rows.map((row, index) => `<w:tr><w:trPr>${index === 0 ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${row.map(cell => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9638 / row.length)}" w:type="dxa"/></w:tcPr>${paragraph(cell, index === 0)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
    : paragraph(block.text, block.kind !== 'paragraph', block.kind === 'title')).join('')
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
  })
}

export function downloadProposalWord(draft: ProposalDraft) {
  const url = URL.createObjectURL(new Blob([proposalDocx(draft)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
  const link = document.createElement('a'); link.href = url; link.download = `${draft.fields.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 100) || 'PPA Design'}.docx`
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function printProposalPdf(draft: ProposalDraft) {
  const frame = document.createElement('iframe'); frame.title = 'Proposal PDF preview'
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument, target = frame.contentWindow
  if (!doc || !target) { frame.remove(); throw new Error('Unable to open the PDF print dialog. Please retry.') }
  doc.open(); doc.write(proposalHtml(draft)); doc.close()
  target.addEventListener('afterprint', () => frame.remove(), { once: true })
  void doc.fonts.ready.then(() => { target.focus(); target.print() })
}
