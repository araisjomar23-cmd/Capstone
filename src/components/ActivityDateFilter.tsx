import { useState, type ReactNode } from 'react'
import { CalendarDays, RotateCcw } from 'lucide-react'
import { currentYearPeriod, type DatePeriod } from '../lib/activityDatePeriod'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function ActivityDateFilter({ value, onChange, dates, compact = false, actions, showHelp = true }: {
  showHelp?: boolean
  actions?: ReactNode
  compact?: boolean
  value: DatePeriod
  onChange: (value: DatePeriod) => void
  dates: { start?: string; end?: string }[]
}) {
  const [currentYear] = useState(() => currentYearPeriod().year)
  const years = new Set<string>([currentYear])
  for (const date of dates) {
    const first = Number(date.start?.slice(0, 4))
    const last = Number(date.end?.slice(0, 4)) || first
    if (first > 0) for (let year = first; year <= Math.max(first, last); year++) years.add(String(year))
  }
  if (value.year) years.add(value.year)
  const active = Boolean(value.month || value.year !== currentYear)
  const summary = value.month
    ? MONTHS[Number(value.month) - 1] + (value.year ? ' ' + value.year : ' across all years')
    : value.year ? 'All months in ' + value.year : 'All months and years'

  return (
    <section aria-label="Filter by activity month and year" className={compact ? "mb-3" : "panel !p-4 sm:!p-5 mb-4"}>
      {!compact && <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={18} className="text-primary shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-gray-800">Filter by date</h2>
      </div>}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
        <label className={compact ? "block min-w-0 flex-1 text-xs font-medium text-gray-600" : "block min-w-0 sm:w-44 text-xs font-medium text-gray-600"}>
          Month
          <select className="filter-select input mt-1.5 w-full min-h-11" value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })}>
            <option value="">All months</option>
            {MONTHS.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
          </select>
        </label>
        <label className={compact ? "block min-w-0 flex-1 text-xs font-medium text-gray-600" : "block min-w-0 sm:w-36 text-xs font-medium text-gray-600"}>
          Year
          <select className="filter-select input mt-1.5 w-full min-h-11" value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })}>

            {[...years].sort().reverse().map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        {active && <button type="button" className="col-span-full sm:col-auto min-h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onChange(currentYearPeriod())}>
          <RotateCcw size={14} aria-hidden="true" /> Reset filters
        </button>}
        {actions && <div className="col-span-full sm:ml-auto">{actions}</div>}
      </div>
      {showHelp && <p role="status" className="text-xs font-medium text-primary mt-3">{summary}</p>}
      {showHelp && !compact && <p className="text-xs text-gray-500 mt-1 leading-relaxed">Choose a month, a year, or both to find records by activity date.</p>}
    </section>
  )
}
