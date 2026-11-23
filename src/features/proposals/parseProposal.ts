import { emptyProposal, type Extraction, type ProposalFields, type SourcePage } from './proposalModel'

const clean = (value: string) => value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim()
const money = (value: string) => Number(value.replace(/,/g, ''))

export function parseProposal(pages: SourcePage[]): { fields: ProposalFields; extraction: Extraction } {
  const fields = structuredClone(emptyProposal)
  const warnings: string[] = []
  const sources: Extraction['sources'] = {}
  const text = pages.map(page => page.text).join('\n').replace(/\r/g, '')
  const lines = text.split('\n').map(clean).filter(Boolean)
  function source(key: string, excerpt: string) {
    const page = pages.find(page => page.text.replace(/\s+/g, ' ').includes(excerpt.replace(/\s+/g, ' ')))
    sources[key] = { page: page?.page ?? null, excerpt: excerpt.slice(0, 1200) }
  }
  const mappings: [keyof ProposalFields, RegExp][] = [
    ['title', /^(?:PPA\s*)?Title\s*[:：]\s*(.*)/i], ['programType', /^PPA\s*Type\s*[:：]\s*(.*)/i],
    ['venue', /^PPA\s*Area\s*[:：]\s*:?(.*)/i], ['beneficiaries', /^PPA\s*Beneficiaries\s*[:：]\s*(.*)/i],
    ['schedule', /^PPA\s*Duration\s*[:：]\s*(.*)/i], ['proponent', /^PPA\s*Proponent\s*[:：]\s*(.*)/i],
    ['implementingOffice', /^Implementing\s*Office\s*[:：]\s*(.*)/i], ['fundingSource', /^Source\s*of\s*Funds\s*[:：]\s*(.*)/i],
    ['slots', /^Target\s*Participants\s*[:：]\s*(\d+)/i], ['summary', /^Public\s*Summary\s*[:：]\s*(.*)/i],
    ['startTime', /^Start\s*Time\s*[:：]\s*(\d{2}:\d{2})/i], ['endTime', /^End\s*Time\s*[:：]\s*(\d{2}:\d{2})/i],
  ]
  for (const [key, pattern] of mappings) {
    const index = lines.findIndex(line => pattern.test(line))
    if (index < 0) continue
    const captured = clean(lines[index].match(pattern)?.[1] || '')
    if (captured) { (fields[key] as string) = captured; source(key, lines[index]) }
  }
  function section(start: RegExp, end: RegExp) {
    const from = lines.findIndex(line => start.test(line))
    if (from < 0) return ''
    let to = lines.findIndex((line, index) => index > from && end.test(line))
    if (to < 0) to = lines.length
    return lines.slice(from + 1, to).join('\n')
  }
  fields.rationale = section(/^(?:II\s*[.:-]?\s*)?Rationale\b/i, /^(?:III\s*[.:-]?\s*)?Objectives\b/i)
  fields.objectives = section(/^(?:III\s*[.:-]?\s*)?Objectives\b/i, /^(?:IV\s*[.:-]?\s*)?Schedule\s*of\s*Implementation\b/i)
    .replace(/^Generally,?\s*this activity aims to\s*/i, '').trim()
  for (const key of ['rationale', 'objectives'] as const) if (fields[key]) source(key, fields[key].slice(0, 500))
  const implementation = section(/^(?:IV\s*[.:-]?\s*)?Schedule\s*of\s*Implementation\b/i, /^(?:V\s*[.:-]?\s*)?Budgetary\s*Requirements\b/i)
  const outputRow = implementation.split('\n').filter(row => row.split('|').length >= 3 && !/Expected\s*Output|Activities\s*\|/i.test(row)).map(row => row.split('|').at(-1)?.trim()).filter(Boolean)
  fields.outputs = outputRow.join('\n')
  if (fields.outputs) source('outputs', fields.outputs)
  if (implementation) fields.schedule += '\n\nImplementation plan:\n' + implementation
  const allocationLine = lines.find(line => /^Budget\s*Allocation\s*[:：]/i.test(line))
  const allocation = allocationLine?.match(/(?:PHP|₱|\bP\s*)\s*([\d,]+(?:\.\d{1,2})?)/i)
  if (allocation) { fields.allocation = String(money(allocation[1])); source('allocation', allocationLine!) }
  const beneficiaries = fields.beneficiaries.split('(')[0].replace(/\b\d+\s*[MF]\b/gi, '')
  const counts = [...beneficiaries.matchAll(/\b(\d+)\s+(?=[A-Za-z])/g)].map(match => Number(match[1]))
  if (counts.length && !fields.slots) { fields.slots = String(counts.reduce((a, b) => a + b, 0)); source('slots', fields.beneficiaries) }
  const duration = lines.find(line => /^PPA\s*Duration/i.test(line)) ?? ''
  const iso = [...duration.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(match => match[1])
  if (iso.length) { fields.startDate = iso[0]; fields.endDate = iso[1] || iso[0] }
  else {
    const date = duration.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?,?\s+(20\d{2})\b/i)
    if (date) {
      const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(date[1].toLowerCase()) + 1
      fields.startDate = `${date[4]}-${String(month).padStart(2,'0')}-${date[2].padStart(2,'0')}`
      fields.endDate = `${date[4]}-${String(month).padStart(2,'0')}-${(date[3] || date[2]).padStart(2,'0')}`
    }
  }
  if (!fields.startDate) warnings.push('Exact dates were not found. A month or a duration is not a calendar schedule; supply the actual dates.')
  warnings.push('Confirm exact start/end times and write a participant-friendly public summary before publishing.')
  const budgetSection = section(/^(?:V\s*[.:-]?\s*)?Budgetary\s*Requirements\b/i, /^(?:VI\s*[.:-]?\s*)?Signatories\b|^Prepared\s*by/i)
  const exportedBudget = /Expense \/ calculation\s*\|\s*Quantity\s*\|\s*Unit cost\s*\|\s*Amount/i.test(budgetSection)
  for (const row of budgetSection.split('\n')) {
    const firstCell = row.split('|')[0].replace(/\.oo\b/gi, '.00')
    const calculation = firstCell.match(/([\d,]+(?:\.\d+)?)\s*(?:pax|px|pcs?|pieces?)?\s*[x×]\s*(?:([\d,]+)\s*(?:meals?|snacks?|\([^)]*\))?\s*[x×]\s*)?([\d,]+(?:\.\d{1,2})?)/i)
    if (!calculation) continue
    const description = clean(firstCell.slice(0, calculation.index)).replace(/[(/=]+$/g, '').trim() || 'Planned expense'
    const quantity = money(calculation[1]) * (calculation[2] ? money(calculation[2]) : 1)
    const unitCost = money(calculation[3])
    fields.budgetItems.push({ description, quantity, unitCost })
    const columns = row.split('|').slice(1).map(value => value.replace(/[^\d.]/g,'')).filter(value => /^\d+(\.\d+)?$/.test(value)).map(Number).filter(value => value > 0)
    if ((exportedBudget ? columns.slice(-1) : columns).some(value => Math.abs(value - quantity * unitCost) > 0.01)) warnings.push(`${description}: the calculated amount (${(quantity * unitCost).toLocaleString()}) differs from a document table value. Review the source and confirm the budget.`)
  }
  if (!fields.budgetItems.length) warnings.push('The planned expense table could not be reliably structured. Review the source and enter expense items manually.')
  if (pages.some(page => page.method === 'ocr')) warnings.push('Some text was read using OCR. Check names, dates, quantities, and monetary values against the original.')
  if (pages.some(page => page.method === 'ocr' && (page.confidence ?? 100) < 75)) warnings.push('Low-quality scan detected. Consider uploading a clearer scan or correct the draft manually.')
  return { fields, extraction: { pages, warnings, sources } }
}
