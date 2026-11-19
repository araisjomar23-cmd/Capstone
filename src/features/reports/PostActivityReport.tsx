import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleAlert, ClipboardList, FileCheck2, FileText, LoaderCircle, MapPin, PencilLine, Printer, Save, Users } from 'lucide-react'
import { fetchActivities } from '../activities/activityService'
import { getActivityLifecycleStatus } from '../activities/activityLifecycle'
import type { Activity } from '../../types/activity'
import { postReportFieldIssue, postReportIssues, postReportLabels, type PostReportFields } from './postReportModel'
import { loadPostReport, savePostReport, type SavedPostReport } from './postReportService'
import ReportDocumentPreview from './ReportDocumentPreview'

const summaryKeys = ['date', 'title', 'venue', 'beneficiaries', 'target', 'attended', 'allocation', 'highlights', 'office'] as const
const steps: { title: string; short: string; description: string; icon: typeof Users; fields: (keyof PostReportFields)[] }[] = [
  { title: 'Activity details', short: 'Details', description: 'Review the event information and participation figures.', icon: ClipboardList, fields: ['title', 'date', 'venue', 'office', 'beneficiaries', 'target', 'attended', 'allocation'] },
  { title: 'Activity narrative', short: 'Narrative', description: 'Tell the story of the activity and what it accomplished.', icon: PencilLine, fields: ['highlights', 'background', 'objectives'] },
  { title: 'Signatories', short: 'Signatories', description: 'Assign the people who prepared and noted this report.', icon: Users, fields: ['preparedName', 'preparedPosition', 'notedName', 'notedPosition'] },
  { title: 'Review & print', short: 'Review', description: 'Check your document before printing or saving a PDF.', icon: FileCheck2, fields: [] },
]
const placeholders: Partial<Record<keyof PostReportFields, string>> = {
  title: 'Enter the activity title', date: 'e.g. November 19, 2026', venue: 'Venue or location',
  beneficiaries: 'Who benefited from this activity?', office: 'Office responsible for the activity',
  highlights: 'Describe the key sessions, achievements, and notable moments during the activity.',
  background: 'Explain why the activity was conducted and the needs it addressed.',
  objectives: 'List the objectives the activity aimed to achieve, one per line.',
  preparedName: 'Full name and credentials', notedName: 'Full name and credentials',
  preparedPosition: 'e.g. Project Coordinator', notedPosition: 'e.g. Youth Development Officer',
}
const paperStyles = `
  @page { size: A4; margin: 18mm; }
  .post-report-paper { font: 11pt/1.5 Cambria, Georgia, serif; color: #111; background: white; overflow-wrap: anywhere; }
  .post-report-paper header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 24px; }
  .post-report-paper header p { margin: 0; }
  .post-report-paper h2 { font-size: 16pt; margin: 5px 0; }
  .post-report-paper h3 { font-size: 12pt; margin: 32px 0 16px; }
  .post-report-paper dl { margin: 0; }
  .post-report-paper dl > div { display: grid; grid-template-columns: 42% 1fr; gap: 12px; margin-bottom: 4px; }
  .post-report-paper dt { font-weight: bold; }
  .post-report-paper dd { margin: 0; white-space: pre-wrap; }
  .post-report-paper .narrative { white-space: pre-wrap; min-height: 90px; }
  .post-report-paper .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 64px; break-inside: avoid; }
  .post-report-paper .signature-name { margin: 52px 0 0; font-weight: bold; text-transform: uppercase; white-space: pre-wrap; }
  .post-report-paper .signature-position { margin: 0; font-style: italic; white-space: pre-wrap; }
`

export function PostReportPaper({ fields }: { fields: PostReportFields }) {
  return <article className="post-report-paper">
    <header><p>Republic of the Philippines · City of Panabo</p><h2>Office of the City Mayor</h2><p>{fields.office || 'City Youth Development Office'}</p><h3>POST-ACTIVITY REPORT</h3></header>
    <dl>{summaryKeys.map(key => <div key={key}><dt>{postReportLabels[key]}</dt><dd>: {fields[key] || '—'}</dd></div>)}</dl>
    <h3>Background of the Activity</h3><div className="narrative">{fields.background || '—'}</div>
    <h3>OBJECTIVES</h3><div className="narrative">{fields.objectives || '—'}</div>
    <div className="signatures">{(['prepared', 'noted'] as const).map(person => <div key={person}>
      <p>{person === 'prepared' ? 'Prepared by:' : 'Noted by:'}</p>
      <p className="signature-name">{fields[`${person}Name`] || '________________________'}</p>
      <p className="signature-position">{fields[`${person}Position`] || 'Position / designation'}</p>
    </div>)}</div>
  </article>
}

export default function PostActivityReport() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [activityId, setActivityId] = useState('')
  const [report, setReport] = useState<SavedPostReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [step, setStep] = useState(0)
  const [showIssues, setShowIssues] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<keyof PostReportFields, boolean>>>({})
  const preview = useRef<HTMLDivElement>(null)
  const editorHeading = useRef<HTMLHeadingElement>(null)
  const editorPanel = useRef<HTMLDivElement>(null)
  const activity = activities.find(item => item.id === activityId)
  const completed = activity ? getActivityLifecycleStatus(activity) === 'completed' : false

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    fetchActivities(true).then(rows => { if (active) setActivities(rows) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  useEffect(() => {
    if (!activity) return
    let active = true
    setReport(null); setLoading(true); setError(''); setNotice(''); setDirty(false); setStep(0); setShowIssues(false); setTouched({})
    loadPostReport(activity).then(data => { if (active) setReport(data) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [activity])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const allKeys = Object.keys(postReportLabels) as (keyof PostReportFields)[]
  const missingKeys = report ? allKeys.filter(key => postReportFieldIssue(report.fields, key)) : []
  const validCount = report ? allKeys.length - missingKeys.length : 0
  const progress = Math.round(validCount / allKeys.length * 100)
  const stepComplete = (index: number) => report && (index === 3 ? !missingKeys.length : steps[index].fields.every(key => !postReportFieldIssue(report.fields, key)))

  function goTo(next: number, focusField?: keyof PostReportFields) {
    setStep(next)
    requestAnimationFrame(() => {
      if (focusField) {
        const input = document.getElementById(`post-report-${focusField}`)
        input?.focus({ preventScroll: true })
        input?.scrollIntoView({ block: 'center', behavior: 'instant' })
      } else {
        editorHeading.current?.focus({ preventScroll: true })
        editorPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      }
    })
  }

  function change(key: keyof PostReportFields, value: string) {
    if (!report) return
    setReport({ ...report, fields: { ...report.fields, [key]: value } }); setDirty(true); setNotice('')
  }

  async function save() {
    if (!report || saving) return
    setSaving(true); setError(''); setNotice('')
    try { setReport(await savePostReport(activityId, report)); setDirty(false); setNotice('Report saved. You can reopen it and edit the signatories at any time.') }
    catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  function print() {
    if (!report || !preview.current) return
    const missing = postReportIssues(report.fields)
    if (missing.length) { setShowIssues(true); goTo(3); return }
    const frame = document.createElement('iframe')
    frame.title = 'Post-activity report print preview'
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    const printWindow = frame.contentWindow
    if (!doc || !printWindow) { frame.remove(); setError('Unable to open print preview. Please retry.'); return }
    doc.title = `Post-activity report - ${report.fields.title}`
    const style = doc.createElement('style'); style.textContent = paperStyles
    doc.head.appendChild(style)
    doc.body.appendChild(preview.current.firstElementChild!.cloneNode(true))
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
    void doc.fonts.ready.then(() => { printWindow.focus(); printWindow.print() })
  }

  function field(key: keyof PostReportFields, options: { multiline?: boolean; label?: string; hint?: string; rows?: number } = {}) {
    if (!report) return null
    const id = `post-report-${key}`
    const issue = (showIssues || touched[key]) ? postReportFieldIssue(report.fields, key) : null
    const numeric = key === 'target' || key === 'attended' || key === 'allocation'
    const inputProps = {
      id, value: report.fields[key], placeholder: placeholders[key] ?? '0',
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(key, event.target.value),
      onBlur: () => setTouched(previous => ({ ...previous, [key]: true })),
      className: `w-full rounded-xl border bg-white px-3.5 py-3 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:opacity-60 ${issue ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'} ${options.multiline ? 'min-h-28 resize-y' : ''}`,
      maxLength: 10000, disabled: saving, 'aria-invalid': Boolean(issue), 'aria-required': true,
      'aria-describedby': issue ? `${id}-error` : options.hint ? `${id}-hint` : undefined,
    }
    return <div key={key} className="min-w-0 space-y-2"><label htmlFor={id} className="block text-sm font-semibold text-gray-700">{options.label || postReportLabels[key]}</label>
      {options.multiline ? <textarea {...inputProps} rows={options.rows ?? 4} /> : <input {...inputProps} inputMode={numeric ? key === 'allocation' ? 'decimal' : 'numeric' : undefined} />}
      {issue ? <p id={`${id}-error`} className="text-xs text-red-600">{issue}</p> : options.hint ? <p id={`${id}-hint`} className="text-xs leading-relaxed text-gray-500">{options.hint}</p> : null}
    </div>
  }

  return <section aria-labelledby="post-report-heading" className="min-w-0 space-y-5">
    <style>{paperStyles.replace('@page { size: A4; margin: 18mm; }', '')}</style>
    <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-light text-primary"><FileText size={21} /></span><div><h2 id="post-report-heading" className="text-lg font-bold text-gray-900">Activity post report</h2>
      <p className="mt-1 text-sm leading-relaxed text-gray-500">Select an activity, complete the details, and prepare your official report.</p></div></div>
      <div className="mt-5 grid items-end gap-3 @min-[44rem]/reports:grid-cols-[minmax(0,1fr)_auto]"><div><label htmlFor="post-report-activity" className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">Select activity</label>
      <select id="post-report-activity" value={activityId} disabled={saving || loading} className="input min-h-12 w-full !bg-gray-50 !text-sm disabled:opacity-60" onChange={event => {
        if (dirty && !window.confirm('Switch activities and discard unsaved report changes?')) return
        setActivityId(event.target.value); setReport(null); setDirty(false); setError(''); setNotice('')
      }}><option value="">Choose an activity to get started</option>{activities.map(item => <option key={item.id} value={item.id}>{item.title} · {item.date} · {getActivityLifecycleStatus(item)}</option>)}</select></div>
      {activity && <div className={`inline-flex min-h-12 items-center gap-2 self-end rounded-xl px-4 text-xs font-semibold ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{completed ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}{completed ? 'Activity completed' : 'Activity not yet completed'}</div>}</div>
      {activity && <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500"><MapPin size={13} className="shrink-0" /><span>{activity.venue} <span className="mx-1 text-gray-300">/</span> {activity.date}</span></p>}
      {!loading && !activities.length && !error && <p className="mt-3 text-sm text-gray-500">No activities are available yet.</p>}
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><CircleAlert size={18} className="mt-0.5 shrink-0" /><p>{error} {!report && <button type="button" className="ml-2 font-semibold underline" onClick={() => setRetry(value => value + 1)}>Retry</button>}</p></div>}
    {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} className="shrink-0" />{notice}</p>}
    {loading && <div role="status" className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-12 text-sm text-gray-500"><LoaderCircle size={20} className="animate-spin text-primary" />Loading report data…</div>}
    {!activityId && !loading && activities.length > 0 && <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 px-6 py-16 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl border border-gray-200 bg-white text-primary"><ClipboardList size={26} /></span><h3 className="mt-4 font-bold text-gray-900">Your next report starts here</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">Choose an activity above. We’ll bring in the available details so you can focus on the results.</p></div>}
    {report && !loading && <>
      <div ref={editorPanel} className="scroll-mt-20 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-5 sm:px-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-widest text-gray-500">Prepare your report</p><p className="text-xs font-medium text-gray-500"><span className="font-bold text-primary">{validCount} of {allKeys.length}</span> fields complete</p></div>
          <nav aria-label="Post-report steps" className="grid grid-cols-2 gap-2 @min-[28rem]/reports:grid-cols-4 @min-[36rem]/reports:gap-3">{steps.map((item, index) => <button key={item.title} type="button" disabled={saving} aria-label={`Step ${index + 1}: ${item.title}`} aria-current={step === index ? 'step' : undefined} onClick={() => goTo(index)} className={`group rounded-xl border px-1.5 py-3 text-center transition-colors sm:px-3 sm:text-left ${step === index ? 'border-primary/25 bg-primary-light text-primary' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}>
            <span className="flex items-center justify-center gap-2.5 @min-[56rem]/reports:justify-start"><span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step === index ? 'bg-primary text-white' : stepComplete(index) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{stepComplete(index) ? <Check size={14} /> : index + 1}</span><span className="hidden text-xs font-bold @min-[56rem]/reports:block">{item.title}</span></span><span className="mt-2 block text-[11px] font-semibold @min-[56rem]/reports:hidden">{item.short}</span>
          </button>)}</nav>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="Report completion" aria-valuemin={0} aria-valuemax={allKeys.length} aria-valuenow={validCount}><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="mb-6 flex items-start gap-3"><span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-gray-50 text-primary">{(() => { const Icon = steps[step].icon; return <Icon size={20} /> })()}</span><div><h3 ref={editorHeading} tabIndex={-1} className="scroll-mt-6 text-lg font-bold text-gray-900 outline-none">{steps[step].title}</h3><p className="mt-1 text-sm leading-relaxed text-gray-500">{steps[step].description}</p></div></div>
          {step === 0 && <div className="space-y-7">
            <div className="rounded-xl border border-blue-100 bg-primary-light/50 px-4 py-3 text-xs leading-relaxed text-primary">Complete the fields from the organization’s post-report template. Review prefilled details before printing. You can save an incomplete draft; edits apply only to this report.</div>
            <div className="grid gap-x-6 gap-y-5 @min-[36rem]/reports:grid-cols-2">{field('title', { label: 'Event Title' })}{field('date', { label: 'Date', hint: 'Date or date range when the activity was held.' })}{field('venue', { hint: 'Actual location where the activity was conducted.' })}{field('office', { hint: 'Office responsible for implementing the activity.' })}</div>
            <div className="border-t border-gray-100 pt-6"><h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-500">Participation & budget</h4><div className="grid gap-5 @min-[44rem]/reports:grid-cols-3">{field('target', { label: 'No. of Target Participants', hint: 'Planned participant count. Review the prefilled activity slots.' })}{field('attended', { label: 'Number of Actual Attendees', hint: 'People who actually attended. Review the recorded attendance count.' })}{field('allocation', { label: 'Budget Allocation (PHP)', hint: 'Budget allocated for the activity, in pesos.' })}</div><div className="mt-5">{field('beneficiaries', { multiline: true, rows: 3, hint: 'Identify the people or groups the activity served, including the beneficiary breakdown if available.' })}</div></div>
          </div>}
          {step === 1 && <div className="space-y-6">
            {field('highlights', { multiline: true, label: 'Highlight of the Activity', rows: 5, hint: 'The person preparing the report should describe what actually happened: key sessions, results, and notable moments.' })}
            <div className="grid items-start gap-6 @min-[44rem]/reports:grid-cols-2">{field('background', { multiline: true, label: 'Background of the Activity', rows: 6, hint: 'Explain the activity’s purpose, context, and the needs it addressed. Review any prefilled proposal background.' })}{field('objectives', { multiline: true, rows: 6, hint: 'State what the activity aimed to achieve. Review the approved objectives and put each objective on a new line.' })}</div>
          </div>}
          {step === 2 && <div>
            <div className="grid gap-5 @min-[44rem]/reports:grid-cols-2">{(['prepared', 'noted'] as const).map((person, index) => <div key={person} role="group" aria-labelledby={`${person}-signatory-title`} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl border border-gray-200 bg-white text-primary"><Users size={18} /></span><div><h4 id={`${person}-signatory-title`} className="text-sm font-bold text-gray-900">{person === 'prepared' ? 'Prepared by' : 'Noted by'}</h4><p className="mt-0.5 text-xs text-gray-500">{index === 0 ? 'Person who prepared the report' : 'Person who acknowledges the report'}</p></div></div><div className="space-y-5">{field(`${person}Name`, { label: 'Full name & credentials' })}{field(`${person}Position`, { label: 'Position / designation' })}</div></div>)}</div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-gray-500"><PencilLine size={14} className="mt-0.5 shrink-0" />Both signatories can be changed for each report, depending on who is assigned.</p>
          </div>}
          {step === 3 && <div className="space-y-5">
            <div className={`rounded-xl border p-4 ${missingKeys.length ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex items-start gap-3">{missingKeys.length ? <CircleAlert size={20} className="mt-0.5 shrink-0 text-amber-600" /> : <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />}<div className="min-w-0"><h4 className="text-sm font-bold text-gray-900">{missingKeys.length ? `${missingKeys.length} ${missingKeys.length === 1 ? 'field needs' : 'fields need'} attention` : 'Your report is complete'}</h4><p className="mt-1 text-xs leading-relaxed text-gray-600">{missingKeys.length ? 'Complete the fields below before printing. You can save a draft at any time.' : 'Review the document below, then print it or save a PDF.'}</p>
              {missingKeys.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{missingKeys.map(key => <button key={key} type="button" onClick={() => { setShowIssues(true); goTo(steps.findIndex(item => item.fields.includes(key)), key) }} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:border-amber-400">{postReportLabels[key]}<ChevronRight size={12} /></button>)}</div>}
            </div></div></div>
            {!completed && <p className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600"><CircleAlert size={16} className="shrink-0 text-amber-600" />Printing is available after the activity ends. You can continue preparing and saving this draft.</p>}
            <ReportDocumentPreview contentRef={preview}><PostReportPaper fields={report.fields} /></ReportDocumentPreview>
          </div>}
        </div>
      </div>
      <div className="post-report-actions relative z-20 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_4px_24px_rgba(15,23,42,0.08)] @min-[36rem]/reports:sticky @min-[36rem]/reports:bottom-3 @min-[36rem]/reports:px-6">
        <div className="grid gap-3 @min-[36rem]/reports:flex @min-[36rem]/reports:flex-wrap @min-[36rem]/reports:items-center @min-[36rem]/reports:justify-between"><div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={saving || (!dirty && report.revision > 0)} onClick={() => void save()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{saving ? 'Saving…' : 'Save draft'}</button>
          <span role="status" className="min-w-0 text-xs text-gray-500">{dirty ? 'Unsaved changes' : report.revision ? 'All changes saved' : 'Draft not saved yet'}</span></div>
          <div className="flex w-full flex-wrap items-center gap-2 @min-[36rem]/reports:w-auto">{step > 0 && <button type="button" disabled={saving} onClick={() => goTo(step - 1)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"><ArrowLeft size={15} />Back</button>}
          {step < 3 ? <button type="button" disabled={saving} onClick={() => goTo(step + 1)} className="btn-primary inline-flex min-h-11 flex-1 items-center justify-center gap-2 !rounded-xl disabled:opacity-50">{step === 2 ? 'Review report' : 'Continue'}<ArrowRight size={16} /></button> : <button type="button" disabled={saving || !completed || missingKeys.length > 0} onClick={print} className="btn-primary inline-flex min-h-11 flex-1 items-center justify-center gap-2 !rounded-xl disabled:cursor-not-allowed disabled:opacity-50"><Printer size={16} />Print / Save PDF</button>}
          </div>
        </div>
      </div>
    </>}
  </section>
}
