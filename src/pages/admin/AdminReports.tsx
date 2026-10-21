import { useEffect, useState } from 'react'
import { generateReport } from '../../features/reports/reportService'
import type { ReportData } from '../../features/reports/reportService'
import { Activity, FileText, Lightbulb, Printer, Star, Users } from 'lucide-react'
import DatePicker from '../../components/DatePicker'

function todayISO() {
  return localDateISO(new Date())
}
function monthAgoISO() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return localDateISO(d)
}
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
function attendanceRate(data: ReportData) {
  return data.totalRegistered ? (data.totalAttended / data.totalRegistered) * 100 : null
}
function evaluationCount(data: ReportData) {
  return data.evalRows.reduce((sum, row) => sum + row.responses, 0)
}
function buildAdvancedInsights(current: ReportData, previous: ReportData) {
  const results = [...current.insights]
  const currentAttendance = attendanceRate(current)
  const previousAttendance = attendanceRate(previous)
  if (currentAttendance !== null && previousAttendance !== null) {
    const change = currentAttendance - previousAttendance
    if (Math.abs(change) >= 5) {
      results.push(`Attendance ${change > 0 ? 'improved' : 'fell'} by ${Math.abs(change).toFixed(0)} percentage points compared with the previous month (${previousAttendance.toFixed(0)}% to ${currentAttendance.toFixed(0)}%).`)
    }
  }

  const ratedActivities = current.evalRows.filter((row) => Number.isFinite(Number(row.avgRating)))
  if (ratedActivities.length) {
    const bestRated = [...ratedActivities].sort((a, b) => Number(b.avgRating) - Number(a.avgRating))[0]
    results.push(`Highest-rated activity: ${bestRated.title} at ${bestRated.avgRating}/5 from ${bestRated.responses} evaluation${bestRated.responses === 1 ? '' : 's'}.`)
  }

  const attendanceByActivity = current.activityRows
    .filter((row) => row.registered > 0)
    .map((row) => ({ ...row, rate: (row.attended / row.registered) * 100 }))
    .sort((a, b) => a.rate - b.rate)
  if (attendanceByActivity.length) {
    const lowest = attendanceByActivity[0]
    if (lowest.rate < 70) {
      results.push(`${lowest.title} had the lowest attendance (${lowest.rate.toFixed(0)}%, ${lowest.attended} of ${lowest.registered} registered). Consider reviewing reminders, timing, or access barriers.`)
    }
  }

  const evaluations = evaluationCount(current)
  if (current.totalAttended > 0) {
    const responseRate = (evaluations / current.totalAttended) * 100
    if (responseRate < 50) {
      results.push(`Evaluation response coverage is ${responseRate.toFixed(0)}% (${evaluations} responses for ${current.totalAttended} attendees). Consider setting aside time for feedback before participants leave.`)
    }
  }

  if (current.topBarangays[0]) {
    results.push(`Most represented barangay: ${current.topBarangays[0].label} (${current.topBarangays[0].count} registrations). Use this to compare reach across communities.`)
  }

  const commentAnalysis = current.feedbackAnalysis
  if (commentAnalysis.analyzedComments >= 3) {
    const negativeShare = commentAnalysis.sentimentCounts.negative / commentAnalysis.analyzedComments
    const positiveShare = commentAnalysis.sentimentCounts.positive / commentAnalysis.analyzedComments
    if (negativeShare >= 0.3) {
      const mainTheme = commentAnalysis.themeCounts[0]?.theme
      results.push(`Suggested text analysis found negative signals in ${Math.round(negativeShare * 100)}% of ${commentAnalysis.analyzedComments} written comments${mainTheme ? `; ${mainTheme} is the most-mentioned feedback theme` : ''}. Review the comments for context.`)
    } else if (positiveShare >= 0.6) {
      results.push(`Suggested text analysis found mostly positive signals in ${Math.round(positiveShare * 100)}% of written comments. Review the comments to identify practices worth repeating.`)
    }
  }

  return [...new Set(results)]
}

function AdminReports() {
  const [reportType, setReportType] = useState<'Monthly' | 'Quarterly' | 'Annual'>('Monthly')
  const [dateFrom, setDateFrom] = useState(monthAgoISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [preparedBy, setPreparedBy] = useState('')
  const [reviewedBy, setReviewedBy] = useState('')
  const [approvedBy, setApprovedBy] = useState('')
  const [office, setOffice] = useState('City Youth Development Office')
  const [report, setReport] = useState<ReportData | null>(null)
  const [insightData, setInsightData] = useState<ReportData | null>(null)
  const [previousInsightData, setPreviousInsightData] = useState<ReportData | null>(null)
  const [insightMonth, setInsightMonth] = useState(new Date().getMonth())
  const [insightYear, setInsightYear] = useState(new Date().getFullYear())
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError, setInsightsError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    setInsightsLoading(true)
    setInsightsError('')
    const range = monthRange(insightYear, insightMonth)
    const previousDate = new Date(insightYear, insightMonth - 1, 1)
    const previousRange = monthRange(previousDate.getFullYear(), previousDate.getMonth())
    Promise.all([
      generateReport(range.from, range.to),
      generateReport(previousRange.from, previousRange.to),
    ]).then(([current, previous]) => {
      if (!active) return
      setInsightData(current)
      setPreviousInsightData(previous)
      setInsightsLoading(false)
    }).catch((error: unknown) => {
      if (!active) return
      setInsightData(null)
      setPreviousInsightData(null)
      setInsightsError(error instanceof Error ? error.message : String(error))
      setInsightsLoading(false)
    })
    return () => { active = false }
  }, [insightMonth, insightYear])

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
    <div className="p-8">
      <div className="flex justify-between items-center mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-primary">Reports & Insights</h1>
          <p className="text-sm text-gray-500">Auto-compiled monitoring reports and data-driven insights</p>
        </div>
        {report && (
          <button
            onClick={handlePrint}
            className="bg-white border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Printer size={14} className="inline mr-1.5" /> Print Report
          </button>
        )}
      </div>

      <section className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6 print:hidden" aria-labelledby="period-insights-title">
        <div className="flex items-start gap-3 mb-4">
          <span className="rounded-lg bg-green-50 p-2 text-primary"><Lightbulb size={19} /></span>
          <div>
            <h2 id="period-insights-title" className="font-bold text-gray-900">
              Insights for {new Date(insightYear, insightMonth, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
            </h2>
            <p className="text-xs text-gray-500">Monthly performance, comparisons, and recommended follow-ups</p>
        </div>
      </div>

        <div className="flex flex-wrap gap-3 mb-4 print:hidden">
          <label className="text-xs font-semibold text-gray-600">Month
            <select value={insightMonth} onChange={(event) => setInsightMonth(Number(event.target.value))} className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-800">
              {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Date(2000, month, 1).toLocaleString('en', { month: 'long' })}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">Year
            <select value={insightYear} onChange={(event) => setInsightYear(Number(event.target.value))} className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-800">
              {Array.from({ length: 11 }, (_, offset) => new Date().getFullYear() - 10 + offset).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        </div>

        {insightsLoading ? (
          <p className="text-sm text-gray-500 py-3">Loading report data and analyzing written feedback… If comments exist, the first analysis downloads the multilingual model to this browser; later runs can reuse the cached model.</p>
        ) : insightData ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <InsightMetric icon={<Activity size={16} />} label="Activities" value={insightData.totalActivities} />
              <InsightMetric icon={<Users size={16} />} label="Registered participants" value={insightData.totalRegistered} />
              <InsightMetric
                icon={<Users size={16} />}
                label="Attendance rate"
                value={attendanceRate(insightData) === null ? '—' : `${Math.round(attendanceRate(insightData)!)}%`}
                comparison={previousInsightData && attendanceRate(previousInsightData) !== null && attendanceRate(insightData) !== null
                  ? `${(attendanceRate(insightData)! - attendanceRate(previousInsightData)! >= 0 ? '+' : '')}${(attendanceRate(insightData)! - attendanceRate(previousInsightData)!).toFixed(0)} pts vs previous month`
                  : 'No previous-month baseline'}
              />
              <InsightMetric
                icon={<Star size={16} />}
                label="Avg. satisfaction"
                value={insightData.avgSatisfaction === 'N/A' ? 'No ratings' : `${insightData.avgSatisfaction} / 5`}
                comparison={insightData.avgSatisfaction !== 'N/A' && previousInsightData && previousInsightData.avgSatisfaction !== 'N/A'
                  ? `${Number(insightData.avgSatisfaction) - Number(previousInsightData.avgSatisfaction) >= 0 ? '+' : ''}${(Number(insightData.avgSatisfaction) - Number(previousInsightData.avgSatisfaction)).toFixed(1)} vs previous month`
                  : 'No previous-month baseline'}
              />
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Key takeaways and recommended actions</h3>
              <ul className="space-y-2">
                {buildAdvancedInsights(insightData, previousInsightData || insightData).map((insight, index) => (
                  <li key={index} className="flex gap-2 text-sm text-gray-700">
                    <span className="mt-0.5 text-amber-600"><Lightbulb size={15} /></span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-gray-900">Written feedback analysis</h3>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">Suggested</span>
                <span className="text-xs text-gray-500">
                  {insightData.feedbackAnalysis.modelStatus === 'ready'
                    ? 'Local multilingual semantic model + Bisaya rules'
                    : insightData.feedbackAnalysis.modelStatus === 'unavailable'
                      ? 'Bisaya-aware NLP rules (semantic model unavailable)'
                      : 'Bisaya rules ready; semantic model loads when comments exist'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Based on {insightData.feedbackAnalysis.analyzedComments} written comment{insightData.feedbackAnalysis.analyzedComments === 1 ? '' : 's'}. Pretrained multilingual embeddings compare comments with sentiment and theme examples; weighted Bisaya/English rules handle negation, contrast, and emphasis, and take priority when they match. The model runs locally in this browser; feedback text is not sent to an inference API. Cebuano is low-resource for this model, so review the original comments.
                {' '}{insightData.feedbackAnalysis.modelStatus === 'ready'
                  ? `Semantic analysis contributed to ${insightData.feedbackAnalysis.semanticAssistedComments} comment${insightData.feedbackAnalysis.semanticAssistedComments === 1 ? '' : 's'}.`
                  : insightData.feedbackAnalysis.modelStatus === 'unavailable'
                    ? 'The model could not be loaded, so these results use the Bisaya-aware rules only.'
                    : 'The model loads when written comments are available.'} Review original feedback before making decisions.
              </p>
              {insightData.feedbackAnalysis.analyzedComments === 0 ? (
                <p className="text-sm text-gray-500">No written comments are available for this period.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <SentimentCount label="Positive" count={insightData.feedbackAnalysis.sentimentCounts.positive} color="bg-green-50 text-green-700" />
                    <SentimentCount label="Negative" count={insightData.feedbackAnalysis.sentimentCounts.negative} color="bg-red-50 text-red-700" />
                    <SentimentCount label="Mixed" count={insightData.feedbackAnalysis.sentimentCounts.mixed} color="bg-amber-50 text-amber-700" />
                    <SentimentCount label="No signal" count={insightData.feedbackAnalysis.sentimentCounts['no-signal']} color="bg-gray-100 text-gray-600" />
                  </div>
                  {insightData.feedbackAnalysis.themeCounts.length ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="font-semibold">Common themes:</span>
                      {insightData.feedbackAnalysis.themeCounts.slice(0, 5).map((theme) => (
                        <span key={theme.theme} className="rounded-full border border-gray-200 px-2.5 py-1 capitalize">
                          {theme.theme} · {theme.count} (positive {theme.sentimentCounts.positive}, negative {theme.sentimentCounts.negative}, mixed {theme.sentimentCounts.mixed})
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-xs text-gray-500">No configured feedback themes were matched.</p>}
                </>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-red-600 py-2">Could not load insights: {insightsError || 'Try changing the date range or generating the report again.'}</p>
        )}
      </section>

      {/* Generator form */}
      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6 print:hidden">
        <h2 className="font-bold text-gray-900 mb-1"><FileText size={16} className="inline mr-1.5" /> Generate Report</h2>
        <p className="text-xs text-gray-400 mb-4">Compile monthly, quarterly, or annual MEAL reports</p>

        <div className="flex gap-2 mb-4">
          {(['Monthly', 'Quarterly', 'Annual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setReportType(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
                reportType === t ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-semibold text-gray-600">Date From</label>
            <DatePicker value={dateFrom} onChange={setDateFrom} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label="Date from" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Date To</label>
            <DatePicker value={dateTo} onChange={setDateTo} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" aria-label="Date to" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-semibold text-gray-600">Prepared By</label>
            <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Name & Designation" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Reviewed By</label>
            <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Name & Designation" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
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

      {report && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-8 print:shadow-none print:border-none">
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
          <div className="grid grid-cols-4 gap-3 mb-6">
            <Stat label="Total Activities" value={report.totalActivities} />
            <Stat label="Total Registered" value={report.totalRegistered} />
            <Stat label="Total Attended" value={report.totalAttended} />
            <Stat label="Avg. Satisfaction" value={report.avgSatisfaction} />
          </div>

          <SectionTitle>II. Activity Summary</SectionTitle>
          <table className="w-full text-xs mb-6 border-collapse">
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
          </table>

          <SectionTitle>III. Participant Demographics</SectionTitle>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <DemoList title="By Gender" items={report.genderBreakdown} />
            <DemoList title="By Age Bracket" items={report.ageBreakdown} />
            <DemoList title="Top Barangays" items={report.topBarangays} />
          </div>

          <SectionTitle>IV. Budget Summary</SectionTitle>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Total Allocated" value={`₱${report.budgetAllocated.toLocaleString()}`} />
            <Stat label="Total Utilized" value={`₱${report.budgetUtilized.toLocaleString()}`} />
            <Stat label="Remaining" value={`₱${report.budgetRemaining.toLocaleString()}`} />
          </div>
          <table className="w-full text-xs mb-6 border-collapse">
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
          </table>

          <SectionTitle>V. Evaluation & Satisfaction</SectionTitle>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">{report.evalSummary}</p>
          <table className="w-full text-xs mb-6 border-collapse">
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
          </table>

          <SectionTitle>VI. Key Insights</SectionTitle>
          <ul className="text-xs text-gray-600 mb-6 space-y-2 leading-relaxed list-disc list-inside">
            {report.insights.map((insight, i) => (
            <li key={i}>{insight}</li>
            ))}
          </ul>

          <SectionTitle>VII. Certifications</SectionTitle>
          <div className="grid grid-cols-3 gap-5 mt-4">
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
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-bold text-primary uppercase tracking-wide mb-3 mt-2">{children}</div>
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <div className="text-[10px] uppercase text-gray-400">{label}</div>
      <div className="text-lg font-bold text-gray-900 mt-1">{value}</div>
    </div>
  )
}
function InsightMetric({ icon, label, value, comparison }: { icon: React.ReactNode; label: string; value: string | number; comparison?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}<span>{label}</span></div>
      <div className="mt-1 text-xl font-bold text-gray-900">{value}</div>
      {comparison && <div className="mt-1 text-[11px] text-gray-500">{comparison}</div>}
    </div>
  )
}
function SentimentCount({ label, count, color }: { label: string; count: number; color: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{label}: {count}</span>
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
            <div key={it.label} className="flex justify-between text-xs">
              <span className="text-gray-600">{it.label}</span>
              <span className="font-semibold text-gray-900">{it.count}</span>
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
