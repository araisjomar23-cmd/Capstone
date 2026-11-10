import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const number = new Intl.NumberFormat('en-PH')
const currency = (value: number) => `PHP ${number.format(value)}`
const percent = (value: number, total: number) => total > 0 ? Math.round(value / total * 100) : null
const dateLabel = (date: string, year = false) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', {
  month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}),
})
const panelClass = 'stat-card min-w-0 !p-4 sm:!p-5 flex flex-col'
const compactNumber = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })

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
    <div className="max-w-64 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-lg">
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
              <Bar dataKey="registrations" name="Registrations" fill="var(--color-primary)" maxBarSize={18} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 11, formatter: (value: unknown) => Number(value) > 0 ? String(value) : '' }} />
              <Bar dataKey="attendance" name="Check-ins" fill="var(--color-teal)" maxBarSize={18} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 11, formatter: (value: unknown) => Number(value) > 0 ? String(value) : '' }} />
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
                <Bar dataKey="registrations" name="Registered" fill="var(--color-primary)" shape={<Rectangle />} maxBarSize={16} minPointSize={(value) => Number(value) > 0 ? 3 : 0} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="registrations" position="right" fill="var(--color-primary)" fontSize={12} />
                </Bar>
                <Bar dataKey="slots" name="Total slots" fill="#cbd5e1" shape={<Rectangle />} maxBarSize={16} radius={[0, 4, 4, 0]}>
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
                <Bar dataKey="allocated" name="Allocated" fill="var(--color-primary)" shape={<Rectangle />} maxBarSize={16} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="allocated" position="right" fill="var(--color-primary)" fontSize={11} formatter={(value: unknown) => `₱${compactNumber.format(Number(value))}`} />
                </Bar>
                <Bar dataKey="spent" name="Spent" fill="var(--color-teal)" shape={<Rectangle />} maxBarSize={16} minPointSize={(value) => Number(value) > 0 ? 3 : 0} radius={[0, 4, 4, 0]}>
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
