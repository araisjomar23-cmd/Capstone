import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardControlPanel from '../../features/dashboard/DashboardControlPanel'
import { AttendanceTrendChart, ActivityRegistrationsChart, BudgetOverviewChart } from '../../features/dashboard/DashboardCharts'
import FiscalYearFilter from '../../features/dashboard/FiscalYearFilter'
import { fiscalYearLabel, type FiscalPeriod } from '../../lib/fiscalYear'
import { currentMonthPeriod } from '../../lib/activityDatePeriod'
import { Users, CheckCircle2, Star, CircleDollarSign } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts'
import { useDashboardData } from '../../features/dashboard/useDashboardData'
import { useToast } from '../../components/ToastProvider'
import { SkeletonStatCard } from '../../components/Skeleton'
import { usePageTitle } from '../../hooks/usePageTitle'

const CHART_COLORS = [
  '#f56800',
  '#ffcc00',
  '#df009b',
  '#555555',
  '#999999',
  '#0756a0',
]

function SectorPercentLabel({ cx, cy, midAngle = 0, outerRadius = 0, percent = 0, index }: PieLabelRenderProps) {
  if (percent < 0.04) return null
  const radius = Number(outerRadius) * 0.62
  const radians = -midAngle * Math.PI / 180
  return (
    <text x={Number(cx) + radius * Math.cos(radians)} y={Number(cy) + radius * Math.sin(radians)}
      fill={index % CHART_COLORS.length === 1 ? '#654800' : '#fff'} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} pointerEvents="none">
      {Math.round(percent * 100)}%
    </text>
  )
}

function AdminDashboard() {
  usePageTitle('PRIME Admin')
  const { showToast } = useToast()
  const [period, setPeriod] = useState<FiscalPeriod>(() => {
    const current = currentMonthPeriod()
    return { startMonth: 1, year: Number(current.year), month: Number(current.month) }
  })
  const { data, activities, loading, error, refresh } = useDashboardData(period)
  function changePeriod(next: FiscalPeriod) {
    setPeriod({ ...next, startMonth: 1 })
  }
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  if (loading && !data) {
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

  if (error && !data) {
    return (
      <div className="w-full min-w-0 max-w-[1440px] mx-auto p-4 md:p-6 xl:p-8">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => {
            refresh()
            showToast('Refreshing dashboard…', 'info')
          }}
          className="btn-primary mt-2">
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="w-full min-w-0 max-w-[1440px] mx-auto p-4 md:p-6 xl:p-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700 mb-2">MEAL control panel</p>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-2">Monitor participation, activities, budgets, and feedback in one place.</p>
        </div>
      </header>
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} Showing the last loaded data. <button type="button" onClick={() => void refresh()} className="underline font-semibold">Retry</button></div>}
      <FiscalYearFilter value={period} onChange={changePeriod} activities={activities} today={new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} />
      <h2 className="text-sm font-semibold text-gray-800 mb-3">Overall performance <span className="font-normal text-gray-500">/ {period.year === 'all' ? 'All fiscal years' : fiscalYearLabel(period.year, period.startMonth)}</span></h2>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <StatCard icon={<Users size={32} />} barColor="var(--color-primary)" label="Registrations" value={data.totalReg} sub={data.thisWeek + ' added this week'} />
        <StatCard icon={<CheckCircle2 size={32} />} barColor="var(--color-teal)" label="Attendance" value={data.totalAtt} sub={data.attRate + '% of active registrations'} />
        <StatCard icon={<CircleDollarSign size={32} />} barColor="var(--color-info)" label="Budget remaining" value={'PHP ' + (data.totalBudgetAllocated - data.totalBudgetSpent).toLocaleString()} sub={data.totalBudgetSpent > data.totalBudgetAllocated ? 'Spending exceeds the allocation' : 'Selected fiscal-year activities'} />
        <StatCard icon={<Star size={32} />} barColor="var(--color-accent)" label="Satisfaction" value={data.evaluationStats.totalResponses ? data.evaluationStats.averageRating.toFixed(1) + ' / 5' : '--'} sub={data.evaluationStats.totalResponses + ' evaluation responses'} />
      </div>

      <DashboardControlPanel data={data} now={now} />

      <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch gap-4 mb-4">
          <AttendanceTrendChart data={data.attendanceTrend} />
          <RegistrationStatusChart data={data.statusBreakdown} />
          <ActivityRegistrationsChart
            data={data.activityRegistrations}
          />
          <BudgetOverviewChart data={data.budgetOverview} allocated={data.totalBudgetAllocated} spent={data.totalBudgetSpent} />
      </div>
      <RecentEvaluationsFeed rows={data.recentEvaluations} />
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
    <div className="stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <h2 className="text-sm font-semibold text-gray-600 mb-2">Attendees by Sectoral Group</h2>
      {isEmpty ? (
        <p className="text-sm text-gray-500 py-12 text-center flex-1 flex items-center justify-center min-h-64">No attendees yet in the selected period. Sectoral groups appear after participants check in.</p>
      ) : (
        <div className="flex-1 flex flex-col min-[480px]:flex-row items-center justify-center gap-4 py-4">
          <div className="w-full min-[480px]:w-[55%] min-w-0" role="img" aria-label={`Sectoral group distribution across ${total} attendees. Slice labels show each group's percentage of the total.`}>
          <ResponsiveContainer width="100%" height={250}>
          <PieChart accessibilityLayer>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={0}
              outerRadius="88%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
              stroke="#943e9e"
              strokeWidth={1}
              label={SectorPercentLabel}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => {
              const count = Number(value)
              return `${count.toLocaleString()} ${count === 1 ? 'attendee' : 'attendees'} (${Math.round(count / total * 100)}%)`
            }} contentStyle={{ borderRadius: 12, borderColor: '#dce5ef', fontSize: 12 }} />
          </PieChart>
          </ResponsiveContainer>
          </div>
          <ul className="w-full min-[480px]:flex-1 min-w-0 space-y-3" aria-label="Sectoral group legend">
            {data.map((entry, index) => (
              <li key={entry.status} className="flex items-start gap-2.5 text-xs">
                <span className="w-6 h-3.5 shrink-0 rounded-sm border border-[#943e9e] mt-0.5" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} aria-hidden="true" />
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

function StatCard({
  icon,
  barColor,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  barColor: string
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="stat-card min-w-0 !p-4">
      <div className="stat-accent-bar" style={{ background: barColor }} />
      <div className="stat-icon-watermark" style={{ color: barColor }}>
        {icon}
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value break-words !text-2xl xl:!text-3xl">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

export default AdminDashboard
