import { useEffect, useState } from 'react'
import { generateReport } from '../../features/reports/reportService'
import type { ReportData } from '../../features/reports/reportService'
import InsightsDashboard from '../../features/reports/InsightsDashboard'
import { ChevronLeft, ChevronRight, FileText, Lightbulb, Printer, RefreshCw } from 'lucide-react'
import DatePicker from '../../components/DatePicker'
import { currentMonthPeriod } from '../../lib/activityDatePeriod'
import { SkeletonBox, SkeletonTableRows } from '../../components/Skeleton'
import PostActivityReport from '../../features/reports/PostActivityReport'

function localDateISO(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
function monthRange(year: number, month: number) {
  const from = new Date(year, month, 1)
  const to = new Date(year, month + 1, 0)
  return { from: localDateISO(from), to: localDateISO(to) }
}

function AdminReports() {
  const [view, setView] = useState<'post' | 'monitoring' | 'insights'>('post')
  const [currentPeriod] = useState(currentMonthPeriod)
  const [reportType, setReportType] = useState<'Monthly' | 'Quarterly' | 'Annual'>('Monthly')
  const [dateFrom, setDateFrom] = useState(() => monthRange(Number(currentPeriod.year), Number(currentPeriod.month) - 1).from)
  const [dateTo, setDateTo] = useState(() => monthRange(Number(currentPeriod.year), Number(currentPeriod.month) - 1).to)
  const [preparedBy, setPreparedBy] = useState('')
  const [reviewedBy, setReviewedBy] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [office, setOffice] = useState('City Youth Development Office')
  const [report, setReport] = useState<ReportData | null>(null)
  const [insightData, setInsightData] = useState<ReportData | null>(null)
  const [previousInsightData, setPreviousInsightData] = useState<ReportData | null>(null)
  const [insightMonth, setInsightMonth] = useState(Number(currentPeriod.month) - 1)
  const [insightYear, setInsightYear] = useState(Number(currentPeriod.year))
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError, setInsightsError] = useState('')
  const [comparisonError, setComparisonError] = useState('')
  const [insightsRetry, setInsightsRetry] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (view !== 'insights') return
    let active = true
    setInsightsLoading(true)
    setInsightsError('')
    setComparisonError('')
    const range = monthRange(insightYear, insightMonth)
    const previousDate = new Date(insightYear, insightMonth - 1, 1)
    const previousRange = monthRange(previousDate.getFullYear(), previousDate.getMonth())
    Promise.allSettled([
      generateReport(range.from, range.to),
      generateReport(previousRange.from, previousRange.to),
    ]).then(([current, previous]) => {
      if (!active) return
      if (current.status === 'rejected') throw current.reason
      setInsightData(current.value)
      setPreviousInsightData(previous.status === 'fulfilled' ? previous.value : null)
      if (previous.status === 'rejected') setComparisonError('Previous-month data could not be loaded. Current-month results are still available.')
      setInsightsLoading(false)
    }).catch((error: unknown) => {
      if (!active) return
      setInsightData(null)
      setPreviousInsightData(null)
      setInsightsError(error instanceof Error ? error.message : String(error))
      setInsightsLoading(false)
    })
    return () => { active = false }
  }, [insightMonth, insightYear, view, insightsRetry])

  function shiftInsightMonth(offset: number) {
    const next = new Date(insightYear, insightMonth + offset, 1)
    setInsightYear(next.getFullYear()); setInsightMonth(next.getMonth())
  }

  async function handleGenerate() {
    setLoading(true)
    const data = await generateReport(dateFrom, dateTo)
    setReport(data)
    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="reports-workspace @container/reports min-w-0 p-3 sm:p-4 lg:p-8">
      <div className="mb-6 flex flex-col items-start justify-between gap-3 @min-[36rem]/reports:flex-row @min-[36rem]/reports:items-center print:hidden">
        <div>
          <h1 className="text-xl font-bold text-primary @min-[36rem]/reports:text-2xl">Reports & Insights</h1>
          <p className="text-sm text-gray-500">Auto-compiled monitoring reports and data-driven insights</p>
        </div>
        {report && view === 'monitoring' && (
          <button
            onClick={handlePrint}
            disabled={loading}
            className="bg-white border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <Printer size={14} className="inline mr-1.5" /> Print Report
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 print:hidden" aria-label="Report views">
        {([{ id: 'post', label: 'Activity post report' }, { id: 'monitoring', label: 'Monitoring report' }, { id: 'insights', label: 'Insights' }] as const).map(tab => <button key={tab.id} type="button" aria-pressed={view === tab.id} onClick={() => setView(tab.id)} className={`min-w-0 rounded-lg px-2 py-3 text-xs font-semibold @min-[36rem]/reports:px-4 @min-[36rem]/reports:text-sm ${view === tab.id ? 'bg-primary text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>{tab.label}</button>)}
      </div>
      <div hidden={view !== 'post'} className="print:hidden"><PostActivityReport /></div>

      <section hidden={view !== 'insights'} className="mb-6 space-y-5 print:hidden" aria-labelledby="period-insights-title">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-light text-primary"><Lightbulb size={21} /></span><div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">Monthly overview</p><h2 id="period-insights-title" className="mt-1 text-lg font-bold text-gray-900">Insights for {new Date(insightYear, insightMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</h2><p className="mt-1 text-sm text-gray-500">Understand participation, spot patterns, and plan your next steps.</p></div></div>
            <button type="button" onClick={() => setInsightsRetry(value => value + 1)} disabled={insightsLoading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"><RefreshCw size={14} className={insightsLoading ? 'animate-spin' : ''} />Refresh</button>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-gray-100 pt-5">
            <div className="flex min-w-0 flex-wrap items-end gap-3">
              <label className="min-w-0 text-xs font-semibold text-gray-500">Month<select aria-label="Insight month" value={insightMonth} onChange={event => setInsightMonth(Number(event.target.value))} className="input mt-1.5 block min-h-11 !w-auto !rounded-xl !bg-gray-50 !pr-10">{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Date(2000, month, 1).toLocaleString('en', { month: 'long' })}</option>)}</select></label>
              <label className="text-xs font-semibold text-gray-500">Year<select aria-label="Insight year" value={insightYear} onChange={event => setInsightYear(Number(event.target.value))} className="input mt-1.5 block min-h-11 !w-auto !rounded-xl !bg-gray-50 !pr-10">{[...new Set([...Array.from({ length: 11 }, (_, offset) => Number(currentPeriod.year) - 10 + offset), insightYear])].sort((a, b) => a - b).map(year => <option key={year} value={year}>{year}</option>)}</select></label>
              <div className="flex gap-1"><button type="button" aria-label="Previous insight month" onClick={() => shiftInsightMonth(-1)} className="grid size-11 place-items-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"><ChevronLeft size={18} /></button><button type="button" aria-label="Next insight month" onClick={() => shiftInsightMonth(1)} className="grid size-11 place-items-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"><ChevronRight size={18} /></button></div>
              <button type="button" disabled={insightYear === Number(currentPeriod.year) && insightMonth === Number(currentPeriod.month) - 1} onClick={() => { setInsightYear(Number(currentPeriod.year)); setInsightMonth(Number(currentPeriod.month) - 1) }} className="min-h-11 px-1 text-xs font-semibold text-primary disabled:text-gray-400">This month</button>
            </div>
            <p className="text-xs text-gray-500">Compared with {new Date(insightYear, insightMonth - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <InsightsDashboard key={`${insightYear}-${insightMonth}`} current={insightData} previous={previousInsightData} loading={insightsLoading} error={insightsError} comparisonError={comparisonError} onRetry={() => setInsightsRetry(value => value + 1)} />
      </section>

      {/* Generator form */}
      <div hidden={view !== 'monitoring'}>
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6 print:hidden">
        <h2 className="font-bold text-gray-900 mb-1"><FileText size={16} className="inline mr-1.5" /> Generate Report</h2>
        <p className="text-xs text-gray-400 mb-4">Compile monthly, quarterly, or annual MEAL reports</p>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {(['Monthly', 'Quarterly', 'Annual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setReportType(t)}
              className={`min-h-11 rounded-lg px-2 py-2 text-xs font-medium @min-[36rem]/reports:px-4 @min-[36rem]/reports:text-sm ${
                reportType === t ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 mb-3 @min-[36rem]/reports:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-600">Date From</label>
            <DatePicker value={dateFrom} onChange={setDateFrom} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label="Date from" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Date To</label>
            <DatePicker value={dateTo} onChange={setDateTo} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label="Date to" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-3 @min-[36rem]/reports:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-600">Prepared By</label>
            <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Name & Designation" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Reviewed By</label>
            <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Name & Designation" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 @min-[36rem]/reports:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-600">Approved By</label>
            <input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="e.g. CYDO Head" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Office / Unit</label>
            <input value={office} onChange={(e) => setOffice(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-primary text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate Report Preview'}
        </button>
      </div>

      {loading && <ReportPreviewSkeleton />}
      {report && !loading && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 @min-[36rem]/reports:p-8 print:shadow-none print:border-none">
          <div className="text-center mb-5">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">Republic of the Philippines</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400">City Government of Panabo</div>
            <div className="text-sm font-extrabold uppercase tracking-wide mt-1">City Youth Development Office</div>
            <div className="w-14 h-1 bg-primary mx-auto my-3 rounded" />
            <div className="text-lg font-bold text-gray-900">MEAL System — {reportType} Report</div>
            <div className="text-xs text-gray-400 mt-2">
              Period: {report.period} &nbsp;|&nbsp; Generated: {report.generatedAt}
            </div>
          </div>
          <div className="border-t-2 border-primary mb-6" />

          <SectionTitle>I. Executive Summary</SectionTitle>
          <div className="grid grid-cols-2 gap-3 mb-6 @min-[44rem]/reports:grid-cols-4 print:grid-cols-4">
            <Stat label="Total Activities" value={report.totalActivities} />
            <Stat label="Total Registered" value={report.totalRegistered} />
            <Stat label="Total Attended" value={report.totalAttended} />
            <Stat label="Avg. Satisfaction" value={report.avgSatisfaction} />
          </div>

          <SectionTitle>II. Activity Summary</SectionTitle>
          <div role="region" aria-label="Activity summary table" tabIndex={0} className="mb-6 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-gray-100 print:overflow-visible print:border-0"><table className="w-full min-w-[44rem] text-xs border-collapse print:min-w-0">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <Th>Activity</Th><Th>Program</Th><Th>Date</Th><Th>Slots</Th><Th>Registered</Th><Th>Attended</Th><Th>Status</Th><Th>Budget Util.</Th>
              </tr>
            </thead>
            <tbody>
              {report.activityRows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-4">No activities in this period.</td></tr>
              ) : (
                report.activityRows.map((a, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <Td>{a.title}</Td><Td>{a.program}</Td><Td>{a.date}</Td><Td>{a.slots}</Td><Td>{a.registered}</Td><Td>{a.attended}</Td><Td>{a.status}</Td><Td>{a.budgetUtil}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>

          <SectionTitle>III. Participant Demographics</SectionTitle>
          <div className="grid grid-cols-1 gap-4 mb-6 @min-[36rem]/reports:grid-cols-3 print:grid-cols-3">
            <DemoList title="By Gender" items={report.genderBreakdown} />
            <DemoList title="By Age Bracket" items={report.ageBreakdown} />
            <DemoList title="Top Barangays" items={report.topBarangays} />
          </div>

          <SectionTitle>IV. Budget Summary</SectionTitle>
          <div className="grid grid-cols-1 gap-3 mb-4 @min-[36rem]/reports:grid-cols-3 print:grid-cols-3">
            <Stat label="Total Allocated" value={`₱${report.budgetAllocated.toLocaleString()}`} />
            <Stat label="Total Utilized" value={`₱${report.budgetUtilized.toLocaleString()}`} />
            <Stat label="Remaining" value={`₱${report.budgetRemaining.toLocaleString()}`} />
          </div>
          <div role="region" aria-label="Budget summary table" tabIndex={0} className="mb-6 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-gray-100 print:overflow-visible print:border-0"><table className="w-full min-w-[34rem] text-xs border-collapse print:min-w-0">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <Th>Activity</Th><Th>Allocated</Th><Th>Utilized</Th><Th>Remaining</Th><Th>Utilization %</Th>
              </tr>
            </thead>
            <tbody>
              {report.budgetRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-4">No budget data for this period.</td></tr>
              ) : (
                report.budgetRows.map((b, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <Td>{b.title}</Td><Td>₱{b.allocated.toLocaleString()}</Td><Td>₱{b.utilized.toLocaleString()}</Td><Td>₱{b.remaining.toLocaleString()}</Td><Td>{b.utilPct}%</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>

          <SectionTitle>V. Evaluation & Satisfaction</SectionTitle>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">{report.evalSummary}</p>
          <div role="region" aria-label="Evaluation summary table" tabIndex={0} className="mb-6 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-gray-100 print:overflow-visible print:border-0"><table className="w-full min-w-[30rem] text-xs border-collapse print:min-w-0">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <Th>Activity</Th><Th>Responses</Th><Th>Avg. Rating</Th><Th>Would Recommend</Th>
              </tr>
            </thead>
            <tbody>
              {report.evalRows.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-gray-400 py-4">No evaluations for this period.</td></tr>
              ) : (
                report.evalRows.map((e, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <Td>{e.title}</Td><Td>{e.responses}</Td><Td>{e.avgRating}</Td><Td>{e.recommendPct}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>

          <SectionTitle>VI. Key Insights</SectionTitle>
          <ul className="text-xs text-gray-600 mb-6 space-y-2 leading-relaxed list-disc list-inside">
            {report.insights.map((insight, i) => (
            <li key={i}>{insight}</li>
            ))}
          </ul>

          <SectionTitle>VII. Certifications</SectionTitle>
          <div className="grid grid-cols-1 gap-5 mt-4 @min-[36rem]/reports:grid-cols-3 print:grid-cols-3">
            <SigBlock name={preparedBy} label="Prepared By" />
            <SigBlock name={reviewedBy} label="Reviewed By" />
            <SigBlock name={approvedBy} label="Approved By" />
          </div>

          <div className="text-center text-[10px] text-gray-300 mt-8 pt-4 border-t border-gray-100">
            This is a system-generated report from the CYDO MEAL System · {office}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function ReportPreviewSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 p-4 sm:p-8 print:hidden" aria-busy="true">
      <p role="status" className="sr-only">Generating report preview…</p>
      <div aria-hidden="true">
        <div className="flex flex-col items-center gap-3 mb-6">
          <SkeletonBox className="h-3 w-48 max-w-full" />
          <SkeletonBox className="h-5 w-72 max-w-full" />
          <SkeletonBox className="h-3 w-56 max-w-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-lg bg-gray-50 p-3 space-y-3">
              <SkeletonBox className="h-3 w-full" />
              <SkeletonBox className="h-6 w-1/2 mx-auto" />
            </div>
          ))}
        </div>
        {[8, 5, 4].map((cols) => (
          <div key={cols} className="mb-6">
            <SkeletonBox className="h-4 w-48 max-w-full mb-3" />
            <table className="w-full"><tbody><SkeletonTableRows cols={cols} rows={3} /></tbody></table>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-bold text-primary uppercase tracking-wide mb-3 mt-2">{children}</div>
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 bg-gray-50 rounded-lg p-3 text-center">
      <div className="text-[10px] uppercase text-gray-400">{label}</div>
      <div className="mt-1 break-words text-base font-bold text-gray-900 @min-[36rem]/reports:text-lg">{value}</div>
    </div>
  )
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-2 py-2 font-semibold">{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-2">{children}</td>
}
function DemoList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase text-gray-400 mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-300">—</div>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.label} className="flex min-w-0 justify-between gap-2 text-xs">
              <span className="text-gray-600">{it.label}</span>
              <span className="shrink-0 font-semibold text-gray-900">{it.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
function SigBlock({ name, label }: { name: string; label: string }) {
  return (
    <div className="text-center">
      <div className="border-b border-gray-800 pb-1 mb-2 min-h-[36px]" />
      <div className="text-xs font-bold uppercase">{name || '—'}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}

export default AdminReports
