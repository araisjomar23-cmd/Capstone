import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardControlPanel from '../../features/dashboard/DashboardControlPanel'
import FiscalYearFilter from '../../features/dashboard/FiscalYearFilter'
import { fiscalYearFor, fiscalYearLabel, type FiscalPeriod } from '../../lib/fiscalYear'
import { Users, CheckCircle2, Star, CircleDollarSign } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useDashboardData } from '../../features/dashboard/useDashboardData'
import { useToast } from '../../components/ToastProvider'
import { SkeletonStatCard } from '../../components/Skeleton'
import { usePageTitle } from '../../hooks/usePageTitle'

const CHART_COLORS = [
  'var(--color-primary)',
  'var(--color-teal)',
  'var(--color-info)',
  'var(--color-accent)',
  'var(--color-warning, #f59e0b)',
  'var(--color-danger, #ef4444)',
]

function AdminDashboard() {
  usePageTitle('PRIME Admin')
  const { showToast } = useToast()
  const [period, setPeriod] = useState<FiscalPeriod>(() => {
    return { startMonth: 1, year: fiscalYearFor(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), 1) ?? new Date().getFullYear() }
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
          <ActivityRegistrationsChart
            data={data.activityRegistrations}
          />
          <RegistrationStatusChart data={data.statusBreakdown} />
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

  return (
    <div className="stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <h2 className="text-sm font-semibold text-gray-600 mb-2">Attendees by Sectoral Group</h2>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center flex-1 flex items-center justify-center min-h-48">No registration data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function ActivityRegistrationsChart({
  data,
}: {
  data: { name: string; registrations: number; slots: number }[]
}) {
  const isEmpty = data.length === 0

  return (
    <div className="stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-600">Registrations by Activity</h2>

      </div>
      <p className="text-xs text-gray-500 mb-3">Top 8 activities by registrations in the selected period.</p>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center flex-1 flex items-center justify-center min-h-48">No activities for this period. Try another fiscal year.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={78}
              tickFormatter={(name: any) => (String(name).length > 16 ? `${String(name).slice(0, 16)}…` : String(name))}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend verticalAlign="top" height={28} />
            <Bar maxBarSize={32} dataKey="registrations" name="Registrations" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            <Bar maxBarSize={32} dataKey="slots" name="Total Slots" fill="var(--color-info)" radius={[4, 4, 0, 0]} fillOpacity={0.35} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function BudgetOverviewChart({
  data, allocated, spent,
}: {
  data: { name: string; allocated: number; spent: number }[]
  allocated: number
  spent: number
}) {
  const isEmpty = data.length === 0

  return (
    <div className="stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <h2 className="text-sm font-semibold text-gray-600 mb-2">Budget: Allocated vs Spent</h2>
      <p className="text-xs text-gray-500 mb-3">Allocated: PHP {allocated.toLocaleString()} <span className="mx-1">/</span> Spent: PHP {spent.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mb-3">Chart shows up to 8 activities with the largest allocations; totals include all selected activities.</p>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center flex-1 flex items-center justify-center min-h-48">No budget data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={78}
              tickFormatter={(name: any) => (String(name).length > 16 ? `${String(name).slice(0, 16)}…` : String(name))}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12 }}
              width={76}
              tickFormatter={(v: any) => `₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))}`}
            />
            <Tooltip formatter={(v: any) => `₱${Number(v).toLocaleString()}`} />
            <Legend verticalAlign="top" height={28} />
            <Bar maxBarSize={32} dataKey="allocated" name="Allocated" fill="var(--color-info)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
            <Bar maxBarSize={32} dataKey="spent" name="Spent" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function AttendanceTrendChart({ data }: { data: { date: string; registrations: number; attendance: number }[] }) {
  const isEmpty = data.every((d) => d.registrations === 0 && d.attendance === 0)

  return (
    <div className="stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <h2 className="text-sm font-semibold text-gray-600 mb-2">Registrations vs Attendance (Last 14 Days)</h2>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center flex-1 flex items-center justify-center min-h-48">No activity in the last 14 days.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(d: any) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              labelFormatter={(d: any) =>
                new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              }
            />
            <Legend verticalAlign="top" height={28} />
            <Line type="monotone" dataKey="registrations" name="Registrations" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="attendance" name="Attendance" stroke="var(--color-teal)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
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
