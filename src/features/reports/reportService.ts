import { supabase } from '../../lib/supabase'
import { analyzeFeedbackHybrid, type SuggestedSentiment } from '../evaluations/feedbackAnalyzer'

export interface ReportData {
  period: string
  generatedAt: string
  totalActivities: number
  totalRegistered: number
  totalAttended: number
  avgSatisfaction: string
  activityRows: {
    title: string
    program: string
    date: string
    slots: number
    registered: number
    attended: number
    status: string
    budgetUtil: string
  }[]
  genderBreakdown: { label: string; count: number }[]
  ageBreakdown: { label: string; count: number }[]
  topBarangays: { label: string; count: number }[]
  budgetAllocated: number
  budgetUtilized: number
  budgetRemaining: number
  budgetRows: {
    title: string
    allocated: number
    utilized: number
    remaining: number
    utilPct: number
  }[]
  evalSummary: string
  evalRows: {
    title: string
    responses: number
    avgRating: string
    recommendPct: string
  }[]
  feedbackAnalysis: {
    analyzedComments: number
    semanticAssistedComments: number
    modelStatus: 'not-needed' | 'ready' | 'unavailable'
    modelError?: string
    sentimentCounts: Record<SuggestedSentiment, number>
    themeCounts: {
      theme: string
      count: number
      sentimentCounts: Record<SuggestedSentiment, number>
    }[]
  }
  insights: string[]
}

export async function generateReport(dateFrom: string, dateTo: string): Promise<ReportData> {
  const { data: activities, error: activitiesError } = await supabase
    .from('legacy_activities')
    .select('id, title, status, slots, start_date, programs(name)')
    .gte('start_date', dateFrom)
    .lte('start_date', dateTo)

  if (activitiesError) throw new Error(`Unable to load report activities: ${activitiesError.message}`)

  const activityIds = (activities || []).map((a: any) => a.id)

  const { data: regs, error: registrationsError } = await supabase
    .from('registration_details')
    .select('id, activity_id, status, gender_identity, age, barangay')
    .in('activity_id', activityIds.length ? activityIds : ['none'])
    .neq('status', 'inactive')

  if (registrationsError) throw new Error(`Unable to load report registrations: ${registrationsError.message}`)

  const { data: budgetEntries, error: budgetError } = await supabase
    .from('budget_entries')
    .select('activity_id, amount, entry_type')
    .in('activity_id', activityIds.length ? activityIds : ['none'])

  if (budgetError) throw new Error(`Unable to load report budgets: ${budgetError.message}`)

  const { data: evals, error: evaluationsError } = await supabase
    .from('evaluations')
    .select('activity_id, rating, would_recommend, feedback')
    .in('activity_id', activityIds.length ? activityIds : ['none'])

  if (evaluationsError) throw new Error(`Unable to load report evaluations: ${evaluationsError.message}`)

  const regsByActivity: Record<string, typeof regs> = {}
  ;(regs || []).forEach((r: any) => {
    if (!regsByActivity[r.activity_id]) regsByActivity[r.activity_id] = []
    regsByActivity[r.activity_id]!.push(r)
  })

  const budgetByActivity: Record<string, { alloc: number; spent: number }> = {}
  ;(budgetEntries || []).forEach((b: any) => {
    if (!budgetByActivity[b.activity_id]) budgetByActivity[b.activity_id] = { alloc: 0, spent: 0 }
    if (b.entry_type === 'allocation') budgetByActivity[b.activity_id].alloc += Number(b.amount) || 0
    if (b.entry_type === 'expense') budgetByActivity[b.activity_id].spent += Number(b.amount) || 0
  })

  const evalsByActivity: Record<string, typeof evals> = {}
  ;(evals || []).forEach((e: any) => {
    if (!evalsByActivity[e.activity_id]) evalsByActivity[e.activity_id] = []
    evalsByActivity[e.activity_id]!.push(e)
  })

  const totalRegistered = (regs || []).length
  const totalAttended = (regs || []).filter((r: any) => r.status === 'attended' || r.status === 'completed').length
  const totalEvalRating = (evals || []).reduce((s: number, e: any) => s + (e.rating || 0), 0)
  const avgSatisfaction = evals && evals.length > 0 ? (totalEvalRating / evals.length).toFixed(1) : 'N/A'

  const activityRows = (activities || []).map((a: any) => {
    const activityRegs = regsByActivity[a.id] || []
    const attended = activityRegs.filter((r: any) => r.status === 'attended' || r.status === 'completed').length
    const budget = budgetByActivity[a.id] || { alloc: 0, spent: 0 }
    const utilPct = budget.alloc > 0 ? Math.round((budget.spent / budget.alloc) * 100) : 0
    return {
      title: a.title,
      program: a.programs?.name || '—',
      date: new Date(a.start_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
      slots: a.slots,
      registered: activityRegs.length,
      attended,
      status: a.status,
      budgetUtil: budget.alloc > 0 ? `${utilPct}%` : '—',
    }
  })

  function tally(items: any[], key: string): { label: string; count: number }[] {
    const map: Record<string, number> = {}
    items.forEach((item) => {
      const val = item[key] || 'Unspecified'
      map[val] = (map[val] || 0) + 1
    })
    return Object.entries(map)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
  }

  const genderBreakdown = tally(regs || [], 'gender_identity')
  const ageBreakdown = tally((regs || []).map((registration: any) => {
    const age = Number(registration.age)
    const bracket = !Number.isFinite(age) ? 'Unspecified'
      : age < 15 ? 'Under 15'
        : age <= 17 ? '15-17'
          : age <= 24 ? '18-24'
            : age <= 30 ? '25-30' : 'Over 30'
    return { age_bracket: bracket }
  }), 'age_bracket')
  const topBarangays = tally(regs || [], 'barangay').slice(0, 5)

  const budgetAllocated = Object.values(budgetByActivity).reduce((s, b) => s + b.alloc, 0)
  const budgetUtilized = Object.values(budgetByActivity).reduce((s, b) => s + b.spent, 0)
  const budgetRemaining = budgetAllocated - budgetUtilized

  const budgetRows = (activities || [])
    .map((a: any) => {
      const b = budgetByActivity[a.id]
      if (!b || b.alloc === 0) return null
      return {
        title: a.title,
        allocated: b.alloc,
        utilized: b.spent,
        remaining: b.alloc - b.spent,
        utilPct: Math.round((b.spent / b.alloc) * 100),
      }
    })
    .filter(Boolean) as ReportData['budgetRows']

  const evalRows = (activities || [])
    .map((a: any) => {
      const activityEvals = evalsByActivity[a.id] || []
      if (activityEvals.length === 0) return null
      const avg = activityEvals.reduce((s: number, e: any) => s + (e.rating || 0), 0) / activityEvals.length
      const recCount = activityEvals.filter((e: any) => e.would_recommend).length
      return {
        title: a.title,
        responses: activityEvals.length,
        avgRating: avg.toFixed(1),
        recommendPct: `${Math.round((recCount / activityEvals.length) * 100)}%`,
      }
    })
    .filter(Boolean) as ReportData['evalRows']

  const evalSummary =
    evals && evals.length > 0
      ? `A total of ${evals.length} evaluation${evals.length === 1 ? '' : 's'} were collected across ${evalRows.length} activit${evalRows.length === 1 ? 'y' : 'ies'}, with an overall average satisfaction rating of ${avgSatisfaction} out of 5.`
      : 'No evaluation responses were collected during this period.'

  const comments = (evals || [])
    .map((evaluation: any) => String(evaluation.feedback || '').trim())
    .filter(Boolean)
  const sentimentCounts: Record<SuggestedSentiment, number> = {
    positive: 0,
    negative: 0,
    mixed: 0,
    'no-signal': 0,
  }
  const hybridResults = await analyzeFeedbackHybrid(comments)
  const themeCounts = new Map<string, { count: number; sentimentCounts: Record<SuggestedSentiment, number> }>()
  for (const analysis of hybridResults.analyses) {
    sentimentCounts[analysis.label] += 1
    for (const { theme, sentiment } of analysis.themes) {
      const counts = themeCounts.get(theme) || {
        count: 0,
        sentimentCounts: { positive: 0, negative: 0, mixed: 0, 'no-signal': 0 },
      }
      counts.count += 1
      counts.sentimentCounts[sentiment] += 1
      themeCounts.set(theme, counts)
    }
  }
  const feedbackAnalysis = {
    analyzedComments: comments.length,
    semanticAssistedComments: hybridResults.semanticAssistedComments,
    modelStatus: hybridResults.modelStatus,
    modelError: hybridResults.modelError,
    sentimentCounts,
    themeCounts: [...themeCounts.entries()]
      .map(([theme, counts]) => ({ theme, ...counts }))
      .sort((a, b) => b.count - a.count),
  }

  const insights: string[] = []
  const attendanceRate = totalRegistered > 0 ? (totalAttended / totalRegistered) * 100 : 0

  if (!activities?.length) {
    insights.push('No activities were recorded during this period, so there is not enough data to assess program performance.')
  } else if (totalRegistered === 0) {
    insights.push('No participants registered for activities during this period. Review outreach and registration activity.')
  } else if (attendanceRate < 60) {
    insights.push(
      `Attendance rate for this period is ${attendanceRate.toFixed(0)}%, below the 60% benchmark. Consider reviewing reminder/follow-up processes for registered participants.`
    )
  } else {
    insights.push(
      `Attendance rate for this period is ${attendanceRate.toFixed(0)}%, meeting expected benchmarks. Continue current outreach practices.`
    )
  }

  const lowFillActivities = activityRows.filter((a) => a.slots > 0 && a.registered / a.slots < 0.5)
  if (lowFillActivities.length > 0) {
    insights.push(
      `${lowFillActivities.length} activit${lowFillActivities.length === 1 ? 'y has' : 'ies have'} less than 50% slot fill rate. Consider additional promotion for: ${lowFillActivities.map((a) => a.title).join(', ')}.`
    )
  }

  const overBudget = budgetRows.filter((b) => b.utilPct >= 90)
  if (overBudget.length > 0) {
    insights.push(
      `${overBudget.length} activit${overBudget.length === 1 ? 'y is' : 'ies are'} at or above 90% budget utilization: ${overBudget.map((b) => b.title).join(', ')}. Monitor remaining expenses closely.`
    )
  }

  if (evals && evals.length > 0 && Number(avgSatisfaction) < 3.5) {
    insights.push(
      `Average satisfaction rating (${avgSatisfaction}/5) is below the 3.5 benchmark. Review evaluation feedback for common concerns.`
    )
  }

  if (activities?.length && (!evals || evals.length === 0)) {
    insights.push('No evaluation responses were collected in this period, so participant satisfaction could not be assessed.')
  }

  if (insights.length === 0) {
    insights.push('No significant issues detected for this reporting period based on available data.')
  }

  return {
    period: `${dateFrom} to ${dateTo}`,
    generatedAt: new Date().toLocaleString('en-PH'),
    totalActivities: (activities || []).length,
    totalRegistered,
    totalAttended,
    avgSatisfaction,
    activityRows,
    genderBreakdown,
    ageBreakdown,
    topBarangays,
    budgetAllocated,
    budgetUtilized,
    budgetRemaining,
    budgetRows,
    evalSummary,
    evalRows,
    feedbackAnalysis,
    insights,
  }
}
