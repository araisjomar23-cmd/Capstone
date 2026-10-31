import { summarizeDashboard, type DashboardSnapshot } from './dashboardSummary'
import type { FiscalPeriod } from '../../lib/fiscalYear'
import { useEffect, useMemo, useRef, useState } from 'react'
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

export function useDashboardData(period: FiscalPeriod) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const data = useMemo(() => snapshot ? summarizeDashboard(snapshot, period) : null, [snapshot, period])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const latestRequest = useRef(0)

  async function refresh() {
    const request = ++latestRequest.current
    setLoading(true)
    setError(null)
    try {
      const [acts, all, evalResult] = await Promise.all([
        fetchActivities(true),
        fetchParticipants(true),
        fetchEvaluations(true),
      ])

      if (request !== latestRequest.current) return
      setSnapshot({ acts, all, evaluations: evalResult.rows })
      setUpdatedAt(new Date())
    } catch (err) {
      console.error('Dashboard load error:', err)
      if (request === latestRequest.current) setError('Failed to load dashboard data.')
    } finally {
      if (request === latestRequest.current) setLoading(false)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => refresh())
      .subscribe()

    return () => {
      latestRequest.current++
      supabase.removeChannel(channel)
    }
  }, [])

  return { data, activities: snapshot?.acts || [], loading, error, refresh, updatedAt }
}
