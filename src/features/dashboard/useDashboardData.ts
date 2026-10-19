import { useEffect, useState } from 'react'
import { fetchActivities } from '../activities/activityService'
import { fetchParticipants } from '../participants/participantService'
import { fetchEvaluations, type EvaluationStats, type EvaluationRow } from '../evaluations/evaluationService'
import { supabase } from '../../lib/supabase'
import type { Activity } from '../../types/activity'
import type { Registration } from '../../types/registration'

export interface StatusSlice {
  status: string
  label: string
  value: number
}

export interface ActivityRegistrationDatum {
  name: string
  registrations: number
  slots: number
}

export interface BudgetDatum {
  name: string
  allocated: number
  spent: number
}

export interface AttendanceTrendDatum {
  date: string
  registrations: number
  attendance: number
}

export interface ActivitySatisfactionDatum {
  name: string
  responses: number
  averageRating: number
}

export interface DashboardData {
  totalReg: number
  totalAtt: number
  acts: Activity[]
  totalSlots: number
  fillRate: number
  activeActs: number
  upcomingActs: number
  remaining: number
  attRate: string
  thisWeek: number
  liveCount: Record<string, number>
  all: Registration[]
  statusBreakdown: StatusSlice[]
  activityRegistrations: ActivityRegistrationDatum[]
  budgetOverview: BudgetDatum[]
  attendanceTrend: AttendanceTrendDatum[]
  evaluationStats: EvaluationStats
  activitySatisfaction: ActivitySatisfactionDatum[]
  totalBudgetAllocated: number
  totalBudgetSpent: number
  recentEvaluations: EvaluationRow[]
}

const TREND_DAYS = 14

function buildAttendanceTrend(all: Registration[]): AttendanceTrendDatum[] {
  const days: AttendanceTrendDatum[] = []
  const today = new Date()

  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push({ date: d.toISOString().slice(0, 10), registrations: 0, attendance: 0 })
  }

  const dayIndex = new Map(days.map((d, idx) => [d.date, idx]))

  all.forEach((r) => {
    const regDate = r.registeredAt?.slice(0, 10)
    if (regDate && dayIndex.has(regDate)) {
      days[dayIndex.get(regDate)!].registrations += 1
    }
    if (r.attendedAt) {
      const attDate = r.attendedAt.slice(0, 10)
      if (dayIndex.has(attDate)) {
        days[dayIndex.get(attDate)!].attendance += 1
      }
    }
  })

  return days
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [acts, all, evalResult] = await Promise.all([
        fetchActivities(),
        fetchParticipants(),
        fetchEvaluations(),
      ])

      const activeRegistrations = all.filter((p) => p.status !== 'inactive')
      const totalReg = activeRegistrations.length
      const totalAtt = activeRegistrations.filter((p) => p.status === 'attended' || p.status === 'completed').length
      const totalSlots = acts.reduce((s, a) => s + a.slots, 0)
      const fillRate = totalSlots > 0 ? Math.round((totalReg / totalSlots) * 100) : 0
      const activeActs = acts.filter((a) => a.status === 'open' || a.status === 'full').length
      const upcomingActs = acts.filter((a) => a.status === 'upcoming').length
      const remaining = 100 - fillRate
      const attRate = totalReg > 0 ? ((totalAtt / totalReg) * 100).toFixed(1) : '0.0'
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const thisWeek = activeRegistrations.filter((p) => p.registeredAt >= weekAgo).length

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
        .filter((a) => a.budgetAlloc > 0)
        .map((a) => ({
          name: a.title,
          allocated: a.budgetAlloc,
          spent: a.budgetSpent,
        }))
        .sort((a, b) => b.allocated - a.allocated)
        .slice(0, 8)

      const attendanceTrend = buildAttendanceTrend(all)
      const satisfactionByTitle = new Map<string, { responses: number; ratingTotal: number }>()
      for (const evaluation of evalResult.rows) {
        const current = satisfactionByTitle.get(evaluation.activityTitle) || { responses: 0, ratingTotal: 0 }
        current.responses += 1
        current.ratingTotal += evaluation.rating
        satisfactionByTitle.set(evaluation.activityTitle, current)
      }

      setData({
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
        activitySatisfaction: [...satisfactionByTitle.entries()].map(([name, item]) => ({
          name,
          responses: item.responses,
          averageRating: item.ratingTotal / item.responses,
        })).sort((a, b) => b.responses - a.responses),
        totalBudgetAllocated: acts.reduce((sum, activity) => sum + activity.budgetAlloc, 0),
        totalBudgetSpent: acts.reduce((sum, activity) => sum + activity.budgetSpent, 0),
        recentEvaluations: evalResult.rows.slice(0, 5),
      })
    } catch (err) {
      console.error('Dashboard load error:', err)
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()

    const channel = supabase
      .channel(`dashboard-live-updates-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_log' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_entries' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations' }, () => refresh())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { data, loading, error, refresh }
}
