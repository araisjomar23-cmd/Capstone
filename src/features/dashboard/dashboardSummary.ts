import { manilaDate } from '../../lib/calendarDate'
import type { DashboardData, AttendanceTrendDatum, StatusSlice, ActivityRegistrationDatum, BudgetDatum } from './useDashboardData'
import type { Activity } from '../../types/activity'
import type { Registration } from '../../types/registration'
import type { EvaluationRow } from '../evaluations/evaluationService'
import { inFiscalPeriod, type FiscalPeriod } from '../../lib/fiscalYear'

export interface DashboardSnapshot { acts: Activity[]; all: Registration[]; evaluations: EvaluationRow[] }

const TREND_DAYS = 14

function buildAttendanceTrend(all: Registration[], now: Date): AttendanceTrendDatum[] {
  const today = manilaDate(now)!
  const midnight = new Date(today + 'T00:00:00Z')
  const days = Array.from({ length: TREND_DAYS }, (_, index) => ({
    date: new Date(midnight.getTime() - (TREND_DAYS - 1 - index) * 86_400_000).toISOString().slice(0, 10),
    registrations: 0, attendance: 0,
  }))
  const byDate = new Map(days.map((day) => [day.date, day]))
  for (const registration of all) {
    const registeredDay = manilaDate(registration.registeredAt)
    if (registeredDay && byDate.has(registeredDay)) byDate.get(registeredDay)!.registrations++
    // Count each registration once per attended day, including multi-day activities.
    const attendedDays = new Set((registration.attendanceHistory || []).map((entry) => manilaDate(entry.checkedInAt)))
    if (registration.attendedAt) attendedDays.add(manilaDate(registration.attendedAt))
    for (const date of attendedDays) if (date && byDate.has(date)) byDate.get(date)!.attendance++
  }
  return days
}

export function summarizeDashboard(snapshot: DashboardSnapshot, period: FiscalPeriod, now = new Date()): DashboardData {
  const acts = snapshot.acts.filter((activity) => inFiscalPeriod(activity.startDate, period))
  const activityIds = new Set(acts.map((activity) => activity.id))
  const all = period.year === 'all' && !period.month ? snapshot.all : snapshot.all.filter((registration) => activityIds.has(registration.activityId))
  const rows = period.year === 'all' && !period.month ? snapshot.evaluations : snapshot.evaluations.filter((evaluation) => activityIds.has(evaluation.activityId))
  const totalResponses = rows.length
  const evalResult = { rows, stats: {
    totalResponses,
    averageRating: totalResponses ? Math.round(rows.reduce((sum, row) => sum + row.rating, 0) / totalResponses * 10) / 10 : 0,
    recommendRate: totalResponses ? Math.round(rows.filter((row) => row.wouldRecommend).length / totalResponses * 100) : 0,
  } }
  const activeRegistrations = all.filter((p) => p.status !== 'inactive')
  const totalReg = activeRegistrations.length
  const totalAtt = activeRegistrations.filter((p) => p.status === 'attended' || p.status === 'completed').length
  const totalSlots = acts.reduce((s, a) => s + a.slots, 0)
  const fillRate = totalSlots > 0 ? Math.round((totalReg / totalSlots) * 100) : 0
  const activeActs = acts.filter((a) => a.status === 'open' || a.status === 'full').length
  const upcomingActs = acts.filter((a) => a.status === 'upcoming').length
  const remaining = Math.max(0, 100 - fillRate)
  const attRate = totalReg > 0 ? ((totalAtt / totalReg) * 100).toFixed(1) : '0.0'
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const thisWeek = activeRegistrations.filter((p) => p.registeredAt >= weekAgo && p.registeredAt <= now.toISOString()).length

  const liveCount: Record<string, number> = {}
  all.forEach((r) => {
    if (r.status !== 'inactive') {
      liveCount[r.activityId] = (liveCount[r.activityId] || 0) + 1
    }
  })

  // Pie chart: breakdown of attendees by sectoral group
  const sectoralCounts: Record<string, number> = {}
  all
    .filter((p) => p.status === 'attended' || p.status === 'completed')
    .forEach((r) => {
      const key = r.sectoralGroup || 'None'
      sectoralCounts[key] = (sectoralCounts[key] || 0) + 1
    })
  const statusBreakdown: StatusSlice[] = Object.entries(sectoralCounts)
    .map(([status, value]) => ({ status, label: status, value }))
    .sort((a, b) => b.value - a.value)

  const activityRegistrations: ActivityRegistrationDatum[] = acts
    .map((a) => ({
      name: a.title,
      registrations: liveCount[a.id] || 0,
      slots: a.slots,
    }))
    .sort((a, b) => b.registrations - a.registrations)
    .slice(0, 8)

  const budgetOverview: BudgetDatum[] = acts
    .filter((a) => a.budgetAlloc > 0 || a.budgetSpent > 0)
    .map((a) => ({
      name: a.title,
      allocated: a.budgetAlloc,
      spent: a.budgetSpent,
    }))
    .sort((a, b) => b.allocated - a.allocated)
    .slice(0, 8)

  const attendanceTrend = buildAttendanceTrend(activeRegistrations, now)
  const satisfactionByTitle = new Map<string, { name: string; responses: number; ratingTotal: number }>()
  for (const evaluation of evalResult.rows) {
    const current = satisfactionByTitle.get(evaluation.activityId || evaluation.id) || { name: evaluation.activityTitle, responses: 0, ratingTotal: 0 }
    current.responses += 1
    current.ratingTotal += evaluation.rating
    satisfactionByTitle.set(evaluation.activityId || evaluation.id, current)
  }

  return {
    totalReg,
    totalAtt,
    acts,
    totalSlots,
    fillRate,
    activeActs,
    upcomingActs,
    remaining,
    attRate,
    thisWeek,
    liveCount,
    all,
    statusBreakdown,
    activityRegistrations,
    budgetOverview,
    attendanceTrend,
    evaluationStats: evalResult.stats,
    activitySatisfaction: [...satisfactionByTitle.entries()].map(([, item]) => ({
      name: item.name,
      responses: item.responses,
      averageRating: item.ratingTotal / item.responses,
    })).sort((a, b) => b.responses - a.responses),
    totalBudgetAllocated: acts.reduce((sum, activity) => sum + activity.budgetAlloc, 0),
    totalBudgetSpent: acts.reduce((sum, activity) => sum + activity.budgetSpent, 0),
    recentEvaluations: [...evalResult.rows].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 5),
  }
}
