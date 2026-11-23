import { summarizeDashboard, type DashboardSnapshot } from './dashboardSummary'
import type { FiscalPeriod } from '../../lib/fiscalYear'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DASHBOARD_LIVE_TABLES, startDashboardSync, type DashboardConnection } from './dashboardSync'
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

export interface ProgramSummary {
  id: string
  name: string
  activities: number
  registrations: number
  attended: number
  allocated: number
  spent: number
  responses: number
  ratingTotal: number
}

export interface DashboardData {
  programSummaries?: ProgramSummary[]
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
  ageBreakdown?: StatusSlice[]
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
  const [connection, setConnection] = useState<DashboardConnection>('connecting')
  const sync = useRef<ReturnType<typeof startDashboardSync> | null>(null)
  const refresh = useCallback(() => sync.current?.refresh() ?? Promise.resolve(), [])

  useEffect(() => {
    let active = true
    const controller = startDashboardSync({
      onConnection: value => { setConnection(value); if (value === 'offline') setLoading(false) },
      onError: () => { if (active) setError('Failed to refresh dashboard data. Please retry.') },
      load: async () => {
        if (!active) return
        setLoading(true)
        try {
          const [acts, all, evalResult] = await Promise.all([fetchActivities(true), fetchParticipants(true), fetchEvaluations(true)])
          if (!active) return
          setSnapshot({ acts, all, evaluations: evalResult.rows })
          setUpdatedAt(new Date())
          setError(null)
        } finally { if (active) setLoading(false) }
      },
      subscribe: (onChange, onStatus) => {
        const channel = supabase.channel(`dashboard-live-updates-${Math.random().toString(36).slice(2)}`)
        for (const table of DASHBOARD_LIVE_TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
        channel.subscribe(onStatus)
        return () => { void supabase.removeChannel(channel) }
      },
    })
    sync.current = controller
    return () => {
      active = false
      controller.stop()
      sync.current = null
    }
  }, [])

  return { data, activities: snapshot?.acts || [], loading, error, refresh, updatedAt, connection }
}
