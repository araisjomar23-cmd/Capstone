import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Upload, FileText, ArrowUp, ArrowDown, X, LoaderCircle, ExternalLink, CheckCircle2, AlertCircle, Save, Send, RefreshCw } from 'lucide-react'
import { fetchPrograms, fetchFacilitators } from '../activities/activityService'
import type { Program } from '../../types/program'
import type { Facilitator } from '../../types/facilitator'
import { budgetTotal, emptyProposal, matchProgram, publicationIssues, PROPOSAL_ACCEPT, validateUploadSet, type Extraction, type Proposal, type ProposalDocument, type ProposalFields } from './proposalModel'
import { createProposalProgram, documentUrl, getProposal, importProposal, listProposals, publishProposal, retryExtraction, saveProposal } from './proposalService'

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

export default function ProposalWorkspace({ onPublished, initialId, onCloseInitial }: { onPublished: () => void; initialId?: string | null; onCloseInitial?: () => void }) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => { let active = true; listProposals().then(rows => { if (active) { setProposals(rows); setError('') } }).catch(err => { if (active) setError(err.message) }); return () => { active = false } }, [refresh])
  useEffect(() => () => abort.current?.abort(), [])
  async function upload() {
    if (!files.length || busy) return
    setBusy(true); setError(''); setNotice('')
    abort.current = new AbortController()
    try {
      const result = await importProposal(files, abort.current.signal, setProgress)
      setSelected(result.id); setFiles([]); setShowUpload(false); setRefresh(value => value + 1)
      if (result.duplicate) setNotice('This document was already uploaded. Its existing proposal has been opened.')
    } catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message) }
    finally { setBusy(false); setProgress('') }
  }
  const activeId = initialId || selected
  return <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-start gap-3"><span className="rounded-xl bg-primary-light p-2.5 text-primary"><FileText size={22} /></span><div><h2 className="text-base font-bold text-gray-900">Create from a signed proposal</h2><p className="mt-1 text-xs leading-relaxed text-gray-500">Upload your document. We’ll fill in the details for you to review.</p></div></div><button type="button" className="btn-primary inline-flex items-center gap-2" aria-expanded={showUpload} disabled={busy} onClick={() => setShowUpload(value => !value)}><Upload size={16} />{showUpload ? 'Hide upload' : 'Upload proposal'}</button></div>
    {showUpload && <div className="mt-5 space-y-3"><p className="text-xs font-semibold text-gray-600">1. Upload document <span className="mx-2 text-gray-300">→</span> 2. Review details <span className="mx-2 text-gray-300">→</span> 3. Publish</p>
    <UploadFiles files={files} setFiles={setFiles} disabled={busy} />
    {files.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className="btn-primary inline-flex items-center gap-2" disabled={busy} onClick={() => void upload()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />} {busy ? 'Processing document…' : 'Create activity draft'}</button>{busy && <button type="button" className="text-xs font-semibold text-gray-600 underline" onClick={() => abort.current?.abort()}>Cancel processing</button>}</div>}
    {progress && <p role="status" className="mt-3 text-xs text-primary">{progress}</p>}
    </div>}
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    {error && <div className="mt-3"><Notice error>{error} <button className="font-semibold underline" onClick={() => setRefresh(value => value + 1)}>Reload proposals</button></Notice></div>}
    {proposals.length > 0 && <details className="mt-5 border-t border-gray-100 pt-4"><summary className="cursor-pointer text-xs font-semibold text-primary">Your proposals ({proposals.length}) · Open to continue a draft</summary><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{proposals.map(proposal => <button key={proposal.id} type="button" onClick={() => setSelected(proposal.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-primary/40 hover:bg-primary-light/30"><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-800">{proposal.fields.title || 'Untitled PPA draft'}</p><p className="mt-1 text-xs text-gray-500">Updated {new Date(proposal.updated_at).toLocaleDateString('en-PH')}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${proposal.state === 'published' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{proposal.state === 'published' ? 'Published' : proposal.activity_id ? 'Revision draft' : 'Private draft'}</span></button>)}</div></details>}
    {activeId && <ProposalReview key={activeId} id={activeId} onClose={() => { setSelected(null); onCloseInitial?.(); setRefresh(value => value + 1) }} onPublished={() => { onPublished(); setRefresh(value => value + 1) }} />}
  </section>
}

function ProposalReview({ id, onClose, onPublished }: { id: string; onClose: () => void; onPublished: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const abort = useRef<AbortController | null>(null)
  const lock = useRef(false)
  const [record, setRecord] = useState<Awaited<ReturnType<typeof getProposal>> | null>(null)
  const [fields, setFields] = useState<ProposalFields>(structuredClone(emptyProposal))
  const [programs, setPrograms] = useState<Program[]>([])
  const [facilitators, setFacilitators] = useState<Facilitator[]>([])
  const [sourceVersion, setSourceVersion] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [approval, setApproval] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [createName, setCreateName] = useState('')
  const [panel, setPanel] = useState<'activity' | 'budget' | 'publish'>('activity')
  const [reading, setReading] = useState<'replace' | 'retry' | 'ocr' | null>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  function goTo(next: typeof panel) { setPanel(next); scrollArea.current?.scrollTo({ top: 0 }) }
  useEffect(() => {
    dialog.current?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { abort.current?.abort(); document.body.style.overflow = previousOverflow }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([getProposal(id), fetchPrograms(), fetchFacilitators()]).then(([result, progs, facs]) => {
      if (!active) return
      setRecord(result); setFields({ ...structuredClone(emptyProposal), ...result.proposal.fields }); setPrograms(progs); setFacilitators(facs); setSourceVersion(result.proposal.document_version); setApproval(false); setReviewed(false); setLoading(false); setError('')
    }).catch(err => { if (active) { setLoading(false); setError(err.message) } })
    return () => { active = false }
  }, [id, refresh])
  const dirty = record && JSON.stringify(fields) !== JSON.stringify({ ...structuredClone(emptyProposal), ...record.proposal.fields })
  const source = record?.documents.find(doc => doc.version === sourceVersion)
  const currentSource = record?.documents.find(doc => doc.version === record.proposal.document_version)
  function change<K extends keyof ProposalFields>(key: K, value: ProposalFields[K]) { setFields(previous => ({ ...previous, [key]: value })); setReviewed(false) }
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
  function readAction(mode: NonNullable<typeof reading>, task: () => Promise<void>) {
    void action(async () => {
      setReading(mode)
      try { await task() } finally { setReading(null) }
    })
  }
  function field(key: keyof ProposalFields, label: string, type = 'text', rows?: number) {
    const evidence = source?.extraction.sources?.[key]
    return <div className={rows ? 'sm:col-span-2' : ''} key={key}><label htmlFor={`ppa-${key}`} className="mb-1.5 block text-xs font-semibold text-gray-700">{label}</label>{rows ? <textarea id={`ppa-${key}`} rows={rows} className="input resize-y" value={String(fields[key])} onChange={event => change(key, event.target.value as never)} /> : <input id={`ppa-${key}`} type={type} step={type === 'number' ? key === 'allocation' ? '0.01' : '1' : undefined} min={type === 'number' ? 0 : undefined} maxLength={key === 'title' ? 160 : undefined} className="input" value={String(fields[key])} onChange={event => change(key, event.target.value as never)} />}{evidence && <details className="mt-1 text-[10px] text-gray-500"><summary className="cursor-pointer">Source {evidence.page ? `· page ${evidence.page}` : '· Word document'}</summary><p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2">{evidence.excerpt}</p></details>}</div>
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
          <details className="rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer text-xs font-semibold text-primary">View uploaded document and reading tools</summary><aside className="mt-4 min-w-0 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><label className="mb-2 block text-xs font-bold text-gray-700" htmlFor="ppa-version">Signed source version</label><select id="ppa-version" className="input" value={sourceVersion} onChange={event => setSourceVersion(Number(event.target.value))}>{record.documents.map(doc => <option key={doc.id} value={doc.version}>Version {doc.version}{doc.version === record.proposal.document_version ? ' · current' : ''} · {new Date(doc.created_at).toLocaleDateString('en-PH')}</option>)}</select></div>
            {source && <SourcePreview key={source.id} document={source} />}
            <details className="overflow-hidden rounded-xl border border-gray-200 bg-white"><summary className="cursor-pointer px-4 py-4 text-sm font-semibold text-primary">Update or read document again</summary><div className="space-y-5 border-t border-gray-100 p-4 sm:p-5">
              <p className="flex items-start gap-2 rounded-lg bg-primary-light/40 p-3 text-xs leading-relaxed text-gray-600"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" />Your previous files are kept. Reviewed activity details stay unchanged until you apply new suggestions.</p>
              <div className="space-y-3"><div><h4 className="text-sm font-semibold text-gray-900">Upload a revised document</h4><p className="mt-1 text-xs leading-relaxed text-gray-500">Choose a new signed copy to add it as the latest version.</p></div><UploadFiles files={files} setFiles={setFiles} disabled={busy} />
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-gray-500">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Select a file to enable saving.'}</p><button type="button" disabled={busy || !files.length} className="btn-primary inline-flex w-full items-center justify-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto" onClick={() => readAction('replace', async () => {
              const proposal = dirty ? await saved() : record.proposal
              abort.current = new AbortController()
              const result = await importProposal(files, abort.current.signal, setStatus, proposal)
              if (result.id !== id) { setError('This document already belongs to another proposal. Open that proposal from the workspace.'); return }
              setFiles([]); setRefresh(value => value + 1); setStatus('Document saved. Compare the extraction before applying any suggestions.')
            })}>{reading === 'replace' ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}{reading === 'replace' ? 'Saving document…' : 'Save new version'}</button></div></div>
              <div className="flex flex-col gap-4 border-t border-gray-200 pt-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h4 className="text-sm font-semibold text-gray-900">Read the current document again</h4><p className="mt-1 text-xs leading-relaxed text-gray-500">Use this if some text was missed. No new upload needed.</p></div><button type="button" disabled={busy || !currentSource} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-white px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-light/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40" onClick={() => readAction('retry', async () => {
                const proposal = dirty ? await saved() : record.proposal
                abort.current = new AbortController()
                await retryExtraction(proposal, currentSource!, abort.current.signal, setStatus, false); setRefresh(value => value + 1); setStatus('Reading complete. Your reviewed fields were preserved.')
              })}>{reading === 'retry' ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}{reading === 'retry' ? 'Reading document…' : 'Read again'}</button></div>
              {currentSource?.files[0]?.type === 'application/pdf' && <details className="text-xs"><summary className="cursor-pointer font-semibold text-gray-600">More reading options</summary><div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3"><p className="leading-relaxed text-gray-500">For scanned PDFs or incomplete text, read every page using image recognition. This may take longer.</p><button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 font-semibold text-primary disabled:opacity-40" onClick={() => readAction('ocr', async () => { const proposal = dirty ? await saved() : record.proposal; abort.current = new AbortController(); await retryExtraction(proposal, currentSource, abort.current.signal, setStatus, true); setRefresh(value => value + 1) })}>{reading === 'ocr' && <LoaderCircle size={14} className="animate-spin" />}Read all pages with OCR</button></div></details>}
              {reading && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3"><span className="inline-flex items-center gap-2 text-xs font-medium text-primary"><LoaderCircle size={15} className="animate-spin" />{reading === 'replace' ? 'Processing your new document…' : 'Reading your document…'}</span><button type="button" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50" onClick={() => abort.current?.abort()}>Cancel reading</button></div>}
            </div></details>
            {source && (source.extraction as Extraction & { suggestedFields?: ProposalFields }).suggestedFields && <button type="button" disabled={busy} className="w-full rounded-xl border border-primary/25 p-3 text-xs font-semibold text-primary hover:bg-primary-light" onClick={() => {
              if (!window.confirm('Replace the review form with this source version’s extracted suggestions? Your saved source and publication history will be retained.')) return
              const suggestions = (source.extraction as Extraction & { suggestedFields: ProposalFields }).suggestedFields
              setFields({ ...structuredClone(emptyProposal), ...suggestions, programId: matchProgram(suggestions.programType, programs) }); setReviewed(false)
            }}>Apply this version’s extracted suggestions</button>}
            {record.history.length > 0 && <details className="rounded-xl border border-gray-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-gray-700">Publication history ({record.history.length})</summary><ul className="mt-2 space-y-2 text-xs text-gray-500">{record.history.map(row => <li key={row.id}>Revision {row.revision} · source v{row.document_version} · {new Date(row.published_at).toLocaleString('en-PH')}</li>)}</ul></details>}
          </aside></details>
          <form id="ppa-review-form" className="min-w-0 space-y-6" onSubmit={event => { event.preventDefault(); void action(async () => { await saved(); setStatus('Draft saved. Nothing has been published.') }) }}>
            <fieldset disabled={busy} className="space-y-6 min-w-0">
              {currentSource && currentSource.extraction.warnings.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer text-xs font-bold text-amber-900">Review required · {currentSource.extraction.warnings.length} checks</summary><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-relaxed text-amber-900">{currentSource.extraction.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
              <div hidden={panel !== 'activity'} className="space-y-6"><p className="text-sm text-gray-500">We filled in what we could. Check the details and complete anything missing.</p><FormSection title="Activity information"><div className="grid gap-4 sm:grid-cols-2">{field('title','Activity title')}{field('venue','Venue')}<div><label className="mb-1.5 block text-xs font-semibold text-gray-700" htmlFor="ppa-program">Program</label><select id="ppa-program" value={fields.programId} onChange={event => change('programId',event.target.value)} className="input"><option value="">Select a program</option>{programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select>{!fields.programId && <p className="mt-2 text-xs text-amber-700">No unique match confirmed. Select a program or create one below.</p>}</div>{field('slots','Registration capacity','number')}</div><details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-primary">Create a missing program</summary><div className="mt-2 flex gap-2"><input aria-label="New program name" className="input" maxLength={160} value={createName} onChange={event => setCreateName(event.target.value)} /><button type="button" className="btn-primary shrink-0" disabled={!createName.trim()} onClick={() => void action(async () => { const programId = await createProposalProgram(createName); setPrograms(await fetchPrograms()); change('programId',programId); setCreateName('') })}>Create</button></div></details></FormSection>
              <FormSection title="Schedule"><div className="grid gap-4 sm:grid-cols-2">{field('startDate','Start date','date')}{field('endDate','End date','date')}{field('startTime','Start time (Manila)','time')}{field('endTime','End time (Manila)','time')}</div><p className="mt-2 text-xs text-gray-500">No dates or times are invented. Participants must be 15–30 on registration day and the first activity day.</p></FormSection>
              <FormSection title="Participant-facing information"><div className="grid gap-4">{field('summary','Public summary','text',3)}<details className="rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer text-xs font-semibold text-primary">Full description, objectives and expected outputs</summary><div className="mt-4 space-y-4">{field('rationale','Full description / rationale','text',5)}{field('objectives','Objectives (one per line)','text',4)}{field('outputs','Expected outputs (one per line)','text',3)}{field('schedule','Implementation plan / session schedule','text',4)}</div></details></div></FormSection>
              <FormSection title="Facilitators"><div className="space-y-2">{facilitators.map(facilitator => <label key={facilitator.id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2.5 text-xs"><input type="checkbox" checked={fields.facilitatorIds.includes(facilitator.id)} onChange={event => change('facilitatorIds', event.target.checked ? [...fields.facilitatorIds,facilitator.id] : fields.facilitatorIds.filter(id => id !== facilitator.id))} />{facilitator.name}</label>)}</div><p className="mt-2 text-xs text-gray-500">Assign at least one existing facilitator account. Notifications are sent only after publication.</p></FormSection>
              </div><div hidden={panel !== 'budget'} className="space-y-6"><p className="text-sm text-gray-500">Check the approved amount against the planned expenses in your signed document.</p><FormSection title="Approved budget and planned expenses">{field('allocation','Approved allocation (PHP)','number')}<details className="mt-4 rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer text-xs font-semibold text-primary">View planned expenses ({fields.budgetItems.length} items)</summary><div className="mt-3 space-y-3">{fields.budgetItems.map((item,index) => <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-3"><label className="text-xs font-semibold" htmlFor={`expense-${index}`}>Expense description</label><input id={`expense-${index}`} className="input mt-1" value={item.description} onChange={event => change('budgetItems',fields.budgetItems.map((row,i) => i === index ? {...row,description:event.target.value} : row))} /><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-gray-600">Quantity<input aria-label={`Expense ${index+1} quantity`} type="number" min="0" step="any" className="input mt-1" value={item.quantity} onChange={event => change('budgetItems',fields.budgetItems.map((row,i) => i === index ? {...row,quantity:Number(event.target.value)} : row))} /></label><label className="text-xs text-gray-600">Unit cost (PHP)<input aria-label={`Expense ${index+1} unit cost`} type="number" min="0" step="0.01" className="input mt-1" value={item.unitCost} onChange={event => change('budgetItems',fields.budgetItems.map((row,i) => i === index ? {...row,unitCost:Number(event.target.value)} : row))} /></label></div><div className="mt-2 flex items-center justify-between text-xs"><strong>PHP {(item.quantity*item.unitCost).toLocaleString()}</strong><button type="button" onClick={() => change('budgetItems',fields.budgetItems.filter((_,i) => i!==index))} className="font-semibold text-red-600">Remove item</button></div></div>)}</div><button type="button" onClick={() => change('budgetItems',[...fields.budgetItems,{description:'',quantity:1,unitCost:0}])} className="mt-3 text-xs font-semibold text-primary">+ Add planned expense</button></details><p className="mt-3 text-sm font-bold text-gray-800">Planned total: PHP {budgetTotal(fields.budgetItems).toLocaleString()}</p><p className="mt-1 text-xs text-gray-500">These are planned costs. Actual spending is recorded separately in Budget Monitor.</p></FormSection>
              <details className="rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer text-xs font-semibold text-primary">Internal records and review notes</summary><div className="mt-4"><FormSection title="Internal proposal records"><div className="grid gap-4 sm:grid-cols-2">{field('programType','PPA Type from document')}{field('proponent','Proponent')}{field('implementingOffice','Implementing office')}{field('fundingSource','Funding source','text',2)}{field('beneficiaries','Beneficiary breakdown','text',3)}{field('reviewNote','Review note / explanation of resolved discrepancies','text',3)}</div><p className="mt-2 text-xs text-gray-500">Signed files, signatories in the source, funding details, and review notes stay private to administrators.</p></FormSection></div></details></div>
              <div hidden={panel !== 'publish'} className="space-y-5">
                <div><h3 className="text-lg font-bold text-gray-900">Ready to publish?</h3><p className="mt-1 text-sm text-gray-500">Confirm the details below. Participants will see the activity after you publish.</p></div>
                <dl className="grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm sm:grid-cols-2">{[
                  ['Activity', fields.title || 'Not provided'], ['Program', programs.find(program => program.id === fields.programId)?.name || 'Not selected'],
                  ['Venue', fields.venue || 'Not provided'], ['Registration slots', fields.slots || 'Not provided'],
                  ['Dates', fields.startDate ? fields.startDate + ' to ' + (fields.endDate || '?') : 'Not provided'],
                  ['Time (Manila)', fields.startTime ? fields.startTime + ' ? ' + (fields.endTime || '?') : 'Not provided'],
                  ['Approved budget', 'PHP ' + Number(fields.allocation || 0).toLocaleString()], ['Facilitators', facilitators.filter(person => fields.facilitatorIds.includes(person.id)).map(person => person.name).join(', ') || 'Not selected'],
                ].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 break-words font-semibold text-gray-800">{value}</dd></div>)}</dl>
                {issues.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 className="text-sm font-semibold text-amber-900">A few details still need attention</h4><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-900">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><button type="button" className="mt-3 text-xs font-semibold text-primary underline" onClick={() => goTo('activity')}>Return to activity details</button></div> : <Notice>All required details are complete. Check the signed document and confirm below.</Notice>}
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

function SourcePreview({ document }: { document: ProposalDocument }) {
  const [fileIndex, setFileIndex] = useState(0)
  const [preview, setPreview] = useState({ path: '', url: '' })
  const [error, setError] = useState('')
  const [original, setOriginal] = useState(false)
  const file = document.files[fileIndex] || document.files[0]
  const url = preview.path === file.path ? preview.url : ''
  useEffect(() => { let active = true; documentUrl(file.path).then(url => { if (active) { setPreview({ path: file.path, url }); setError('') } }).catch(err => { if (active) setError(err.message) }); return () => { active = false } }, [file.path])
  return <div className="overflow-hidden rounded-xl border border-gray-200"><div className="space-y-2 border-b border-gray-200 bg-gray-50 p-3"><div className="flex items-center gap-2"><button type="button" aria-pressed={!original} className={`rounded-lg px-3 py-2 text-xs font-semibold ${!original ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`} onClick={() => setOriginal(false)}>Extracted text</button><button type="button" aria-pressed={original} className={`rounded-lg px-3 py-2 text-xs font-semibold ${original ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`} onClick={() => setOriginal(true)}>Original</button></div>{document.files.length>1 && <select aria-label="Original source page" className="input" value={fileIndex} onChange={event => setFileIndex(Number(event.target.value))}>{document.files.map((file,index) => <option key={file.path} value={index}>Page {index+1} · {file.name}</option>)}</select>}{url && <a className="inline-flex items-center gap-1 text-xs font-semibold text-primary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Open original signed file</a>}</div>{error && <Notice error>{error}</Notice>}{original ? file.type.startsWith('image/') ? <img src={url} alt={`Signed PPA source page ${fileIndex+1}`} className="max-h-[60vh] w-full object-contain" /> : file.type === 'application/pdf' ? <iframe key={url} src={url} title="Original signed PPA PDF" className="h-[55vh] w-full" /> : <p className="p-5 text-xs leading-relaxed text-gray-500">Open the original Word document using the link above. Its extracted text is available in the adjacent tab.</p> : <div className="max-h-[55vh] space-y-4 overflow-y-auto bg-white p-4">{document.extraction.pages?.length ? document.extraction.pages.map((page,index) => <section key={index}><h4 className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-teal"><CheckCircle2 size={12} />{page.page ? `Page ${page.page}` : 'Word document'} · {page.method === 'ocr' ? 'OCR' : 'Selectable text'}{page.confidence !== undefined ? ` · ${Math.round(page.confidence)}% recognition confidence` : ''}</h4><p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-600">{page.text}</p></section>) : <p className="text-xs text-gray-500">No extracted text yet. Retry reading or complete the draft manually while comparing the original.</p>}</div>}</div>
}
