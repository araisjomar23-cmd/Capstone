import { useMemo, useState } from 'react'
import { Users, CheckCircle2, Pin, BarChart3, Star } from 'lucide-react'
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
import type { Activity } from '../../types/activity'
import { usePageTitle } from '../../hooks/usePageTitle'

const CHART_COLORS = [
  'var(--color-primary)',
  'var(--color-teal)',
  'var(--color-info)',
  'var(--color-accent)',
  'var(--color-warning, #f59e0b)',
  'var(--color-danger, #ef4444)',
]

function activityYear(a: Activity): number | null {
  const raw = a.startDate || a.date
  if (!raw) return null
  const year = new Date(raw).getFullYear()
  return Number.isNaN(year) ? null : year
}

function AdminDashboard() {
  usePageTitle('PRIME Admin')
  const { showToast } = useToast()
  const { data, loading, error, refresh } = useDashboardData()
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all')

  const availableYears = useMemo(() => {
    if (!data) return []
    const years = new Set<number>()
    data.acts.forEach((a) => {
      const y = activityYear(a)
      if (y) years.add(y)
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [data])

  const filteredActivityRegistrations = useMemo(() => {
    if (!data) return []
    const filtered = data.acts.filter((a) => {
      if (selectedYear === 'all') return true
      return activityYear(a) === selectedYear
    })
    return filtered
      .map((a) => ({
        name: a.title,
        registrations: data.liveCount[a.id] || 0,
        slots: a.slots,
      }))
      .sort((a, b) => b.registrations - a.registrations)
      .slice(0, 8)
  }, [data, selectedYear])

  if (loading) {
    return (
      <div className="p-8">
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

  if (error) {
    return (
      <div className="p-8">
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
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-1">Admin Dashboard</h1>
      <p className="text-sm text-gray-400 mb-6">Live overview of MEAL system activity</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Users size={40} />}
          barColor="var(--color-primary)"
          label="Total Registrations"
          value={data.totalReg}
          sub={`↑ ${data.thisWeek} this week`}
        />
        <StatCard
          icon={<CheckCircle2 size={40} />}
          barColor="var(--color-teal)"
          label="Total Attendance"
          value={data.totalAtt}
          sub={`↑ ${data.attRate}% attendance rate`}
        />
        <StatCard
          icon={<Pin size={40} />}
          barColor="var(--color-info)"
          label="Active Activities"
          value={data.activeActs}
          sub={`${data.upcomingActs} upcoming · ↑ ${data.acts.length} total`}
        />
        <StatCard
          icon={<BarChart3 size={40} />}
          barColor="var(--color-accent)"
          label="Fill Rate"
          value={`${data.fillRate}%`}
          sub={`${data.totalReg} of ${data.totalSlots} slots used`}
          trend={data.remaining > 0 ? `↓ ${data.remaining}% slots remaining` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <RegistrationStatusChart data={data.statusBreakdown} />
        <ActivityRegistrationsChart
          data={filteredActivityRegistrations}
          headerRight={
            <select
              value={selectedYear}
              onChange={(e) =>
                setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white
                focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <AttendanceTrendChart data={data.attendanceTrend} />
        <BudgetOverviewChart data={data.budgetOverview} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <RecentEvaluationsFeed stats={data.evaluationStats} rows={data.recentEvaluations} />
      </div>
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
    <div className="stat-card p-4">
      <h2 className="text-sm font-semibold text-gray-600 mb-2">Attendees by Sectoral Group</h2>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center">No registration data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function ActivityRegistrationsChart({
  data,
  headerRight,
}: {
  data: { name: string; registrations: number; slots: number }[]
  headerRight?: React.ReactNode
}) {
  const isEmpty = data.length === 0

  return (
    <div className="stat-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-600">Registrations by Activity</h2>
        {headerRight}
      </div>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center">No activities for this year.</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 70 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={80}
              tickFormatter={(name: any) => (String(name).length > 18 ? `${String(name).slice(0, 18)}…` : String(name))}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend verticalAlign="top" height={28} />
            <Bar dataKey="registrations" name="Registrations" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="slots" name="Total Slots" fill="var(--color-info)" radius={[4, 4, 0, 0]} fillOpacity={0.35} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function BudgetOverviewChart({
  data,
}: {
  data: { name: string; allocated: number; spent: number }[]
}) {
  const isEmpty = data.length === 0

  return (
    <div className="stat-card p-4">
      <h2 className="text-sm font-semibold text-gray-600 mb-2">Budget: Allocated vs Spent</h2>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center">No budget data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 70 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={80}
              tickFormatter={(name: any) => (String(name).length > 18 ? `${String(name).slice(0, 18)}…` : String(name))}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12 }}
              tickFormatter={(v: any) => `₱${Number(v).toLocaleString()}`}
            />
            <Tooltip formatter={(v: any) => `₱${Number(v).toLocaleString()}`} />
            <Legend verticalAlign="top" height={28} />
            <Bar dataKey="allocated" name="Allocated" fill="var(--color-info)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
            <Bar dataKey="spent" name="Spent" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function AttendanceTrendChart({ data }: { data: { date: string; registrations: number; attendance: number }[] }) {
  const isEmpty = data.every((d) => d.registrations === 0 && d.attendance === 0)

  return (
    <div className="stat-card p-4">
      <h2 className="text-sm font-semibold text-gray-600 mb-2">Registrations vs Attendance (Last 14 Days)</h2>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center">No activity in the last 14 days.</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
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
  stats,
  rows,
}: {
  stats: { totalResponses: number; averageRating: number; recommendRate: number }
  rows: { id: string; rating: number; feedback: string; submittedAt: string; participantName: string; activityTitle: string }[]
}) {
  const isEmpty = rows.length === 0

  return (
    <div className="stat-card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-600">Recent Evaluations</h2>
        {stats.totalResponses > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Star size={14} className="fill-yellow-400 text-yellow-400" />
              {stats.averageRating.toFixed(1)} avg · {stats.totalResponses} responses
            </span>
            <span>{stats.recommendRate}% would recommend</span>
          </div>
        )}
      </div>
      {isEmpty ? (
        <p className="text-sm text-gray-400 py-12 text-center">No evaluations submitted yet.</p>
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
  trend,
}: {
  icon: React.ReactNode
  barColor: string
  label: string
  value: string | number
  sub: string
  trend?: string
}) {
  return (
    <div className="stat-card">
      <div className="stat-accent-bar" style={{ background: barColor }} />
      <div className="stat-icon-watermark" style={{ color: barColor }}>
        {icon}
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
      {trend && <div className="text-xs text-orange-500 font-semibold mt-1">{trend}</div>}
    </div>
  )
}

export default AdminDashboard