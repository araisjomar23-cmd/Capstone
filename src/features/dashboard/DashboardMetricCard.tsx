import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Info } from 'lucide-react'

export default function DashboardMetricCard({ icon, color, label, value, caption, details, note, meter, to, linkLabel }: {
  icon: ReactNode; color: string; label: string; value: string; caption: string
  details: { label: string; value: string }[]; note: string
  meter?: { value: number; total: number; label: string }
  to: string; linkLabel: string
}) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const percentage = meter && meter.total > 0 ? meter.value / meter.total * 100 : null
  return <article className="dashboard-metric relative min-w-0 rounded-xl border border-slate-200 bg-white p-4"
    onMouseEnter={() => setOpen(true)} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setOpen(false) }}
    onFocusCapture={() => setOpen(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-slate-500"><span className="shrink-0 [&>svg]:size-4" style={{ color }}>{icon}</span>{label}</span>
      <button type="button" aria-label={`${label} details`} aria-describedby={tooltipId} onClick={() => setOpen(true)} className="grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Info size={14} aria-hidden="true" /></button>
    </div>
    <Link to={to} aria-label={`${linkLabel}: ${value}`} className="mt-1 inline-flex min-h-10 max-w-full items-center gap-2 text-[clamp(1.4rem,2.1vw,1.8rem)] font-bold leading-tight tracking-tight text-slate-900 hover:text-primary"><span className="min-w-0 break-words">{value}</span><ArrowUpRight size={14} aria-hidden="true" className="shrink-0 text-slate-400" /></Link>
    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{caption}</p>
    <div className="mt-3 border-t border-slate-100 pt-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] font-medium text-slate-500"><span>{meter?.label || 'No responses yet'}</span><span>{percentage === null ? '—' : `${Math.round(percentage)}%`}</span></div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${percentage === null ? 0 : Math.max(0, Math.min(100, percentage))}%`, backgroundColor: color }} /></div>
    </div>
    <div id={tooltipId} role="tooltip" hidden={!open} className="absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl">
      <p className="mb-3 text-xs font-bold">{label} breakdown</p>
      <dl className="space-y-2">{details.map(item => <div key={item.label} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs"><dt className="text-slate-500">{item.label}</dt><dd className="break-words font-semibold">{item.value}</dd></div>)}</dl>
      <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-500">{note}</p>
    </div>
  </article>
}
