import { fiscalYearFor, fiscalPeriodRange, type FiscalPeriod } from '../../lib/fiscalYear'
import type { Activity } from '../../types/activity'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function FiscalYearFilter({ value, onChange, activities, today }: {
  value: FiscalPeriod; onChange: (value: FiscalPeriod) => void; activities: Activity[]; today: string
}) {
  const current = fiscalYearFor(today, value.startMonth)!
  const years = new Set([current])
  activities.forEach((a) => { const year = fiscalYearFor(a.startDate, value.startMonth); if (year !== null) years.add(year) })
  if (value.year !== 'all') years.add(value.year)
  return <section aria-label="Dashboard fiscal year filter" className="panel !p-4 mb-5">
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
      <label className="block text-xs font-semibold text-gray-600 sm:w-44">Year
        <select className="input mt-1.5 min-h-11" value={value.year} onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}>
          {[...years].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}

        </select>
      </label>
      <label className="block text-xs font-semibold text-gray-600 sm:w-44">Month
        <select className="input mt-1.5 min-h-11" value={value.month || ''} onChange={(e) => onChange({ ...value, month: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">All months</option>
          {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
        </select>
      </label>
      <div className="sm:ml-auto text-xs text-gray-500 sm:text-right pb-1" role="status">
        <p className="font-semibold text-primary">{fiscalPeriodRange(value)}</p>
        <p className="mt-1">Applies to all dashboard sections</p>
      </div>
    </div>
    <p className="text-xs text-gray-500 leading-relaxed mt-3">Grouped by activity start date. Participation, feedback, and budget totals belong to the selected activities.</p>
  </section>
}
