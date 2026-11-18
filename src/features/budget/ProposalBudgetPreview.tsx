import { useEffect, useRef, useState } from 'react'
import { Eye, X } from 'lucide-react'
import { listProposals } from '../proposals/proposalService'
import type { Proposal } from '../proposals/proposalModel'
import ApprovedBudgetPanel from './ApprovedBudgetPanel'
import type { ApprovedBudgetVersion } from './approvedBudgetService'

export default function ProposalBudgetPreview() {
  const [open, setOpen] = useState(false)
  return <><button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-white px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary-light/40"><Eye size={16} />Preview proposal budget</button>{open && <PreviewDialog onClose={() => setOpen(false)} />}</>
}

function PreviewDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    dialog.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  useEffect(() => {
    let active = true
    listProposals().then(rows => { if (active) { setProposals(rows.filter(row => !row.activity_id)); setError('') } }).catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  const proposal = proposals.find(row => row.id === selected) || proposals[0]
  const allocation = Number(proposal?.fields.allocation) || 0
  const version: ApprovedBudgetVersion | null = proposal ? {
    id: `preview-${proposal.id}`, proposal_id: proposal.id, activity_id: '', revision: proposal.revision,
    document_version: proposal.document_version, allocation, published_at: proposal.updated_at, files: [],
    items: (proposal.fields.budgetItems || []).map((item, index) => ({ publication_id: `preview-${proposal.id}`, line_id: item.id || `preview-${index}`, position: index, description: item.description, quantity: Number(item.quantity) || 0, unit_cost: Number(item.unitCost) || 0 })),
  } : null
  return <dialog ref={dialog} aria-labelledby="budget-preview-title" onCancel={event => { event.preventDefault(); onClose() }} className="fixed inset-0 m-auto max-h-[94dvh] w-[min(1000px,calc(100vw-24px))] max-w-none overflow-hidden rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/50">
    <div className="flex max-h-[94dvh] flex-col"><header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-teal">Private preview · No transactions created</p><h2 id="budget-preview-title" className="mt-1 text-lg font-bold text-gray-900">Budget Monitor preview</h2><p className="mt-1 text-xs leading-relaxed text-gray-500">See how your proposal’s budget will look after publishing, before recording any actual expenses.</p></div><button type="button" onClick={onClose} aria-label="Close budget preview" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button></header>
    <div className="overflow-y-auto p-4 sm:p-6">{loading ? <p role="status" className="py-10 text-center text-sm text-gray-500">Loading proposals…</p> : error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} <button type="button" className="font-semibold underline" onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Retry</button></p> : !proposal || !version ? <p className="rounded-xl bg-gray-50 p-5 text-sm text-gray-600">Upload a proposal in Activities to preview its budget here. Already published budgets are available in their activity’s budget details.</p> : <>
      <label htmlFor="budget-preview-proposal" className="mb-2 block text-xs font-semibold text-gray-700">Uploaded proposal</label><select id="budget-preview-proposal" value={proposal.id} onChange={event => setSelected(event.target.value)} className="input mb-5">{proposals.map(row => <option key={row.id} value={row.id}>{row.fields.title || 'Untitled proposal'}</option>)}</select>
      <div className="mb-5"><h3 className="text-lg font-bold text-gray-900">{proposal.fields.title || 'Untitled activity'}</h3><p className="mt-1 text-xs text-gray-500">{proposal.fields.venue || 'Venue not provided'} · {proposal.fields.slots || '—'} registration slots</p><span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">Not published</span></div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">{[['Approved budget', allocation], ['Actual spent', 0], ['Remaining balance', allocation]].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-bold text-primary">₱{Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>)}</div>
      <ApprovedBudgetPanel key={proposal.id} versions={[version]} entries={[]} preview />
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><h4 className="text-sm font-semibold text-gray-800">Transaction history</h4><p className="mt-2 text-xs leading-relaxed text-gray-500">No actual expenses recorded. After publication, admins can record an expense against an approved item, or explain an unplanned expense.</p></div>
    </>}</div><footer className="flex shrink-0 justify-end border-t border-gray-200 bg-gray-50 px-5 py-4"><button type="button" onClick={onClose} className="btn-primary">Close preview</button></footer></div>
  </dialog>
}
