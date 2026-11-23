import { useEffect, useRef, useState } from 'react'
import { Download, Printer, Upload, X, Plus, Trash2 } from 'lucide-react'
import { fetchPrograms } from '../activities/activityService'
import type { Program } from '../../types/program'
import { budgetTotal, emptyProposal, type ProposalFields } from './proposalModel'
import { defaultSignatories, downloadProposalWord, printProposalPdf, proposalExportIssues } from './proposalExport'
import { useConfirmation } from '../../components/ConfirmationProvider'

const steps = ['Activity details', 'Proposal content', 'Budget', 'Signatories & download']
export default function ProposalBuilder({ onClose, onUpload }: { onClose: () => void; onUpload: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const leaving = useRef(false)
  const confirm = useConfirmation()
  const [fields, setFields] = useState<ProposalFields>(() => structuredClone(emptyProposal))
  const [signatories, setSignatories] = useState(() => structuredClone(defaultSignatories))
  const [programs, setPrograms] = useState<Program[]>([])
  const [programError, setProgramError] = useState('')
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [exported, setExported] = useState(false)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    let active = true
    fetchPrograms().then(rows => {
      if (!active) return
      setPrograms(rows)
      if (!rows.length) setProgramError('Programs are unavailable. Enter the PPA type / program name manually.')
    }).catch(() => { if (active) setProgramError('Programs could not be loaded. Enter the PPA type / program name manually.') })
    return () => { active = false; document.body.style.overflow = overflow }
  }, [])
  function change<K extends keyof ProposalFields>(key: K, value: ProposalFields[K]) {
    setFields(previous => ({ ...previous, [key]: value })); setDirty(true); setExported(false); setNotice('')
  }
  async function leave(destination: 'close' | 'upload') {
    if (leaving.current) return
    leaving.current = true
    try {
      if (dirty && !await confirm({
        title: destination === 'close' ? 'Close proposal builder?' : 'Open proposal upload?',
        message: 'Download the Word file first to keep your work. This form is not saved online, so any changes you have not downloaded will be lost.',
        confirmLabel: destination === 'close' ? 'Close proposal' : 'Open upload',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      })) return
      if (destination === 'close') onClose()
      else onUpload()
    } finally {
      leaving.current = false
    }
  }
  function close() { void leave('close') }
  function navigate(next: number) { setStep(next); content.current?.scrollTo({ top: 0 }); content.current?.focus() }
  function field(key: keyof ProposalFields, label: string, type = 'text', rows = 0) {
    const props = { id: `builder-${key}`, value: String(fields[key]), className: 'input mt-1.5', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(key, event.target.value as never), maxLength: 20000 }
    return <label key={key} htmlFor={props.id} className={`block min-w-0 text-xs font-semibold text-slate-700 ${rows ? 'sm:col-span-2' : ''}`}>{label}{rows ? <textarea {...props} rows={rows} className={`${props.className} resize-y font-normal`} /> : <input {...props} type={type} min={type === 'number' ? 0 : undefined} step={key === 'allocation' ? '0.01' : type === 'number' ? '1' : undefined} />}</label>
  }
  function exportFile(format: 'word' | 'pdf') {
    setError(''); setNotice('')
    const missing = proposalExportIssues(fields); setIssues(missing)
    if (missing.length) return
    try {
      const draft = { fields, signatories }
      if (format === 'word') { downloadProposalWord(draft); setExported(true); setDirty(false); setNotice('Word document downloaded. Have the proposal signed, then upload the signed copy.') }
      else { printProposalPdf(draft); setExported(true); setNotice('Choose “Save as PDF” in the print dialog. After saving, have the proposal signed and upload the signed copy.') }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to export the proposal.') }
  }
  return <dialog ref={dialog} aria-labelledby="proposal-builder-title" onCancel={event => { event.preventDefault(); close() }} className="fixed inset-0 m-auto w-[min(960px,calc(100vw-24px))] max-w-none max-h-[94dvh] overflow-hidden rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/50">
    <div className="flex max-h-[94dvh] flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-widest text-teal">Create → Download → Sign → Upload</p><h2 id="proposal-builder-title" className="mt-1 text-xl font-bold text-slate-900">Create your PPA proposal</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">Complete the proposal, download Word or save a PDF, then upload the signed copy for review.</p></div><button type="button" aria-label="Close proposal builder" onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button></header>
      <nav aria-label="Proposal sections" className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-100 p-3 sm:grid-cols-4 sm:px-6">{steps.map((label, index) => <button key={label} type="button" aria-current={step === index ? 'step' : undefined} onClick={() => navigate(index)} className={`min-h-11 rounded-lg px-3 py-2 text-left text-xs font-semibold ${step === index ? 'bg-primary-light text-primary' : 'text-slate-500 hover:bg-slate-50'}`}><span className="mr-1.5 opacity-60">{index + 1}.</span>{label}</button>)}</nav>
      <div ref={content} tabIndex={-1} className="min-h-0 overflow-y-auto p-5 outline-none sm:p-6">
        <p className="mb-5 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">This is an unsigned proposal. Download to keep a copy; closing this form does not save it online. Downloading does not create an activity or approve its budget.</p>
        {step === 0 && <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field('title', 'PPA title')}</div>
          <label htmlFor="builder-program" className="block min-w-0 text-xs font-semibold text-slate-700">
            PPA type / program name
            {programError ? <input id="builder-program" className="input mt-1.5" value={fields.programType} onChange={event => change('programType', event.target.value)} maxLength={20000} aria-describedby="builder-program-message" /> : <select id="builder-program" className="input mt-1.5" value={fields.programId} onChange={event => {
              const program = programs.find(row => row.id === event.target.value)
              setFields(previous => ({ ...previous, programId: program?.id || '', programType: program?.name || '' }))
              setDirty(true); setExported(false); setNotice('')
            }}>
              <option value="">Choose a program</option>
              {programs.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>}
            {programError && <span id="builder-program-message" className="mt-1 block font-normal text-amber-700">{programError}</span>}
          </label>
          {field('venue', 'PPA area / venue')}{field('slots', 'Target participants', 'number')}{field('proponent', 'PPA proponent')}
          {field('startDate', 'Start date', 'date')}{field('endDate', 'End date', 'date')}{field('startTime', 'Start time', 'time')}{field('endTime', 'End time', 'time')}
          {field('beneficiaries', 'Beneficiaries / group breakdown', 'text', 3)}{field('implementingOffice', 'Implementing office')}{field('fundingSource', 'Source of funds')}
        </div>}
        {step === 1 && <div className="grid gap-5 sm:grid-cols-2">{field('summary', 'Public summary', 'text', 3)}{field('rationale', 'II. Rationale', 'text', 5)}{field('objectives', 'III. Objectives', 'text', 4)}{field('schedule', 'IV. Implementation plan / activities', 'text', 4)}{field('outputs', 'Expected outputs', 'text', 4)}</div>}
        {step === 2 && <div className="space-y-5">
          <div className="max-w-sm">{field('allocation', 'Proposed budget allocation (PHP)', 'number')}</div><p className="text-xs text-slate-500">Itemize the proposed costs below. The allocation is confirmed from the signed document after upload.</p>
          {fields.budgetItems.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold text-slate-700">Expense {index + 1}</h3><button type="button" aria-label={`Remove expense ${index + 1}`} onClick={() => change('budgetItems', fields.budgetItems.filter((_, i) => i !== index))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></div><label className="block text-xs font-semibold text-slate-700">Description<input className="input mt-1.5" maxLength={2000} value={item.description} onChange={event => change('budgetItems', fields.budgetItems.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} /></label><div className="mt-3 grid grid-cols-2 gap-3">{(['quantity', 'unitCost'] as const).map(key => <label key={key} className="text-xs font-semibold text-slate-700">{key === 'quantity' ? 'Quantity' : 'Unit cost (PHP)'}<input className="input mt-1.5" type="number" min={key === 'quantity' ? '0.01' : '0'} step={key === 'quantity' ? 'any' : '0.01'} value={Number.isFinite(item[key]) ? item[key] : ''} onChange={event => change('budgetItems', fields.budgetItems.map((row, i) => i === index ? { ...row, [key]: event.target.value === '' ? NaN : Number(event.target.value) } : row))} /></label>)}</div><p className="mt-3 text-right text-sm font-bold text-primary">PHP {Number.isFinite(item.quantity * item.unitCost) ? (item.quantity * item.unitCost).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</p></div>)}
          <button type="button" onClick={() => change('budgetItems', [...fields.budgetItems, { description: '', quantity: 1, unitCost: 0 }])} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-primary"><Plus size={15} />Add expense</button>
          <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-primary-light p-4 text-sm font-bold text-primary"><span>Planned total</span><span>PHP {Number.isFinite(budgetTotal(fields.budgetItems)) ? budgetTotal(fields.budgetItems).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span></div>
        </div>}
        {step === 3 && <div className="space-y-5"><p className="text-xs text-slate-500">Edit the roles, names and positions of the signatories. Signature lines remain blank for signing.</p>{signatories.map((person, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">{(['role', 'name', 'position'] as const).map(key => <label key={key} className={`text-xs font-semibold text-slate-700 ${key === 'role' ? 'sm:col-span-2' : ''}`}>{key === 'role' ? 'Signing role' : key === 'name' ? 'Full name / credentials' : 'Position'}<input className="input mt-1.5" maxLength={250} value={person[key]} onChange={event => { setSignatories(previous => previous.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row)); setDirty(true); setExported(false); setNotice('') }} /></label>)}</div>)}<div className="flex flex-wrap gap-3"><button type="button" onClick={() => exportFile('word')} className="btn-primary inline-flex items-center gap-2"><Download size={16} />Download Word (.docx)</button><button type="button" onClick={() => exportFile('pdf')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-xs font-semibold text-slate-700"><Printer size={16} />Print / Save PDF</button></div><p className="text-xs leading-relaxed text-slate-500">Word remains editable. PDF uses your browser’s print dialog: select Save as PDF. Check the downloaded document before obtaining signatures.</p>{exported && <button type="button" onClick={() => { void leave('upload') }} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-primary"><Upload size={16} />I have a signed copy — open upload</button>}</div>}
        {issues.length > 0 && <div role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-xs text-amber-900"><p className="font-bold">Complete these details before downloading:</p><ul className="mt-2 list-disc space-y-1 pl-4">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 rounded-xl bg-teal-50 p-4 text-xs text-teal-800">{notice}</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4"><span className="text-xs text-slate-500">Step {step + 1} of {steps.length} · Unsigned proposal</span><div className="flex gap-2">{step > 0 && <button type="button" onClick={() => navigate(step - 1)} className="min-h-11 rounded-lg px-4 text-xs font-semibold text-slate-600">Back</button>}{step < 3 && <button type="button" onClick={() => navigate(step + 1)} className="btn-primary">Continue</button>}</div></footer>
    </div>
  </dialog>
}
