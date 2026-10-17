import { useState } from 'react'
import { generateReport } from '../../features/reports/reportService'
import type { ReportData } from '../../features/reports/reportService'
import { FileText, Printer } from 'lucide-react'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function monthAgoISO() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
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
  const [loading, setLoading] = useState(false)

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
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Date To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
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