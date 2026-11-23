import { useState, type ReactNode } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronLeft, ChevronRight, CircleAlert, Lightbulb, MessageSquare, Minus, RefreshCw, Search, Star, Users, X } from 'lucide-react'
import type { ReportData } from './reportService'
import { attendanceRate, buildAdvancedInsights, evaluationCount } from './insightModel'
import FeedbackComment from './FeedbackComment'
import { SkeletonBox } from '../../components/Skeleton'

type Sentiment = ReportData['feedbackAnalysis']['comments'][number]['sentiment']
const sentiments: { id: Sentiment; label: string; dot: string; color: string }[] = [
  { id: 'positive', label: 'Positive', dot: 'bg-emerald-500', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'negative', label: 'Negative', dot: 'bg-rose-500', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'mixed', label: 'Mixed', dot: 'bg-amber-400', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'neutral', label: 'Neutral', dot: 'bg-sky-400', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'no-signal', label: 'Uncertain', dot: 'bg-slate-400', color: 'bg-slate-100 text-slate-700 border-slate-200' },
]
const PAGE_SIZE = 5
const card = 'min-w-0 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6'

function Metric({ icon, label, value, detail, difference, unit = '', trend = false }: { icon: ReactNode; label: string; value: string | number; detail: string; difference: number | null; unit?: string; trend?: boolean }) {
  const Direction = difference === null || difference === 0 ? Minus : difference > 0 ? ArrowUpRight : ArrowDownRight
  return <article className={card}>
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-gray-500">{label}</p><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">{icon}</span></div>
    <p className="mt-3 break-words text-3xl font-extrabold tracking-tight text-gray-900">{value}</p><p className="mt-2 text-xs leading-relaxed text-gray-500">{detail}</p>
    <div className="mt-4 border-t border-gray-100 pt-3"><p className={`inline-flex items-start gap-1 text-[11px] font-semibold ${trend && difference !== null && difference !== 0 ? difference > 0 ? 'text-emerald-700' : 'text-rose-700' : 'text-gray-500'}`}><Direction size={13} className="mt-0.5 shrink-0" />{difference === null ? 'No previous-month baseline' : `${difference > 0 ? '+' : ''}${Number(difference.toFixed(1))}${unit} vs previous month`}</p></div>
  </article>
}

export default function InsightsDashboard({ current, previous, loading, error, comparisonError, onRetry }: { current: ReportData | null; previous: ReportData | null; loading: boolean; error: string; comparisonError: string; onRetry: () => void }) {
  const [sentiment, setSentiment] = useState<Sentiment | 'all'>('all')
  const [theme, setTheme] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  if (loading) return <div role="status" aria-label="Loading monthly insights" className="space-y-5"><span className="sr-only">Loading monthly performance and feedback analysis…</span><div aria-hidden="true" className="grid gap-4 @min-[32rem]/reports:grid-cols-2 @min-[64rem]/reports:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className={card}><SkeletonBox className="h-3 w-24" /><SkeletonBox className="my-5 h-9 w-20" /><SkeletonBox className="h-3 w-full" /></div>)}</div><div aria-hidden="true" className={card}><SkeletonBox className="mb-6 h-5 w-48" />{[1, 2, 3].map(i => <SkeletonBox key={i} className="mb-5 h-12 w-full" />)}</div></div>
  if (error || !current) return <div role="alert" className={`${card} text-center`}><CircleAlert className="mx-auto text-rose-500" size={28} /><h3 className="mt-3 font-bold text-gray-900">Insights couldn’t be loaded</h3><p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">{error || 'Please try again.'}</p><button type="button" onClick={onRetry} className="btn-primary mt-5 inline-flex items-center gap-2"><RefreshCw size={15} />Try again</button></div>
  if (!current.totalActivities) return <div className={`${card} py-14 text-center`}><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-light text-primary"><BarChart3 size={26} /></span><h3 className="mt-4 text-lg font-bold text-gray-900">No activities in this month</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500">Choose another month to explore participation and participant feedback. Insights use activities whose start dates fall in the selected month.</p></div>

  const rate = attendanceRate(current)
  const previousRate = previous ? attendanceRate(previous) : null
  const evaluations = evaluationCount(current)
  const rating = current.avgSatisfaction === 'N/A' ? null : Number(current.avgSatisfaction)
  const previousRating = previous?.avgSatisfaction === 'N/A' || !previous ? null : Number(previous.avgSatisfaction)
  const insights = buildAdvancedInsights(current, previous)
  const analysis = current.feedbackAnalysis
  const filtered = analysis.comments.filter(comment =>
    (sentiment === 'all' || comment.sentiment === sentiment) &&
    (theme === 'all' || comment.themes.includes(theme)) &&
    `${comment.activityTitle} ${comment.text}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const shown = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const reset = () => { setQuery(''); setSentiment('all'); setTheme('all'); setPage(1) }
  const hasFilters = query || sentiment !== 'all' || theme !== 'all'
  const topics = [...new Set([...analysis.themeCounts.map(item => item.theme), ...analysis.comments.flatMap(comment => comment.themes)])].sort()

  return <div className="space-y-5">
    {comparisonError && <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800"><CircleAlert size={16} className="shrink-0" />{comparisonError}</p>}
    <div className="grid gap-4 @min-[32rem]/reports:grid-cols-2 @min-[64rem]/reports:grid-cols-4">
      <Metric icon={<Activity size={17} />} label="Activities" value={current.totalActivities} detail="Activities starting this month" difference={previous ? current.totalActivities - previous.totalActivities : null} />
      <Metric icon={<Users size={17} />} label="Registrations" value={current.totalRegistered.toLocaleString()} detail="Registrations across these activities" difference={previous ? current.totalRegistered - previous.totalRegistered : null} />
      <Metric icon={<Check size={17} />} label="Attendance rate" value={rate === null ? '—' : `${Math.round(rate)}%`} detail={`${current.totalAttended.toLocaleString()} attended · ${current.totalRegistered.toLocaleString()} registered`} difference={rate !== null && previousRate !== null ? rate - previousRate : null} unit=" pts" trend />
      <Metric icon={<Star size={17} />} label="Average satisfaction" value={rating === null ? '—' : `${current.avgSatisfaction}/5`} detail={evaluations ? `Based on ${evaluations} evaluation${evaluations === 1 ? '' : 's'}` : 'No evaluations submitted yet'} difference={rating !== null && previousRating !== null ? rating - previousRating : null} trend />
    </div>

    <div className="grid items-start gap-5 @min-[60rem]/reports:grid-cols-2">
      <section className={card} aria-labelledby="insight-takeaways"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><Lightbulb size={19} /></span><div><h3 id="insight-takeaways" className="font-bold text-gray-900">Key takeaways</h3><p className="mt-1 text-xs text-gray-500">What the data suggests you review next</p></div></div>
        <ul aria-label="Key takeaways list" tabIndex={0} className="mt-5 max-h-[26rem] divide-y divide-gray-100 overflow-y-auto overscroll-contain rounded-lg pr-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{insights.map((insight, i) => <li key={insight} className="flex gap-3 py-3.5 first:pt-0"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-gray-100 text-[10px] font-bold text-gray-500">{String(i + 1).padStart(2, '0')}</span><p className="min-w-0 break-words text-sm leading-relaxed text-gray-600">{insight}</p></li>)}</ul>
      </section>
      <section className={card} aria-labelledby="insight-attendance"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary"><BarChart3 size={19} /></span><div><h3 id="insight-attendance" className="font-bold text-gray-900">Attendance by activity</h3><p className="mt-1 text-xs text-gray-500">Actual attendance as a share of registrations</p></div></div>
        <div role="region" aria-label="Activity attendance list" tabIndex={0} className="mt-5 max-h-[26rem] space-y-5 overflow-y-auto overscroll-contain rounded-lg pr-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{current.activityRows.map((row, i) => { const percent = row.registered ? row.attended / row.registered * 100 : null; return <div key={`${row.title}-${i}`}><div className="flex items-start justify-between gap-3 text-xs"><p className="min-w-0 break-words font-semibold text-gray-700">{row.title}</p><span className="shrink-0 font-bold text-gray-900">{percent === null ? '—' : `${Math.round(percent)}%`}</span></div><div className="my-2 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(percent ?? 0, 100)}%` }} /></div><p className="text-[11px] text-gray-500">{row.attended} attended / {row.registered} registered{!row.registered && ' · No attendance-rate baseline'}</p></div> })}</div>
      </section>
    </div>

    <section className={card} aria-labelledby="insight-feedback"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><MessageSquare size={19} /></span><div><h3 id="insight-feedback" className="font-bold text-gray-900">Participant feedback</h3><p className="mt-1 text-xs leading-relaxed text-gray-500">{analysis.analyzedComments} written comment{analysis.analyzedComments === 1 ? '' : 's'} · {evaluations} evaluation{evaluations === 1 ? '' : 's'}</p></div></div><span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">Suggested analysis</span></div>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">Sentiment and topics are suggestions from written feedback. Read the original comments to understand the context.{analysis.analyzedComments > 0 && analysis.analyzedComments < 3 && ' Fewer than three comments are available; these are individual observations.'}</p>
      {!analysis.analyzedComments ? <div className="mt-5 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center"><MessageSquare size={24} className="mx-auto text-gray-400" /><h4 className="mt-3 text-sm font-bold text-gray-700">No written feedback yet</h4><p className="mt-1 text-xs leading-relaxed text-gray-500">Ratings may still be available above. Written comments will appear here when participants submit them.</p></div> : <>
        <div className="mt-5 grid grid-cols-2 gap-3 @min-[48rem]/reports:grid-cols-5">{sentiments.map(item => <button key={item.id} type="button" aria-pressed={sentiment === item.id} onClick={() => { setSentiment(value => value === item.id ? 'all' : item.id); setPage(1) }} className={`rounded-xl border p-4 text-left transition-colors ${sentiment === item.id ? `${item.color} ring-2 ring-primary/15` : 'border-gray-200 bg-white hover:bg-gray-50'}`}><span className="flex items-center gap-2 text-xs font-semibold text-gray-600"><span className={`size-2 shrink-0 rounded-full ${item.dot}`} />{item.label}</span><span className="mt-2 block text-2xl font-extrabold text-gray-900">{analysis.sentimentCounts[item.id] ?? 0}</span><span className="mt-1 block text-[10px] text-gray-500">{Math.round((analysis.sentimentCounts[item.id] ?? 0) / analysis.analyzedComments * 100)}% of written comments</span></button>)}</div>

        <div className="mt-6 border-t border-gray-100 pt-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-gray-900">Explore comments</h4><p role="status" className="text-xs text-gray-500">{filtered.length} matching comment{filtered.length === 1 ? '' : 's'}</p></div>
          <div className="grid items-end gap-3 @min-[36rem]/reports:grid-cols-[minmax(0,1fr)_180px]"><label className="min-w-0 text-xs font-semibold text-gray-600">Search comments or activities<span className="relative mt-1.5 block"><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-gray-400" /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder="Search feedback…" className="input min-h-11 !pl-9 !pr-9" />{query && <button type="button" aria-label="Clear comment search" onClick={() => { setQuery(''); setPage(1) }} className="absolute right-1 top-1 grid size-9 place-items-center text-gray-400 hover:text-gray-700"><X size={14} /></button>}</span></label><label className="min-w-0 text-xs font-semibold text-gray-600">Topic<select value={theme} onChange={event => { setTheme(event.target.value); setPage(1) }} className="input mt-1.5 min-h-11 !pr-10 capitalize"><option value="all">All topics</option>{topics.map(topic => <option key={topic} value={topic}>{topic}</option>)}</select></label></div>
          {hasFilters && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500"><span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">Filtering: {sentiment === 'all' ? 'all sentiments' : sentiments.find(item => item.id === sentiment)?.label}{theme !== 'all' ? ` · ${theme}` : ''}{query.trim() ? ` · “${query.trim()}”` : ''}</span><button type="button" onClick={reset} className="min-h-11 font-semibold text-primary">Clear filters</button></div>}
          <div className="mt-4 space-y-3">{shown.length ? shown.map(comment => <FeedbackComment key={comment.id} comment={comment} />) : <div className="rounded-xl bg-gray-50 p-8 text-center"><Search size={23} className="mx-auto text-gray-400" /><h5 className="mt-3 text-sm font-bold text-gray-700">No comments match these filters</h5><button type="button" onClick={reset} className="mt-2 min-h-11 text-xs font-semibold text-primary">Clear filters to see all comments</button></div>}</div>
          {filtered.length > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4"><p className="text-xs text-gray-500">Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</p><div className="flex items-center gap-2"><button type="button" aria-label="Previous comment page" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className="grid size-11 place-items-center rounded-lg border border-gray-200 disabled:opacity-40"><ChevronLeft size={16} /></button><span className="text-xs text-gray-500">{safePage} / {pageCount}</span><button type="button" aria-label="Next comment page" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} className="grid size-11 place-items-center rounded-lg border border-gray-200 disabled:opacity-40"><ChevronRight size={16} /></button></div></div>}
        </div>
      </>}
    </section>
  </div>
}
