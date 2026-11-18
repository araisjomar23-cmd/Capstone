export const MAX_PROPOSAL_BYTES = 20 * 1024 * 1024
export const MAX_PROPOSAL_PAGES = 20
export const PROPOSAL_ACCEPT = '.docx,.pdf,.jpg,.jpeg,.png'
export interface SourcePage { page: number | null; text: string; method: 'text' | 'ocr'; confidence?: number }
export interface BudgetItem { id?: string; description: string; quantity: number; unitCost: number }
export interface ProposalFields {
  title: string; programType: string; programId: string; venue: string; slots: string
  startDate: string; endDate: string; startTime: string; endTime: string
  summary: string; rationale: string; objectives: string; outputs: string; schedule: string
  beneficiaries: string; proponent: string; implementingOffice: string; fundingSource: string
  allocation: string; budgetItems: BudgetItem[]; facilitatorIds: string[]; reviewNote: string
}
export interface Extraction { pages: SourcePage[]; warnings: string[]; sources: Record<string, { page: number | null; excerpt: string }> }
export interface ProposalDocument {
  id: string; proposal_id: string; fingerprint: string; version: number
  files: { name: string; path: string; size: number; type: string }[]
  extraction: Extraction; created_at: string
}
export interface Proposal {
  id: string; activity_id: string | null; state: 'draft' | 'published'
  fields: ProposalFields; revision: number; document_version: number
  published_version: number | null; updated_at: string; created_at: string
}
export const emptyProposal: ProposalFields = {
  title: '', programType: '', programId: '', venue: '', slots: '', startDate: '', endDate: '', startTime: '', endTime: '',
  summary: '', rationale: '', objectives: '', outputs: '', schedule: '', beneficiaries: '', proponent: '', implementingOffice: '', fundingSource: '',
  allocation: '', budgetItems: [], facilitatorIds: [], reviewNote: '',
}
export function normalizeProgram(name: string) { return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() }
export function matchProgram(name: string, programs: { id: string; name: string }[]) {
  const matches = name.trim() ? programs.filter(p => normalizeProgram(p.name) === normalizeProgram(name)) : []
  return matches.length === 1 ? matches[0].id : ''
}
export function validateUploadSet(files: Pick<File, 'name' | 'size'>[]) {
  if (!files.length) throw new Error('Select a signed PPA document or an ordered photo set.')
  if (files.length > 20 || files.reduce((sum, file) => sum + file.size, 0) > MAX_PROPOSAL_BYTES) throw new Error('Use up to 20 photos and a combined file size of 20 MB.')
  const extensions = files.map(file => file.name.split('.').pop()?.toLowerCase())
  if (files.some(file => file.size === 0) || extensions.some(ext => !['docx', 'pdf', 'jpg', 'jpeg', 'png'].includes(ext ?? ''))) throw new Error('Upload a nonempty DOCX, PDF, JPG, or PNG file.')
  if (files.length > 1 && extensions.some(ext => ext === 'docx' || ext === 'pdf')) throw new Error('Upload one Word/PDF document or a photo set. Do not mix document files.')
}
export function ageOnDate(birthday: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || birthday > date) return null
  return Number(date.slice(0, 4)) - Number(birthday.slice(0, 4)) - (date.slice(5) < birthday.slice(5) ? 1 : 0)
}
export function eligibleOnBothDates(birthday: string, registeredDate: string, startDate: string) {
  return [registeredDate, startDate].every(date => { const age = ageOnDate(birthday, date); return age !== null && age >= 15 && age <= 30 })
}
export function budgetTotal(items: BudgetItem[]) { return Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) * 100) / 100 }
export function publicationIssues(fields: ProposalFields, now = Date.now()) {
  const errors: string[] = []
  for (const [key, label] of Object.entries({ title: 'Activity title', programId: 'Program', venue: 'Venue', summary: 'Public summary', rationale: 'Full description', startDate: 'Start date', endDate: 'End date', startTime: 'Start time', endTime: 'End time' })) {
    if (!String(fields[key as keyof ProposalFields] ?? '').trim()) errors.push(`${label} is required.`)
  }
  if (!Number.isSafeInteger(Number(fields.slots)) || Number(fields.slots) < 1) errors.push('Capacity must be a positive whole number.')
  if (fields.allocation === '' || !Number.isFinite(Number(fields.allocation)) || Number(fields.allocation) < 0) errors.push('Confirm a valid approved budget allocation, including zero if applicable.')
  if (!fields.facilitatorIds.length) errors.push('Assign at least one facilitator.')
  const start = Date.parse(`${fields.startDate}T${fields.startTime}+08:00`)
  const end = Date.parse(`${fields.endDate}T${fields.endTime}+08:00`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push('Enter a valid schedule with the end after the start.')
  if (Number.isFinite(start) && start <= now) errors.push('The activity must start in the future.')
  if (fields.budgetItems.some(item => !item.description.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) errors.push('Each planned expense needs a description, positive quantity, and valid unit cost.')
  if (fields.budgetItems.length && Math.abs(budgetTotal(fields.budgetItems) - Number(fields.allocation)) > 0.01 && !fields.reviewNote.trim()) errors.push('Explain the difference between planned expenses and the approved allocation in the review note.')
  return errors
}
