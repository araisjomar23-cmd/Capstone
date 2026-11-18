import { useEffect, useState } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
import { documentUrl } from '../proposals/proposalService'
import { compareApprovedBudget, type ApprovedBudgetVersion } from './approvedBudgetService'
import type { BudgetEntry } from './budgetService'

const money = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function SignedFile({ file }: { file: ApprovedBudgetVersion['files'][number] }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const refresh = () => documentUrl(file.path).then(url => { if (active) { setUrl(url); setError('') } }).catch(error => { if (active) setError(error.message) })
    void refresh()
    const timer = window.setInterval(() => void refresh(), 9 * 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [file.path, retry])
  return <div className="text-xs">{error ? <span role="alert" className="text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">Retry</button></span> : url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 break-all font-semibold text-primary hover:underline"><ExternalLink size={14} className="shrink-0" />{file.name}</a> : <span className="text-gray-500">Preparing document link…</span>}</div>
}

export default function ApprovedBudgetPanel({ versions, entries, preview = false }: { versions: ApprovedBudgetVersion[]; entries: BudgetEntry[]; preview?: boolean }) {
  const [selected, setSelected] = useState('')
  const [showFiles, setShowFiles] = useState(false)
  const version = versions.find(row => row.id === selected) || versions[0]
  if (!version) return <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No published budget snapshot was found. Reload before recording an expense.</p>
  const { lines, priorItems, unplanned, unassigned } = compareApprovedBudget(version, entries)
  const planned = lines.reduce((sum, item) => sum + item.approved, 0)
  const total = (rows: BudgetEntry[]) => rows.reduce((sum, item) => sum + item.amount, 0)
  return <section className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-3 bg-primary-light/30 p-4"><div><h3 className="flex items-center gap-2 text-sm font-bold text-primary"><FileText size={17} />Approved PPA budget</h3><p className="mt-1 text-xs leading-relaxed text-gray-500">{preview ? 'Preview of the costs from your private draft. No budget has been published.' : 'From the published signed proposal. Private draft changes do not affect these figures.'}</p></div><span className="rounded-full border border-primary/15 bg-white px-3 py-1 text-[10px] font-semibold text-primary">{preview ? 'Preview only' : version.id === versions[0].id ? 'Current approval' : 'Previous approval'}</span></div>
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-gray-500">Approved allocation</p><p className="mt-1 text-lg font-bold text-gray-900">{money(version.allocation)}</p></div>{!preview && <div><label htmlFor="approved-budget-version" className="mb-1 block text-xs font-semibold text-gray-600">Approved version</label><select id="approved-budget-version" className="input !text-xs" value={version.id} onChange={event => { setSelected(event.target.value); setShowFiles(false) }}>{versions.map((row, index) => <option key={row.id} value={row.id}>{index === 0 ? 'Latest' : 'Previous'} · {new Date(row.published_at).toLocaleDateString('en-PH')} · revision {row.revision}</option>)}</select></div>}</div>
      <details open={preview || undefined} className="rounded-lg border border-gray-200"><summary className="cursor-pointer px-3 py-3 text-xs font-semibold text-primary">Approved cost breakdown · {lines.length} items</summary><div className="overflow-x-auto px-3 pb-3"><table className="w-full min-w-[580px] text-xs"><thead><tr className="border-b border-gray-200 text-left text-gray-500"><th className="py-2">Approved item</th><th className="p-2 text-right">Quantity</th><th className="p-2 text-right">Unit cost</th><th className="p-2 text-right">Approved cost</th><th className="p-2 text-right">Actual spent</th><th className="p-2 text-right">Difference</th></tr></thead><tbody>{lines.map(item => <tr key={item.line_id} className="border-b border-gray-100"><td className="max-w-60 py-3 pr-3 font-medium text-gray-800">{item.description}</td><td className="p-2 text-right">{item.quantity.toLocaleString()}</td><td className="p-2 text-right">{money(item.unit_cost)}</td><td className="p-2 text-right">{money(item.approved)}</td><td className="p-2 text-right">{money(item.spent)}</td><td className={`p-2 text-right font-semibold ${item.difference < 0 ? 'text-red-600' : 'text-teal'}`}>{money(item.difference)}{item.difference < 0 && <span className="block text-[10px]">Over approved cost</span>}</td></tr>)}</tbody></table>{!lines.length && <p className="py-3 text-xs text-gray-500">No itemized costs were provided in this approval.</p>}<p className="mt-3 text-xs text-gray-500">Approved items total: <strong className="text-gray-800">{money(planned)}</strong>{Math.abs(planned - version.allocation) > 0.01 && <> · Difference from allocation: {money(version.allocation - planned)}</>}</p><p className="mt-2 text-[11px] leading-relaxed text-gray-500">{preview ? 'Actual spending is assumed to be zero in this preview. These figures do not affect Budget Monitor totals.' : 'Actual amounts use the current expense ledger, including expenses recorded after this approval. Negative differences indicate spending above the approved item cost.'}</p></div></details>
      {(priorItems.length > 0 || unplanned.length > 0 || unassigned.length > 0) && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{priorItems.length > 0 && <p>Expenses linked to items outside this version: <strong>{money(total(priorItems))}</strong>. Their original approvals and expense links are retained.</p>}{unplanned.length > 0 && <p>Unplanned expenses: <strong>{money(total(unplanned))}</strong>. Explanations appear in transaction history.</p>}{unassigned.length > 0 && <p>Existing expenses awaiting item assignment: <strong>{money(total(unassigned))}</strong>. Edit each expense to link an approved item or explain why it is unplanned.</p>}<p>These expenses are included in the activity’s actual spending and remaining balance.</p></div>}
      {!preview && <details key={version.id} onToggle={event => setShowFiles(event.currentTarget.open)}><summary className="cursor-pointer text-xs font-semibold text-primary">View signed supporting document · version {version.document_version}</summary>{showFiles && <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">{version.files.map(file => <SignedFile key={file.path} file={file} />)}{!version.files.length && <p className="text-xs text-gray-500">No source file is available for this approval.</p>}</div>}</details>}
    </div>
  </section>
}
