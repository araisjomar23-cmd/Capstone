import { isCalendarDate, manilaDate } from './calendarDate'

export interface DatePeriod { year: string; month: string }
export const ALL_DATES: DatePeriod = { year: '', month: '' }

export function currentMonthPeriod(now = new Date()): DatePeriod {
  const today = manilaDate(now)!
  return { year: today.slice(0, 4), month: today.slice(5, 7) }
}

// Compare calendar dates directly so activity schedules do not shift with timezones.
export function matchesDatePeriod(start: string | undefined, end: string | undefined, period: DatePeriod): boolean {
  if (!period.year && !period.month) return true
  if (period.month && !/^(0[1-9]|1[0-2])$/.test(period.month)) return false
  if (period.year && !/^\d{4}$/.test(period.year)) return false
  if (!isCalendarDate(start)) return false
  const last = isCalendarDate(end) && end >= start ? end : start
  const firstYear = period.year ? Number(period.year) : Number(start.slice(0, 4))
  const lastYear = period.year ? firstYear : Number(last.slice(0, 4))
  for (let year = firstYear; year <= lastYear; year++) {
    const lower = year + '-' + (period.month || '01') + '-01'
    // Calendar dates are ISO strings; day 31 also covers shorter months without timezone math.
    const upper = year + '-' + (period.month || '12') + '-31'
    if (last >= lower && start <= upper) return true
  }
  return false
}

export function activityDateLabel(start?: string, end?: string): string {
  const format = (date: string) => new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  if (!isCalendarDate(start)) return 'Activity date unavailable'
  return isCalendarDate(end) && end >= start && end !== start ? format(start) + ' to ' + format(end) : format(start)
}
