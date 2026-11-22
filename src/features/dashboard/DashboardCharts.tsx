import { useId } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const number = new Intl.NumberFormat('en-PH')
const currency = (value: number) => `PHP ${number.format(value)}`
const percent = (value: number, total: number) => total > 0 ? Math.round(value / total * 100) : null
const dateLabel = (date: string, year = false) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', {
  month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}),
})
const panelClass = 'dashboard-chart stat-card min-w-0 !p-4 sm:!p-5 flex flex-col'
const compactNumber = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })

export function ParticipationAreaChart({ data = [] }: { data?: { date: string; registrations: number; attendance: number }[] }) {
  const gradient = useId()
  const registrations = data.reduce((sum, row) => sum + row.registrations, 0)
  const attendance = data.reduce((sum, row) => sum + row.attendance, 0)
  const maximum = Math.max(1, ...data.flatMap(row => [row.registrations, row.attendance]))
  return <section className={panelClass} aria-label="Participation overview">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-900">Participation over time</h2><p className="mt-1 text-xs text-slate-500">Last 14 days · Activities in the selected period</p></div><span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-primary">Daily activity</span></div>
    <div className="my-4 flex flex-wrap gap-x-6 gap-y-2"><ChartKey color="bg-primary">{number.format(registrations)} registrations</ChartKey><ChartKey color="bg-teal">{number.format(attendance)} daily check-ins</ChartKey></div>
    <div role="img" aria-label={`${registrations} registrations and ${attendance} daily check-ins across the last 14 days.`}>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart accessibilityLayer data={data} margin={{ top: 12, left: -20, right: 12, bottom: 0 }}>
          <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0756a0" stopOpacity={0.18} /><stop offset="100%" stopColor="#0756a0" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={value => dateLabel(String(value))} minTickGap={28} tick={{ fontSize: 11, fill: '#63758a' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} domain={[0, maximum]} tick={{ fontSize: 11, fill: '#63758a' }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={value => dateLabel(String(value), true)} contentStyle={{ borderRadius: 12, borderColor: '#dce5ef', fontSize: 12 }} />
          <Area isAnimationActive={false} type="linear" dataKey="registrations" name="Registrations" stroke="#0756a0" strokeWidth={2.5} fill={`url(#${gradient})`} dot={false} activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }} />
          <Area isAnimationActive={false} type="linear" dataKey="attendance" name="Daily check-ins" stroke="#008b80" strokeWidth={2.5} fill="transparent" dot={false} activeDot={{ r: 6, strokeWidth: 3, stroke: '#fff' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <p className="mt-3 text-[11px] text-slate-500">{registrations || attendance ? 'Hover a point for its date and exact counts. A registration is counted once per attended day.' : 'No registrations or check-ins in this 14-day window.'}</p>
  </section>
}

export function BudgetUsageChart({ allocated, spent }: { allocated: number; spent: number }) {
  const remaining = allocated - spent
  const utilization = percent(spent, allocated)
  const rows = [{ name: 'Spent within allocation', value: Math.min(spent, allocated) }, { name: 'Unspent allocation', value: Math.max(remaining, 0) }]
  return <section className={panelClass} aria-label="Budget usage overview">
    <h2 className="text-sm font-bold text-slate-900">Budget usage</h2><p className="mt-1 text-xs text-slate-500">Allocation and actual spending</p>
    <div className="relative mx-auto my-2 w-full max-w-56">
      {allocated > 0 ? <ResponsiveContainer width="100%" height={200}><PieChart accessibilityLayer><Pie isAnimationActive={false} data={rows} dataKey="value" nameKey="name" innerRadius="72%" outerRadius="92%" startAngle={90} endAngle={-270} stroke="none">{rows.map((row, i) => <Cell key={row.name} fill={i ? '#e8eef5' : '#0756a0'} />)}</Pie><Tooltip formatter={value => currency(Number(value))} contentStyle={{ borderRadius: 12, fontSize: 12 }} /></PieChart></ResponsiveContainer> : <div className="mx-auto my-3 h-44 w-44 rounded-full border-[18px] border-slate-100" aria-hidden="true" />}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><p className={`text-3xl font-extrabold tracking-tight ${remaining < 0 ? 'text-red-700' : 'text-slate-900'}`}>{utilization === null ? 'N/A' : `${utilization}%`}</p><p className="mt-1 text-xs text-slate-500">{utilization === null ? 'No allocation' : 'of allocation spent'}</p></div>
    </div>
    <dl className="space-y-2 text-xs">{[{ label: 'Allocated', value: allocated }, { label: 'Actual spending', value: spent }, { label: 'Remaining', value: remaining }].map(row => <div key={row.label} className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">{row.label}</dt><dd className={`font-semibold ${row.value < 0 ? 'text-red-700' : 'text-slate-800'}`}>{currency(row.value)}</dd></div>)}</dl>
    {remaining < 0 && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{currency(-remaining)} over allocation</p>}
    <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{spent > allocated && allocated > 0 ? 'The ring is full; actual spending above includes the excess.' : 'Hover the ring for amounts. Totals cover the selected activities.'}</p>
  </section>
}

// Wrap activity names beside the bars instead of rotating or cutting off the axis.
function ActivityAxisTick({ x = 0, y = 0, payload }: { x?: number | string; y?: number | string; payload?: { value?: string } }) {
  const title = String(payload?.value ?? '')
  const lines: string[] = []
  for (const word of title.split(/\s+/)) {
    const last = lines.length - 1
    if (last >= 0 && (lines[last] + ' ' + word).length <= 23) lines[last] += ' ' + word
    else lines.push(word)
  }
  const visible = lines.slice(0, 4)
  if (lines.length > 4) visible[3] += '…'
  return (
    <text x={Number(x) - 8} y={Number(y)} textAnchor="end" fill="#475569" fontSize={11}>
      <title>{title}</title>
      {visible.map((line, index) => <tspan key={index} x={Number(x) - 8} dy={index === 0 ? -(visible.length - 1) * 7 + 4 : 14}>{line}</tspan>)}
    </text>
  )
}

function ComparisonTooltip({ active, payload, kind }: {
  active?: boolean
  payload?: readonly { payload?: { name: string; registrations?: number; slots?: number; allocated?: number; spent?: number } }[]
  kind: 'registrations' | 'budget'
}) {
  const item = payload?.[0]?.payload
  if (!active || !item) return null
  const filled = percent(item.registrations ?? 0, item.slots ?? 0)
  return (
    <div className="dashboard-chart-tooltip max-w-64 rounded-xl border border-gray-200 bg-white p-4 text-xs shadow-xl">
      <p className="font-semibold text-gray-900 mb-2 break-words">{item.name}</p>
      {kind === 'registrations' ? <div className="space-y-1">
        <p className="text-primary">Registered: <strong>{number.format(item.registrations ?? 0)}</strong></p>
        <p className="text-gray-600">Total slots: <strong>{number.format(item.slots ?? 0)}</strong></p>
        <p className="text-gray-600">{filled === null ? 'No capacity set' : `${filled}% of slots filled`}</p>
      </div> : <div className="space-y-1">
        <p className="text-primary">Allocated: <strong>{currency(item.allocated ?? 0)}</strong></p>
        <p className="text-teal-700">Spent: <strong>{currency(item.spent ?? 0)}</strong></p>
        <p className="text-gray-600">Remaining: <strong>{currency((item.allocated ?? 0) - (item.spent ?? 0))}</strong></p>
      </div>}
    </div>
  )
}

function ChartKey({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-gray-600"><span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} />{children}</span>
}

export function AttendanceTrendChart({ data }: { data: { date: string; registrations: number; attendance: number }[] }) {
  const registrations = data.reduce((sum, day) => sum + day.registrations, 0)
  const attendance = data.reduce((sum, day) => sum + day.attendance, 0)
  const maximum = Math.max(1, ...data.flatMap((day) => [day.registrations, day.attendance]))
  const ticks = maximum <= 5 ? Array.from({ length: maximum + 1 }, (_, index) => index) : undefined

  return (
    <section className={panelClass} aria-label="Daily registrations and attendance">
      <h2 className="text-sm font-semibold text-gray-800">Daily registrations & attendance</h2>
      <p className="text-xs text-gray-500 mt-1">Last 14 days · Activities in the selected period.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 mb-2">
        <ChartKey color="bg-primary">{number.format(registrations)} {registrations === 1 ? 'registration' : 'registrations'}</ChartKey>
        <ChartKey color="bg-teal">{number.format(attendance)} {attendance === 1 ? 'check-in' : 'check-ins'}</ChartKey>
      </div>
      {registrations === 0 && attendance === 0 ? (
        <p className="text-sm text-gray-500 flex-1 flex items-center justify-center min-h-64 text-center">No registrations or check-ins in the last 14 days for these activities.</p>
      ) : (
        <div className="mt-3" role="img" aria-label={`${registrations} ${registrations === 1 ? 'registration' : 'registrations'} and ${attendance} daily ${attendance === 1 ? 'check-in' : 'check-ins'} over the last 14 days. The chart shows counts per day.`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart accessibilityLayer data={data} margin={{ top: 24, right: 8, left: -20, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#63758a' }} axisLine={false} tickLine={false} minTickGap={24} tickFormatter={(value) => dateLabel(String(value))} />
              <YAxis allowDecimals={false} ticks={ticks} domain={[0, maximum]} tick={{ fontSize: 11, fill: '#63758a' }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(value) => dateLabel(String(value), true)} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, borderColor: '#dce5ef', fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="registrations" name="Registrations" fill="var(--color-primary)" activeBar={{ stroke: "#063568", strokeWidth: 2 }} maxBarSize={18} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 11, formatter: (value: unknown) => Number(value) > 0 ? String(value) : '' }} />
              <Bar isAnimationActive={false} dataKey="attendance" name="Check-ins" fill="var(--color-teal)" activeBar={{ stroke: "#063568", strokeWidth: 2 }} maxBarSize={18} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 11, formatter: (value: unknown) => Number(value) > 0 ? String(value) : '' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-3">Check-ins count each registration once per day; a multi-day attendee can appear on several days.</p>
    </section>
  )
}

export function ActivityRegistrationsChart({ data }: { data: { name: string; registrations: number; slots: number }[] }) {
  return (
    <section className={panelClass} aria-label="Activity registrations and capacity">
      <h2 className="text-sm font-semibold text-gray-800">Registrations by activity</h2>
      <p className="text-xs text-gray-500 mt-1 mb-4">Top 8 by registrations · Compare sign-ups with total capacity.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-2">
        <ChartKey color="bg-primary">Registered</ChartKey>
        <ChartKey color="bg-slate-300">Total slots</ChartKey>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-gray-500 flex-1 flex items-center justify-center min-h-64 text-center">No activities in the selected period.</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1" tabIndex={0} aria-label="Interactive registration chart. Scroll horizontally on small screens; hover or use arrow keys for exact values.">
          <div className="min-w-[480px]">
            <ResponsiveContainer width="100%" height={Math.max(300, data.length * 78 + 45)}>
              <BarChart accessibilityLayer layout="vertical" data={data} barGap={4} margin={{ top: 12, right: 48, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" orientation="top" allowDecimals={false} domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]} tick={{ fontSize: 11, fill: '#63758a' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={<ActivityAxisTick />} interval={0} axisLine={false} tickLine={false} />
                <Tooltip content={<ComparisonTooltip kind="registrations" />} cursor={{ fill: '#f1f5f9' }} />
                <Bar isAnimationActive={false} dataKey="registrations" name="Registered" fill="var(--color-primary)" activeBar={{ stroke: "#063568", strokeWidth: 2 }} shape={<Rectangle />} maxBarSize={16} minPointSize={(value) => Number(value) > 0 ? 3 : 0} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="registrations" position="right" fill="var(--color-primary)" fontSize={12} />
                </Bar>
                <Bar isAnimationActive={false} dataKey="slots" name="Total slots" fill="#cbd5e1" shape={<Rectangle />} maxBarSize={16} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="slots" position="right" fill="#63758a" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data.length > 0 && <p className="text-xs text-gray-500 mt-3">Scale: people / slots. Hover a bar or use arrow keys for the full title and fill rate.</p>}
    </section>
  )
}

export function BudgetOverviewChart({ data, allocated, spent }: {
  data: { name: string; allocated: number; spent: number }[]
  allocated: number
  spent: number
}) {
  const utilization = percent(spent, allocated)

  return (
    <section className={panelClass} aria-label="Activity budget allocation and spending">
      <h2 className="text-sm font-semibold text-gray-800">Budget allocation & spending</h2>
      <p className="text-xs text-gray-500 mt-1">Top 8 by allocation · Bar lengths use the same PHP scale.</p>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 mt-4 mb-2">
        <div><p className="text-xs text-gray-500">Total allocated</p><p className="text-sm font-bold text-gray-800 break-words mt-1">{currency(allocated)}</p></div>
        <div><p className="text-xs text-gray-500">Total spent</p><p className="text-sm font-bold text-teal-700 break-words mt-1">{currency(spent)}</p></div>
      </div>
      <p className="text-xs text-gray-500 mb-3">Totals cover all selected activities{utilization === null ? '.' : ` · ${utilization}% spent.`}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-2">
        <ChartKey color="bg-primary">Allocated</ChartKey>
        <ChartKey color="bg-teal">Spent</ChartKey>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-gray-500 flex-1 flex items-center justify-center min-h-64 text-center">No budget allocations or spending in the selected period.</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1" tabIndex={0} aria-label="Interactive budget chart. Scroll horizontally on small screens; hover or use arrow keys for exact values.">
          <div className="min-w-[480px]">
            <ResponsiveContainer width="100%" height={Math.max(300, data.length * 78 + 45)}>
              <BarChart accessibilityLayer layout="vertical" data={data} barGap={4} margin={{ top: 12, right: 55, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" orientation="top" domain={[0, (max: number) => Math.max(1, max * 1.15)]} tickFormatter={(value) => `₱${compactNumber.format(Number(value))}`} tick={{ fontSize: 11, fill: '#63758a' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={150} tick={<ActivityAxisTick />} interval={0} axisLine={false} tickLine={false} />
                <Tooltip content={<ComparisonTooltip kind="budget" />} cursor={{ fill: '#f1f5f9' }} />
                <Bar isAnimationActive={false} dataKey="allocated" name="Allocated" fill="var(--color-primary)" activeBar={{ stroke: "#063568", strokeWidth: 2 }} shape={<Rectangle />} maxBarSize={16} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="allocated" position="right" fill="var(--color-primary)" fontSize={11} formatter={(value: unknown) => `₱${compactNumber.format(Number(value))}`} />
                </Bar>
                <Bar isAnimationActive={false} dataKey="spent" name="Spent" fill="var(--color-teal)" activeBar={{ stroke: "#063568", strokeWidth: 2 }} shape={<Rectangle />} maxBarSize={16} minPointSize={(value) => Number(value) > 0 ? 3 : 0} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="spent" position="right" fill="var(--color-teal)" fontSize={11} formatter={(value: unknown) => `₱${compactNumber.format(Number(value))}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {data.length > 0 && <p className="text-xs text-gray-500 mt-3">Amounts in PHP · K = thousand, M = million. Hover a bar or use arrow keys for exact amounts.</p>}
    </section>
  )
}

function SatisfactionTooltip({ active, payload }: {
  active?: boolean
  payload?: readonly { payload?: { name: string; responses: number; averageRating: number } }[]
}) {
  const item = payload?.[0]?.payload
  if (!active || !item) return null
  return <div className="dashboard-chart-tooltip max-w-64 rounded-xl border border-gray-200 bg-white p-4 text-xs shadow-xl">
    <p className="mb-2 break-words font-semibold text-gray-900">{item.name}</p>
    <p className="text-primary">Average rating: <strong>{item.averageRating.toFixed(1)} / 5</strong></p>
    <p className="mt-1 text-gray-600">{number.format(item.responses)} evaluation {item.responses === 1 ? 'response' : 'responses'}</p>
  </div>
}

export function ActivitySatisfactionChart({ data = [] }: { data?: { name: string; responses: number; averageRating: number }[] }) {
  const rows = [...data].filter(row => row.responses > 0).sort((a, b) => b.responses - a.responses || a.name.localeCompare(b.name)).slice(0, 8)
  return <section className={panelClass} aria-label="Participant satisfaction by activity">
    <h2 className="text-sm font-semibold text-gray-800">Satisfaction by activity</h2>
    <p className="mt-1 text-xs text-gray-500">Top 8 by evaluation responses · Average participant rating on a fixed 1–5 scale.</p>
    {!rows.length ? <p className="flex min-h-64 flex-1 items-center justify-center py-8 text-center text-sm text-gray-500">No evaluation responses in the selected period. Ratings appear after participants submit evaluations.</p> : <>
      <div className="mt-4 overflow-x-auto" tabIndex={0} aria-label="Interactive satisfaction chart. Scroll on small screens; hover or use arrow keys for ratings and response counts.">
        <div className="min-w-[480px]">
          <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 64 + 45)}>
            <BarChart accessibilityLayer layout="vertical" data={rows} margin={{ top: 12, right: 70, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#63758a' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={<ActivityAxisTick />} interval={0} axisLine={false} tickLine={false} />
              <Tooltip content={<SatisfactionTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar isAnimationActive={false} dataKey="averageRating" name="Average rating" fill="var(--color-primary)" activeBar={{ stroke: "#063568", strokeWidth: 2 }} maxBarSize={22} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="averageRating" position="right" fill="var(--color-primary)" fontSize={12} formatter={(value: unknown) => `${Number(value).toFixed(1)} / 5`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">Based on submitted evaluations for activities in the selected period. Hover a bar for its response count; activities without responses are excluded.</p>
    </>}
  </section>
}
