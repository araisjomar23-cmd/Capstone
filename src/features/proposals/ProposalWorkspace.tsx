import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Upload, FileText, ArrowUp, ArrowDown, X, LoaderCircle, ExternalLink, AlertCircle, Save, Send, ArrowLeft, ArrowRight, PencilLine } from 'lucide-react'
import { fetchPrograms, fetchFacilitators } from '../activities/activityService'
import type { Program } from '../../types/program'
import type { Facilitator } from '../../types/facilitator'
import DatePicker from '../../components/DatePicker'
import TimePicker from '../../components/TimePicker'
import { activeProposalWarnings, budgetTotal, emptyProposal, publicationIssues, PROPOSAL_ACCEPT, validateUploadSet, type Proposal, type ProposalDocument, type ProposalFields } from './proposalModel'
import { documentUrl, getProposal, importProposal, listProposals, publishProposal, saveProposal } from './proposalService'
import ProposalBuilder from './ProposalBuilder'

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-100 bg-blue-50 text-primary'}`}><AlertCircle size={16} className="shrink-0 mt-0.5" /><div>{children}</div></div>
}

function UploadFiles({ files, setFiles, disabled }: { files: File[]; setFiles: (files: File[]) => void; disabled: boolean }) {
  const [error, setError] = useState('')
  return <div className="space-y-3">
    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/25 bg-primary-light/40 p-5 text-center hover:border-primary">
      <Upload size={22} className="text-primary" /><span className="text-sm font-semibold text-primary">Select a signed PPA design</span>
      <span className="text-xs text-gray-500">One DOCX/PDF or up to 20 ordered JPG/PNG photos · 20 MB combined · PDF up to 20 pages</span>
      <input type="file" accept={PROPOSAL_ACCEPT} multiple disabled={disabled} className="block w-[220px] max-w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-primary" onChange={event => {
        const selected = Array.from(event.target.files ?? [])
        try { validateUploadSet(selected); setFiles(selected); setError('') } catch (err) { setError((err as Error).message); setFiles([]) }
        event.target.value = ''
      }} />
    </label>
    {files.map((file, index) => <div key={`${file.name}:${index}`} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2 text-xs">
      <span className="font-semibold text-primary">{index + 1}</span><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
      {files.length > 1 && <><button type="button" aria-label={`Move page ${index + 1} up`} disabled={disabled || index === 0} onClick={() => { const next = [...files]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setFiles(next) }} className="p-2 disabled:opacity-25"><ArrowUp size={14} /></button><button type="button" aria-label={`Move page ${index + 1} down`} disabled={disabled || index === files.length - 1} onClick={() => { const next = [...files]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setFiles(next) }} className="p-2 disabled:opacity-25"><ArrowDown size={14} /></button></>}
    </div>)}
    {error && <Notice error>{error}</Notice>}
  </div>
}

export default function ProposalWorkspace({ onPublished, initialId, onCloseInitial, creationOpen = false, onCloseCreation }: {
  onPublished: () => void; initialId?: string | null; onCloseInitial?: () => void
  creationOpen?: boolean; onCloseCreation?: () => void; onManualCreate?: () => void
}) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => { let active = true; listProposals().then(rows => { if (active) { setProposals(rows); setError('') } }).catch(err => { if (active) setError(err.message) }); return () => { active = false } }, [refresh])
  useEffect(() => () => abort.current?.abort(), [])
  async function upload() {
    if (!files.length || busy) return
    setBusy(true); setError(''); setNotice('')
    abort.current = new AbortController()
    try {
      const result = await importProposal(files, abort.current.signal, setProgress)
      onCloseCreation?.(); setUploadOpen(false); setSelected(result.id); setFiles([]); setRefresh(value => value + 1)
      if (result.duplicate) setNotice('This document was already uploaded. Its existing proposal has been opened.')
    } catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message) }
    finally { setBusy(false); setProgress('') }
  }
  const activeId = initialId || selected
  return <section className="mb-4">
    {(creationOpen || uploadOpen) && <NewActivityDialog initialUpload={uploadOpen} files={files} setFiles={setFiles} busy={busy} progress={progress} error={error}
      onClose={() => { if (!busy) { setFiles([]); setError(''); setUploadOpen(false); onCloseCreation?.() } }}
      onManual={() => { setFiles([]); setError(''); setUploadOpen(false); onCloseCreation?.(); setBuilding(true) }}
      onUpload={() => void upload()} onCancelProcessing={() => abort.current?.abort()} />}
    {building && <ProposalBuilder onClose={() => setBuilding(false)} onUpload={() => { setBuilding(false); setUploadOpen(true) }} />}
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    {error && <div className="mt-3"><Notice error>{error} <button className="font-semibold underline" onClick={() => setRefresh(value => value + 1)}>Reload proposals</button></Notice></div>}
    {proposals.length > 0 && <details className="rounded-xl border border-gray-200 bg-white px-4 py-3"><summary className="cursor-pointer text-xs font-semibold text-primary">Saved proposals ({proposals.length}) · Continue a draft or view history</summary><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{proposals.map(proposal => <button key={proposal.id} type="button" onClick={() => setSelected(proposal.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-primary/40 hover:bg-primary-light/30"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-800">{proposal.fields.title || 'Untitled PPA draft'}</p><p className="mt-1 text-xs text-gray-500">Updated {new Date(proposal.updated_at).toLocaleDateString('en-PH')}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${proposal.state === 'published' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{proposal.state === 'published' ? 'Published' : proposal.activity_id ? 'Revision draft' : 'Private draft'}</span></button>)}</div></details>}
    {activeId && <ProposalReview key={activeId} id={activeId} onClose={() => { setSelected(null); onCloseInitial?.(); setRefresh(value => value + 1) }} onPublished={() => { onPublished(); setRefresh(value => value + 1) }} />}
  </section>
}

function NewActivityDialog({ files, setFiles, busy, progress, error, onClose, onManual, onUpload, onCancelProcessing, initialUpload = false }: {
  files: File[]; setFiles: (files: File[]) => void; busy: boolean; progress: string; error: string
  onClose: () => void; onManual: () => void; onUpload: () => void; onCancelProcessing: () => void
  initialUpload?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'choose' | 'upload'>(initialUpload ? 'upload' : 'choose')
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  useEffect(() => { title.current?.focus() }, [mode])
  return <dialog ref={dialog} aria-labelledby="new-activity-title" aria-describedby="new-activity-description" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className="fixed inset-0 m-auto w-[min(720px,calc(100vw-24px))] max-w-none max-h-[92dvh] overflow-hidden rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/50">
    <div className="flex max-h-[92dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-widest text-teal">Activities</p><h2 ref={title} tabIndex={-1} id="new-activity-title" className="mt-1 text-xl font-bold text-gray-900 outline-none">{mode === 'choose' ? 'Create a new activity' : 'Upload your proposal'}</h2><p id="new-activity-description" className="mt-2 text-sm leading-relaxed text-gray-500">{mode === 'choose' ? 'How would you like to get started?' : 'We’ll read the document and fill in activity details for you to review.'}</p></div><button type="button" aria-label="Close new activity" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"><X size={20} /></button></header>
      <div className="overflow-y-auto p-5 sm:p-6">{mode === 'choose' ? <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => setMode('upload')} className="group flex flex-col items-start rounded-2xl border border-primary/25 bg-primary-light/30 p-5 text-left transition-colors hover:border-primary hover:bg-primary-light/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="mb-5 rounded-xl bg-white p-3 text-primary shadow-sm"><Upload size={24} /></span><h3 className="text-base font-bold text-gray-900">Upload proposal</h3><p className="mt-2 text-sm leading-relaxed text-gray-500">Use a signed PPA document to prefill activity details and the approved budget.</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary">Choose a document <ArrowRight size={15} /></span></button>
        <button type="button" onClick={onManual} className="group flex flex-col items-start rounded-2xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-primary/40 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="mb-5 rounded-xl bg-gray-100 p-3 text-gray-600"><PencilLine size={24} /></span><h3 className="text-base font-bold text-gray-900">Create manually</h3><p className="mt-2 text-sm leading-relaxed text-gray-500">Write your PPA proposal here, download Word or PDF, then have it signed and upload the signed copy.</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-primary">Open proposal builder <ArrowRight size={15} /></span></button>
      </div> : <div className="space-y-4"><UploadFiles files={files} setFiles={setFiles} disabled={busy} /><p className="text-xs leading-relaxed text-gray-500">Uploading creates a private draft. Review the details and confirm the signed approval before publishing.</p>{error && <Notice error>{error}</Notice>}{busy && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="inline-flex min-w-0 items-center gap-2 text-xs text-primary"><LoaderCircle size={16} className="shrink-0 animate-spin" />{progress || 'Processing document…'}</p><button type="button" onClick={onCancelProcessing} className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600">Cancel processing</button></div>}</div>}</div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">{mode === 'choose' ? <><span className="text-xs text-gray-500">You can review details before publishing.</span><button type="button" onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100">Cancel</button></> : <><button type="button" disabled={busy} onClick={() => setMode('choose')} className="inline-flex items-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold text-gray-600 disabled:opacity-40"><ArrowLeft size={15} />Back</button><button type="button" disabled={busy || !files.length} onClick={onUpload} className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <FileText size={16} />}{busy ? 'Reading proposal…' : 'Read proposal & continue'}</button></>}</footer>
    </div>
  </dialog>
}

function ProposalReview({ id, onClose, onPublished }: { id: string; onClose: () => void; onPublished: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const lock = useRef(false)
  const [record, setRecord] = useState<Awaited<ReturnType<typeof getProposal>> | null>(null)
  const [fields, setFields] = useState<ProposalFields>(structuredClone(emptyProposal))
  const [programs, setPrograms] = useState<Program[]>([])
  const [facilitators, setFacilitators] = useState<Facilitator[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [approval, setApproval] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [panel, setPanel] = useState<'activity' | 'budget' | 'publish'>('activity')
  const scrollArea = useRef<HTMLDivElement>(null)
  function goTo(next: typeof panel) { setPanel(next); scrollArea.current?.scrollTo({ top: 0 }) }
  useEffect(() => {
    dialog.current?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([getProposal(id), fetchPrograms(), fetchFacilitators()]).then(([result, progs, facs]) => {
      if (!active) return
      const allocation = result.documents.find(document => document.version === result.proposal.document_version)?.approved_allocation
      setRecord(result); setFields({ ...structuredClone(emptyProposal), ...result.proposal.fields, allocation: allocation == null ? '' : String(allocation) }); setPrograms(progs); setFacilitators(facs); setApproval(false); setReviewed(false); setLoading(false); setError('')
    }).catch(err => { if (active) { setLoading(false); setError(err.message) } })
    return () => { active = false }
  }, [id, refresh])
  const dirty = record && JSON.stringify(fields) !== JSON.stringify({ ...structuredClone(emptyProposal), ...record.proposal.fields })
  const source = record?.documents.find(doc => doc.version === record.proposal.document_version)
  const currentSource = record?.documents.find(doc => doc.version === record.proposal.document_version)
  const reviewWarnings = activeProposalWarnings(currentSource?.extraction.warnings || [], fields)
  function change<K extends keyof ProposalFields>(key: K, value: ProposalFields[K]) { if (key === 'allocation') return; setFields(previous => ({ ...previous, [key]: value })); setReviewed(false) }
  function close() { if (busy || (dirty && !window.confirm('Close without saving the changes to this draft?'))) return; onClose() }
  async function action(task: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setStatus('')
    try { await task() } catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message) }
    finally { lock.current = false; setBusy(false) }
  }
  async function saved() {
    if (!record) throw new Error('Proposal not loaded.')
    const proposal = await saveProposal(record.proposal, fields)
    setRecord(previous => previous ? { ...previous, proposal } : previous)
    return proposal
  }
  function field(key: keyof ProposalFields, label: string, type = 'text', rows?: number) {
    const evidence = source?.extraction.sources?.[key]
    return <div className={rows ? 'sm:col-span-2' : ''} key={key}><label htmlFor={type === 'date' || type === 'time' ? undefined : `ppa-${key}`} className="mb-1.5 block text-xs font-semibold text-gray-700">{label}</label>{rows ? <textarea id={`ppa-${key}`} rows={rows} className="input resize-y" value={String(fields[key])} onChange={event => change(key, event.target.value as never)} /> : key === 'allocation' ? <><output id="ppa-allocation" className="input block !bg-gray-50 font-semibold" aria-describedby="ppa-allocation-note">{fields.allocation === '' ? 'Not extracted' : 'PHP ' + Number(fields.allocation).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</output><p id="ppa-allocation-note" className="mt-2 text-xs text-gray-500">From the uploaded proposal. This amount cannot be edited here.</p></> : type === 'date' ? <DatePicker value={String(fields[key])} onChange={value => change(key, value as never)} aria-label={label} /> : type === 'time' ? <TimePicker value={String(fields[key])} onChange={value => change(key, value as never)} aria-label={label} /> : <input id={`ppa-${key}`} type={type} step={type === 'number' ? '1' : undefined} min={type === 'number' ? 0 : undefined} maxLength={key === 'title' ? 160 : undefined} className="input" value={String(fields[key])} onChange={event => change(key, event.target.value as never)} />}{evidence && <details open={key === 'slots' || undefined} className="mt-1 text-[10px] text-gray-500"><summary className="cursor-pointer">Source {evidence.page ? `· page ${evidence.page}` : '· Word document'}</summary><p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2">{evidence.excerpt}</p></details>}</div>
  }
  const issues = publicationIssues(fields)
  return <dialog ref={dialog} aria-label="Review proposal" onCancel={event => { event.preventDefault(); close() }} className="fixed inset-0 m-auto w-[min(820px,calc(100vw-24px))] max-w-none max-h-[94dvh] rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/50">
    <div className="flex max-h-[94dvh] flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-teal">Signed PPA · Activity draft</p><h2 className="mt-1 text-lg font-bold text-gray-900">{fields.title || 'Review activity draft'}</h2><p className="mt-1 text-xs text-gray-500">{record?.proposal.activity_id ? 'The published activity remains unchanged until you publish this revision.' : 'This proposal is private until you publish it.'}</p></div><button type="button" aria-label="Close proposal review" disabled={busy} onClick={close} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button></header>
      <nav aria-label="Proposal review steps" className="grid shrink-0 grid-cols-3 gap-1 border-b border-gray-100 bg-gray-50 px-3 py-3">{(['activity', 'budget', 'publish'] as const).map((item, index) => <button key={item} type="button" aria-current={panel === item ? 'step' : undefined} disabled={busy || loading} onClick={() => goTo(item)} className={`rounded-xl px-2 py-3 text-xs font-semibold ${panel === item ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-white'}`}>{index + 1}. {item === 'activity' ? 'Activity details' : item === 'budget' ? 'Budget' : 'Publish'}</button>)}</nav>
      <div ref={scrollArea} className="overflow-y-auto p-4 sm:p-6">
        {error && <div className="mb-4"><Notice error>{error} {!record && <button className="underline" onClick={() => setRefresh(value => value + 1)}>Retry</button>}</Notice></div>}
        {status && <div className="mb-4"><Notice>{status}</Notice></div>}
        {loading ? <p className="p-10 text-center text-sm text-gray-500">Loading proposal…</p> : record && <div className="space-y-5">
          <form id="ppa-review-form" className="min-w-0 space-y-6" onSubmit={event => { event.preventDefault(); void action(async () => { await saved(); setStatus('Draft saved. Nothing has been published.') }) }}>
            <fieldset disabled={busy} className="space-y-6 min-w-0">
              {currentSource && reviewWarnings.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer text-xs font-bold text-amber-900">Review required · {reviewWarnings.length} checks</summary><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-relaxed text-amber-900">{reviewWarnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
              <div hidden={panel !== 'activity'} className="space-y-6"><p className="text-sm text-gray-500">We filled in what we could. Check the details and complete anything missing.</p><FormSection title="Activity information"><div className="grid gap-4 sm:grid-cols-2">{field('title','Activity title')}{field('venue','Venue')}<div><label className="mb-1.5 block text-xs font-semibold text-gray-700" htmlFor="ppa-program">Program</label><select id="ppa-program" aria-describedby={!fields.programId ? "ppa-program-note" : undefined} value={fields.programId} onChange={event => change('programId',event.target.value)} className="input"><option value="">Select a program</option>{programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select>{!fields.programId && <p id="ppa-program-note" className="mt-1 text-xs text-amber-700">The proposal type did not match an existing program. Select the appropriate program from the list.</p>}</div>{field('slots','Total slots','number')}</div></FormSection>
              <FormSection title="Schedule"><div className="grid gap-4 sm:grid-cols-2">{field('startDate','Start date','date')}{field('endDate','End date','date')}{field('startTime','Start time','time')}{field('endTime','End time','time')}</div></FormSection>
              <FormSection title="Participant-facing information"><div className="min-w-0 space-y-4">{field('summary','Public summary','text',3)}<details className="w-full min-w-0 rounded-xl border border-gray-200 p-3 sm:p-4"><summary className="cursor-pointer text-xs font-semibold text-primary">Full description, objectives and expected outputs</summary><div className="mt-4 space-y-4">{field('rationale','Full description / rationale','text',5)}{field('objectives','Objectives','text',4)}{field('outputs','Expected outputs','text',3)}</div></details></div></FormSection>
              <FormSection title="Facilitators"><div className="space-y-2">{facilitators.map(facilitator => <label key={facilitator.id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2.5 text-xs"><input type="checkbox" checked={fields.facilitatorIds.includes(facilitator.id)} onChange={event => change('facilitatorIds', event.target.checked ? [...fields.facilitatorIds,facilitator.id] : fields.facilitatorIds.filter(id => id !== facilitator.id))} />{facilitator.name}</label>)}</div><p className="mt-2 text-xs text-gray-500">Assign at least one existing facilitator account. Notifications are sent only after publication.</p></FormSection>
              </div><div hidden={panel !== 'budget'} className="space-y-6"><p className="text-sm text-gray-500">Check the approved amount against the planned expenses in your signed document.</p><FormSection title="Approved budget and planned expenses">{field('allocation','Approved allocation (PHP)','number')}<details className="mt-4 rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer text-xs font-semibold text-primary">View planned expenses ({fields.budgetItems.length} items)</summary><div className="mt-3 space-y-3">{fields.budgetItems.map((item,index) => <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-3"><label className="text-xs font-semibold" htmlFor={`expense-${index}`}>Expense description</label><input id={`expense-${index}`} className="input mt-1" value={item.description} onChange={event => change('budgetItems',fields.budgetItems.map((row,i) => i === index ? {...row,description:event.target.value} : row))} /><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-gray-600">Quantity<input aria-label={`Expense ${index+1} quantity`} type="number" min="0" step="any" className="input mt-1" value={item.quantity} onChange={event => change('budgetItems',fields.budgetItems.map((row,i) => i === index ? {...row,quantity:Number(event.target.value)} : row))} /></label><label className="text-xs text-gray-600">Unit cost (PHP)<input aria-label={`Expense ${index+1} unit cost`} type="number" min="0" step="0.01" className="input mt-1" value={item.unitCost} onChange={event => change('budgetItems',fields.budgetItems.map((row,i) => i === index ? {...row,unitCost:Number(event.target.value)} : row))} /></label></div><div className="mt-2 flex items-center justify-between text-xs"><strong>PHP {(item.quantity*item.unitCost).toLocaleString()}</strong><button type="button" onClick={() => change('budgetItems',fields.budgetItems.filter((_,i) => i!==index))} className="font-semibold text-red-600">Remove item</button></div></div>)}</div><button type="button" onClick={() => change('budgetItems',[...fields.budgetItems,{description:'',quantity:1,unitCost:0}])} className="mt-3 text-xs font-semibold text-primary">+ Add planned expense</button></details><p className="mt-3 text-sm font-bold text-gray-800">Planned total: PHP {budgetTotal(fields.budgetItems).toLocaleString()}</p><p className="mt-1 text-xs text-gray-500">These are planned costs. Actual spending is recorded separately in Budget Monitor.</p></FormSection>
              <details className="rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer text-xs font-semibold text-primary">Internal records and review notes</summary><div className="mt-4"><FormSection title="Internal proposal records"><div className="grid gap-4 sm:grid-cols-2">{field('programType','PPA Type from document')}{field('proponent','Proponent')}{field('implementingOffice','Implementing office')}{field('fundingSource','Funding source','text',2)}{field('beneficiaries','Beneficiary breakdown','text',3)}{field('reviewNote','Review note / explanation of resolved discrepancies','text',3)}</div><p className="mt-2 text-xs text-gray-500">Signed files, signatories in the source, funding details, and review notes stay private to administrators.</p></FormSection></div></details></div>
              <div hidden={panel !== 'publish'} className="space-y-5">
                <div><h3 className="text-lg font-bold text-gray-900">Ready to publish?</h3><p className="mt-1 text-sm text-gray-500">Confirm the details below. Participants will see the activity after you publish.</p></div>
                <dl className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-2">{[
                  ['Activity', fields.title || 'Not provided'], ['Program', programs.find(program => program.id === fields.programId)?.name || 'Not selected'],
                  ['Venue', fields.venue || 'Not provided'], ['Total slots', fields.slots || 'Not provided'],
                  ['Dates', fields.startDate ? fields.startDate + ' to ' + (fields.endDate || '?') : 'Not provided'],
                  ['Time', fields.startTime ? fields.startTime + ' ? ' + (fields.endTime || '?') : 'Not provided'],
                  ['Approved budget', 'PHP ' + Number(fields.allocation || 0).toLocaleString()], ['Facilitators', facilitators.filter(person => fields.facilitatorIds.includes(person.id)).map(person => person.name).join(', ') || 'Not selected'],
                ].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 break-words font-semibold text-gray-800">{value}</dd></div>)}</dl>
                {issues.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 className="text-sm font-semibold text-amber-900">A few details still need attention</h4><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-900">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><button type="button" className="mt-3 text-xs font-semibold text-primary underline" onClick={() => goTo('activity')}>Return to activity details</button></div> : <Notice>All required details are complete. Check the signed document and confirm below.</Notice>}
              {panel === 'publish' && currentSource && <ProposalSourceLinks key={currentSource.id} document={currentSource} />}
            {record.history.length > 0 && <details className="rounded-xl border border-gray-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-gray-700">Publication history ({record.history.length})</summary><ul className="mt-2 space-y-2 text-xs text-gray-500">{record.history.map(row => <li key={row.id}>Revision {row.revision} · source v{row.document_version} · {new Date(row.published_at).toLocaleString('en-PH')}</li>)}</ul></details>}
              <div className="space-y-3 rounded-xl border border-gray-200 p-4"><label className="flex items-start gap-2 text-xs leading-relaxed text-gray-700"><input className="mt-0.5" type="checkbox" checked={approval} onChange={event => setApproval(event.target.checked)} />I checked the source and confirm that this is the approved, signed PPA design.</label><label className="flex items-start gap-2 text-xs leading-relaxed text-gray-700"><input className="mt-0.5" type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed the extracted information, resolved warnings, and confirmed the public details.</label></div></div>
            </fieldset>
          </form>
        </div>}
      </div>
      {record && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4"><p className="text-xs text-gray-500">{dirty ? 'Unsaved changes' : `Saved revision ${record.proposal.revision}`} · Source files remain private</p><div className="flex flex-wrap gap-2">{panel !== 'activity' && <button type="button" disabled={busy} onClick={() => goTo(panel === 'publish' ? 'budget' : 'activity')} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600">Back</button>}<button type="submit" form="ppa-review-form" disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 disabled:opacity-50"><Save size={15} /> Save draft</button>{panel !== 'publish' ? <button type="button" disabled={busy} onClick={() => goTo(panel === 'activity' ? 'budget' : 'publish')} className="btn-primary">{panel === 'activity' ? 'Continue to budget' : 'Review & publish'}</button> : <button type="button" disabled={busy || !approval || !reviewed || issues.length > 0} className="btn-primary inline-flex items-center gap-2 disabled:opacity-40" onClick={() => void action(async () => {
          const issues = publicationIssues(fields)
          if (issues.length) throw new Error(issues.join(' '))
          if (!window.confirm(record.proposal.activity_id ? 'Publish these reviewed changes to the live activity? Registered participants may be notified.' : 'Publish this activity and notify eligible participant accounts?')) return
          const proposal = dirty ? await saved() : record.proposal
          await publishProposal(proposal); setRefresh(value => value + 1); setStatus('Activity published successfully.'); onPublished()
        })}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />} {record.proposal.activity_id ? 'Publish revision' : 'Publish activity'}</button>}</div></footer>}
    </div>
  </dialog>
}

function FormSection({ title, children }: { title: string; children: ReactNode }) { return <section><h3 className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-primary">{title}</h3>{children}</section> }

function ProposalSourceLinks({ document }: { document: ProposalDocument }) {
  const [links, setLinks] = useState<{ name: string; url: string }[]>([])
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const refresh = () => Promise.all(document.files.map(async file => ({ name: file.name, url: await documentUrl(file.path) })))
      .then(links => { if (active) { setLinks(links); setError('') } })
      .catch(error => { if (active) setError(error.message) })
    void refresh()
    const timer = window.setInterval(() => void refresh(), 9 * 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [document, retry])
  return <div className="flex flex-wrap items-center gap-3 text-xs">{error ? <span role="alert" className="text-red-700">{error} <button type="button" className="font-semibold underline" onClick={() => setRetry(value => value + 1)}>Retry</button></span> : links.length ? links.map((file, index) => <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" title={file.name} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"><ExternalLink size={14} />{links.length === 1 ? 'View proposal' : `View proposal · page ${index + 1}`}</a>) : <span className="text-gray-500">Preparing proposal link…</span>}</div>
}
