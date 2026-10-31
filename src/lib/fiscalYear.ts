import { isCalendarDate } from './calendarDate'

export interface FiscalPeriod { year: number | 'all'; startMonth: number; month?: number }

export function fiscalYearFor(date: string, startMonth: number): number | null {
  if (!isCalendarDate(date) || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) return null
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return month >= startMonth ? year : year - 1
}

export function inFiscalYear(date: string, period: FiscalPeriod): boolean {
  return period.year === 'all' || fiscalYearFor(date, period.startMonth) === period.year
}

export function fiscalYearLabel(year: number, startMonth: number): string {
  return startMonth === 1 ? 'FY ' + year : 'FY ' + year + '/' + (year + 1)
}

export function fiscalYearRange(year: number, startMonth: number): string {
  const first = new Date(year, startMonth - 1, 1)
  const last = new Date(year + 1, startMonth - 1, 0)
  const format = (date: Date) => date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return format(first) + ' to ' + format(last)
}

/** A month narrows activity starts within the selected fiscal year. */
export function inFiscalPeriod(date: string, period: FiscalPeriod): boolean {
  if (!inFiscalYear(date, period)) return false
  if (!period.month) return true
  return isCalendarDate(date) && Number(date.slice(5, 7)) === period.month
}

export function fiscalPeriodRange(period: FiscalPeriod): string {
  if (period.year === 'all') return 'All fiscal years'
  if (!period.month) return fiscalYearRange(period.year, period.startMonth)
  const year = period.year + (period.month < period.startMonth ? 1 : 0)
  const format = (date: Date) => date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return format(new Date(year, period.month - 1, 1)) + ' to ' + format(new Date(year, period.month, 0))
}
