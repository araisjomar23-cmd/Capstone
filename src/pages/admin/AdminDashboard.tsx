import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardControlPanel from '../../features/dashboard/DashboardControlPanel'
import ProgramOverview from '../../features/dashboard/ProgramOverview'
import DashboardMetricCard from '../../features/dashboard/DashboardMetricCard'
import DashboardComparisons from '../../features/dashboard/DashboardComparisons'
import type { DashboardData } from '../../features/dashboard/useDashboardData'
import type { Activity } from '../../types/activity'
import { ParticipationAreaChart, BudgetUsageChart } from '../../features/dashboard/DashboardCharts'
import FiscalYearFilter from '../../features/dashboard/FiscalYearFilter'
import { fiscalPeriodRange, type FiscalPeriod } from '../../lib/fiscalYear'
import { currentMonthPeriod } from '../../lib/activityDatePeriod'
import { Users, CheckCircle2, Star, CircleDollarSign, ArrowUpRight, ChevronDown } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts'
import { useDashboardData } from '../../features/dashboard/useDashboardData'
import { SkeletonStatCard } from '../../components/Skeleton'
import { usePageTitle } from '../../hooks/usePageTitle'

const CHART_COLORS = ['#0756a0', '#008b80', '#9bd3eb', '#f4c678', '#94a3b8', '#d8e2ee']

function SectorPercentLabel({ cx, cy, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0, index }: PieLabelRenderProps) {
  if (percent < 0.08) return null
  const radius = (Number(innerRadius) + Number(outerRadius)) / 2
  const radians = -midAngle * Math.PI / 180
  return (
    <text x={Number(cx) + radius * Math.cos(radians)} y={Number(cy) + radius * Math.sin(radians)}
      fill={index % CHART_COLORS.length <= 1 ? '#fff' : '#334155'} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} pointerEvents="none">
      {Math.round(percent * 100)}%
    </text>
  )
}

function AdminDashboard() {
  usePageTitle('PRIME Admin')
  const [period, setPeriod] = useState<FiscalPeriod>(() => {
    const current = currentMonthPeriod()
    return { startMonth: 1, year: Number(current.year), month: Number(current.month) }
  })
  const { data, activities, error, refresh, connection } = useDashboardData(period)
  function changePeriod(next: FiscalPeriod) {
    setPeriod({ ...next, startMonth: 1 })
  }
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  if (!data && !error && connection !== 'offline') {
    return (
      <div className="w-full min-w-0 max-w-[1440px] mx-auto p-4 md:p-6 xl:p-8">
        <h1 className="text-2xl font-bold text-primary mb-1">Admin Dashboard</h1>
        <p className="text-sm text-gray-400 mb-6">Live overview of MEAL system activity</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
      </div>
    )
  }

  if (!data && (error || connection === 'offline')) {
    return (
      <div className="w-full min-w-0 max-w-[1440px] mx-auto p-4 md:p-6 xl:p-8">
        <h1 className="mb-3 text-2xl font-bold text-primary">Dashboard</h1>
        <p role="alert" className="mb-4 text-sm text-gray-700">{connection === 'offline' ? 'You are offline. Dashboard data will load when your connection returns.' : error}</p>
      </div>
    )
  }

  if (!data) return null

  return <DashboardContent data={data} activities={activities} period={period} changePeriod={changePeriod} now={now} error={error} refresh={() => void refresh()} />
}

export function DashboardContent({ data, activities, period, changePeriod, now, error, refresh }: {
  data: DashboardData; activities: Activity[]; period: FiscalPeriod; changePeriod: (period: FiscalPeriod) => void
  now: number; error?: string | null; refresh: () => void
}) {
  const count = (value: number = 0) => value.toLocaleString('en-PH')
  const money = (value: number) => `PHP ${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
  const remaining = data.totalBudgetAllocated - data.totalBudgetSpent
  const compactRemaining = `PHP ${remaining.toLocaleString('en-PH', { notation: Math.abs(remaining) >= 1000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(remaining) >= 1000 ? 1 : 2 })}`
  const responses = data.evaluationStats.totalResponses
  return (
    <div className="dashboard-workspace w-full min-w-0 max-w-[1440px] mx-auto p-4 md:p-6 xl:p-8">
      <header className="mb-5 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 xl:flex-row xl:items-end">
        <div><p className="mb-1 text-[11px] font-semibold text-slate-500">Administration / Overview</p><h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1><p className="mt-1 text-xs text-slate-500">{fiscalPeriodRange(period)} · {data.acts?.length ?? 0} activities</p></div>
        <div className="flex flex-wrap items-end gap-3"><FiscalYearFilter compact value={period} onChange={changePeriod} activities={activities} today={new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} /><Link to="/admin/reports" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-primary">View reports<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      </header>
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} Showing the last loaded data. <button type="button" onClick={() => void refresh()} className="underline font-semibold">Retry</button></div>}
      <h2 className="sr-only">Overall performance</h2>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <DashboardMetricCard icon={<Users size={22} aria-hidden="true" />} color="#0756a0" label="Registrations" value={count(data.totalReg)} caption={`${count(data.thisWeek)} added in the last 7 days`} meter={{ value: data.totalReg, total: data.totalSlots, label: 'Capacity filled' }}
          details={[{ label: 'Registrations', value: count(data.totalReg) }, { label: 'Available capacity', value: count(data.totalSlots) }, { label: 'Added in last 7 days', value: count(data.thisWeek) }]} note="Counts activity registrations in this period. One youth may join multiple activities; inactive registrations are excluded." to="/admin/participants" linkLabel="View participants" />
        <DashboardMetricCard icon={<CheckCircle2 size={22} aria-hidden="true" />} color="#0756a0" label="Attendance" value={count(data.totalAtt)} caption={`${data.attRate}% of active registrations attended`} meter={{ value: data.totalAtt, total: data.totalReg, label: 'Attendance rate' }}
          details={[{ label: 'Attended / completed', value: count(data.totalAtt) }, { label: 'Active registrations', value: count(data.totalReg) }, { label: 'Without recorded attendance', value: count(Math.max(0, data.totalReg - data.totalAtt)) }]} note="Based on attended or completed registration status. Daily check-ins are shown separately in the trend chart." to="/admin/attendance" linkLabel="View attendance" />
        <DashboardMetricCard icon={<CircleDollarSign size={22} aria-hidden="true" />} color={remaining < 0 ? '#b90813' : '#0756a0'} label="Budget remaining" value={compactRemaining} caption={remaining < 0 ? 'Spending exceeds the recorded allocation' : 'Available across the selected activities'} meter={{ value: data.totalBudgetSpent, total: data.totalBudgetAllocated, label: 'Budget used' }}
          details={[{ label: 'Allocated', value: money(data.totalBudgetAllocated) }, { label: 'Spent', value: money(data.totalBudgetSpent) }, { label: 'Remaining', value: money(remaining) }]} note="Remaining = allocation minus recorded expenses. K = thousand; M = million. Exact amounts are listed above. Utilization is unavailable without an allocation." to="/admin/budget" linkLabel="View budget" />
        <DashboardMetricCard icon={<Star size={22} aria-hidden="true" />} color="#0756a0" label="Satisfaction" value={responses ? `${data.evaluationStats.averageRating.toFixed(1)} / 5` : '—'} caption={`${count(responses)} evaluation ${responses === 1 ? 'response' : 'responses'}`} meter={responses ? { value: data.evaluationStats.averageRating, total: 5, label: 'Rating scale' } : undefined}
          details={[{ label: 'Evaluation responses', value: count(responses) }, { label: 'Average rating', value: responses ? `${data.evaluationStats.averageRating.toFixed(1)} / 5` : 'No responses' }, { label: 'Would recommend', value: responses ? `${data.evaluationStats.recommendRate ?? 0}%` : 'No responses' }]} note="Calculated from submitted numerical ratings. Written-comment sentiment is analyzed separately." to="/admin/evaluations" linkLabel="View evaluations" />
      </div>

      <section aria-labelledby="dashboard-charts-title" className="mb-6 min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="dashboard-charts-title" className="text-sm font-bold text-slate-800">Performance charts</h2><p className="text-[11px] text-slate-500">Hover a graph for exact values</p></div>
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,1fr)]">
          <ParticipationAreaChart data={data.attendanceTrend} />
          <BudgetUsageChart allocated={data.totalBudgetAllocated} spent={data.totalBudgetSpent} />
        </div>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,1fr)]">
          <DashboardComparisons data={data} />
          <RegistrationStatusChart data={data.statusBreakdown} />
        </div>
      </section>
      <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">Activity & program details<ChevronDown size={17} aria-hidden="true" className="transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-slate-100 p-4"><DashboardControlPanel data={data} now={now} /><ProgramOverview rows={data.programSummaries} /><RecentEvaluationsFeed rows={data.recentEvaluations} /></div>
      </details>
    </div>
  )
}

function RegistrationStatusChart({
  data,
}: {
  data: { status: string; label: string; value: number }[]
}) {
  const isEmpty = data.length === 0 || data.every((d) => d.value === 0)
  const total = data.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div className="dashboard-chart stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <h2 className="text-sm font-bold text-slate-800 mb-1">Attendees by Sectoral Group</h2>
      <p className="text-xs text-slate-500">Who your activities are reaching · Share of recorded attendees.</p>
      {isEmpty ? (
        <p className="text-sm text-gray-500 py-12 text-center flex-1 flex items-center justify-center min-h-64">No attendees yet in the selected period. Sectoral groups appear after participants check in.</p>
      ) : (
        <div className="flex-1 flex flex-col min-[480px]:flex-row items-center justify-center gap-4 py-4">
          <div className="w-full min-[480px]:w-[55%] min-w-0" role="img" aria-label={`Sectoral group distribution across ${total} attendees. Slice labels show each group's percentage of the total.`}>
          <ResponsiveContainer width="100%" height={250}>
          <PieChart accessibilityLayer>
            <Pie
              isAnimationActive={false}
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="88%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
              stroke="#fff"
              strokeWidth={3}
              label={SectorPercentLabel}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fill="#172b42" fontSize={28} fontWeight={800}>{total.toLocaleString('en-PH')}</text>
            <text x="50%" y="57%" textAnchor="middle" fill="#63758a" fontSize={11}>attendees</text>
            <Tooltip formatter={(value) => {
              const count = Number(value)
              return `${count.toLocaleString()} ${count === 1 ? 'attendee' : 'attendees'} (${Math.round(count / total * 100)}%)`
            }} contentStyle={{ borderRadius: 12, borderColor: '#dce5ef', fontSize: 12 }} />
          </PieChart>
          </ResponsiveContainer>
          </div>
          <ul className="w-full min-[480px]:flex-1 min-w-0 space-y-3" aria-label="Sectoral group legend">
            {data.map((entry, index) => (
              <li key={entry.status} className="flex items-start gap-2.5 rounded-lg p-2 text-xs transition-colors hover:bg-slate-50">
                <span className="size-2.5 shrink-0 rounded-full mt-1" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} aria-hidden="true" />
                <div className="min-w-0"><p className="font-medium text-gray-700 break-words">{entry.label}</p><p className="text-gray-500 mt-0.5">{entry.value.toLocaleString()} · {Math.round(entry.value / total * 100)}%</p></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isEmpty && <p className="text-xs text-gray-500 mt-2">Each slice shows its share of total attendees (100%). Hover a slice for attendee counts and percentages.</p>}
    </div>
  )
}

function RecentEvaluationsFeed({
  rows,
}: {
  rows: { id: string; rating: number; feedback: string; submittedAt: string; participantName: string; activityTitle: string }[]
}) {
  const isEmpty = rows.length === 0

  return (
    <div className="stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-600">Recent Evaluations</h2>
        <Link to="/admin/evaluations" className="text-xs font-semibold text-primary min-h-11 inline-flex items-center">View all evaluations</Link>
      </div>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center flex-1 flex items-center justify-center min-h-48">No evaluations submitted yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{r.participantName}</p>
                <p className="text-xs text-gray-400 truncate">{r.activityTitle}</p>
                {r.feedback && <p className="text-xs text-gray-500 mt-1 truncate">{r.feedback}</p>}
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="flex items-center gap-0.5 justify-end">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={12}
                      className={i < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {new Date(r.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AdminDashboard
