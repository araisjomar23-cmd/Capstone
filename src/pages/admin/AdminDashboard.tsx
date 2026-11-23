import { useEffect, useRef, useState } from 'react'
import DashboardControlPanel from '../../features/dashboard/DashboardControlPanel'
import DashboardMetricCard from '../../features/dashboard/DashboardMetricCard'
import DashboardComparisons from '../../features/dashboard/DashboardComparisons'
import type { DashboardData } from '../../features/dashboard/useDashboardData'
import type { Activity } from '../../types/activity'
import { ParticipationAreaChart } from '../../features/dashboard/DashboardCharts'
import FiscalYearFilter from '../../features/dashboard/FiscalYearFilter'
import { fiscalPeriodRange, type FiscalPeriod } from '../../lib/fiscalYear'
import { currentMonthPeriod } from '../../lib/activityDatePeriod'
import { Users, CheckCircle2, Star, CircleDollarSign, ChevronLeft, ChevronRight } from 'lucide-react'
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
        <FiscalYearFilter compact value={period} onChange={changePeriod} activities={activities} today={new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })} />
      </header>
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} Showing the last loaded data. <button type="button" onClick={() => void refresh()} className="underline font-semibold">Retry</button></div>}
      <h2 className="sr-only">Overall performance</h2>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <DashboardMetricCard icon={<Users size={22} aria-hidden="true" />} color="#0756a0" label="Registrations" value={count(data.totalReg)} caption={`${count(data.thisWeek)} added in the last 7 days`} meter={{ value: data.totalReg, total: data.totalSlots, label: 'Capacity filled' }}
          details={[{ label: 'Registrations', value: count(data.totalReg) }, { label: 'Available capacity', value: count(data.totalSlots) }, { label: 'Added in last 7 days', value: count(data.thisWeek) }]} note="Counts activity registrations in this period. One youth may join multiple activities; inactive registrations are excluded." to="/admin/participants" linkLabel="View participants" />
        <DashboardMetricCard icon={<CheckCircle2 size={22} aria-hidden="true" />} color="#008b80" label="Attendance" value={count(data.totalAtt)} caption="Registrations with recorded attendance" meter={{ value: data.totalAtt, total: data.totalReg, label: 'Attendance rate' }}
          details={[{ label: 'Attended / completed', value: count(data.totalAtt) }, { label: 'Active registrations', value: count(data.totalReg) }, { label: 'Without recorded attendance', value: count(Math.max(0, data.totalReg - data.totalAtt)) }]} note="Based on attended or completed registration status. Daily check-ins are shown separately in the trend chart." to="/admin/attendance" linkLabel="View attendance" />
        <DashboardMetricCard icon={<CircleDollarSign size={22} aria-hidden="true" />} color={remaining < 0 ? '#b90813' : '#0756a0'} label="Budget remaining" value={compactRemaining} caption={remaining < 0 ? 'Spending exceeds the recorded allocation' : 'Available across the selected activities'} meter={{ value: data.totalBudgetSpent, total: data.totalBudgetAllocated, label: 'Budget used' }}
          details={[{ label: 'Allocated', value: money(data.totalBudgetAllocated) }, { label: 'Spent', value: money(data.totalBudgetSpent) }, { label: 'Remaining', value: money(remaining) }]} note="Remaining = allocation minus recorded expenses. K = thousand; M = million. Exact amounts are listed above. Utilization is unavailable without an allocation." to="/admin/budget" linkLabel="View budget" />
        <DashboardMetricCard icon={<Star size={22} aria-hidden="true" />} color="#a16207" label="Satisfaction" value={responses ? `${data.evaluationStats.averageRating.toFixed(1)} / 5` : '—'} caption={`${count(responses)} evaluation ${responses === 1 ? 'response' : 'responses'}`}
          details={[{ label: 'Evaluation responses', value: count(responses) }, { label: 'Average rating', value: responses ? `${data.evaluationStats.averageRating.toFixed(1)} / 5` : 'No responses' }, { label: 'Would recommend', value: responses ? `${data.evaluationStats.recommendRate ?? 0}%` : 'No responses' }]} note="Calculated from submitted numerical ratings. Written-comment sentiment is analyzed separately." to="/admin/evaluations" linkLabel="View evaluations" />
      </div>

      <section aria-labelledby="dashboard-charts-title" className="mb-6 min-w-0">
        <h2 id="dashboard-charts-title" className="sr-only">Performance charts</h2>
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(16rem,1fr)]">
          <ParticipationAreaChart data={data.attendanceTrend} />
          <RegistrationStatusChart data={data.statusBreakdown} ages={data.ageBreakdown} />
        </div>
        <DashboardComparisons data={data} />
      </section>
      <DashboardControlPanel data={data} now={now} />
    </div>
  )
}

export function RegistrationStatusChart({
  data: sectors, ages = [],
}: {
  data: { status: string; label: string; value: number }[]
  ages?: { status: string; label: string; value: number }[]
}) {
  const [slide, setSlide] = useState(0)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = card.current
    if (!element) return
    let accumulated = 0
    let lastSwitch = -Infinity
    const reset = () => { accumulated = 0 }
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      event.preventDefault()
      const time = performance.now()
      if (time - lastSwitch < 650) return
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      accumulated = Math.sign(delta) === Math.sign(accumulated) ? accumulated + delta : delta
      if (Math.abs(accumulated) < 40) return
      setSlide(current => current === 0 ? 1 : 0)
      lastSwitch = time
      accumulated = 0
    }
    element.addEventListener('wheel', wheel, { passive: false })
    element.addEventListener('pointerleave', reset)
    return () => { element.removeEventListener('wheel', wheel); element.removeEventListener('pointerleave', reset) }
  }, [])
  const isAge = slide === 1
  const data = isAge ? ages : sectors
  const excluded = sectors.reduce((sum, row) => sum + row.value, 0) - ages.reduce((sum, row) => sum + row.value, 0)
  const isEmpty = data.length === 0 || data.every((d) => d.value === 0)
  const total = data.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div ref={card} role="region" aria-label="Attendee demographics" aria-roledescription="carousel" className="group/demographics dashboard-chart stat-card min-w-0 !p-4 sm:!p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div aria-live="polite" aria-atomic="true"><div key={slide} className="demographics-slide-title"><h2 className="text-sm font-bold text-slate-800 mb-1">{isAge ? 'Attendees by Age' : 'Attendees by Sectoral Group'}</h2><p className="text-xs text-slate-500">{isAge ? 'Three youth age brackets · Ages 15–30' : 'Share of recorded attendees'}</p></div></div>
        <div className="flex shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/demographics:opacity-100 sm:group-focus-within/demographics:opacity-100">
          <button type="button" aria-label="Previous demographics chart" onClick={() => setSlide(current => current === 0 ? 1 : 0)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronLeft size={16} aria-hidden="true" /></button>
          <button type="button" aria-label="Next demographics chart" onClick={() => setSlide(current => current === 0 ? 1 : 0)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div key={slide} className="demographics-slide flex min-h-80 flex-1 flex-col" data-view={isAge ? 'age' : 'sector'}>
      {isEmpty ? (
        <p className="text-sm text-gray-500 py-12 text-center flex-1 flex items-center justify-center min-h-64">{isAge ? 'No recorded attendees aged 15–30 in the selected period.' : 'No attendees yet in the selected period. Sectoral groups appear after participants check in.'}</p>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3">
          <div className="w-full max-w-56 min-w-0" role="img" aria-label={`${isAge ? 'Age bracket' : 'Sectoral group'} distribution across ${total} attendees. Slice labels show each group's percentage of the total.`}>
          <ResponsiveContainer width="100%" height={200}>
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
          <ul className="grid w-full min-w-0 grid-cols-1 gap-1 min-[420px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-label={isAge ? 'Age bracket legend' : 'Sectoral group legend'}>
            {data.map((entry, index) => (
              <li key={entry.status} className="flex items-start gap-2.5 rounded-lg p-2 text-xs transition-colors hover:bg-slate-50">
                <span className="size-2.5 shrink-0 rounded-full mt-1" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} aria-hidden="true" />
                <div className="min-w-0"><p className="font-medium text-gray-700 break-words">{entry.label}</p><p className="text-gray-500 mt-0.5">{entry.value.toLocaleString()} · {Math.round(entry.value / total * 100)}%</p></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isAge && excluded > 0 && <p className="mt-2 text-[11px] text-slate-500">{excluded} {excluded === 1 ? 'attendee has an unknown age or is' : 'attendees have an unknown age or are'} outside ages 15–30. Percentages cover the three brackets only.</p>}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-[10px] text-slate-400">Hover & scroll to switch views</p>
        <div className="flex gap-1" aria-label="Demographics views">{['Sectoral groups', 'Age brackets'].map((label, index) => <button key={label} type="button" aria-label={`Show ${label.toLowerCase()}`} aria-pressed={slide === index} onClick={() => setSlide(index)} className="grid size-8 place-items-center rounded-md hover:bg-slate-50"><span aria-hidden="true" className={`h-1.5 rounded-full transition-all ${slide === index ? 'w-5 bg-primary' : 'w-1.5 bg-slate-300'}`} /></button>)}</div>
      </div>
    </div>
  )
}


export default AdminDashboard
