import { supabase } from '../../lib/supabase'

export interface EvaluationRow {
  id: string
  rating: number
  feedback: string
  wouldRecommend: boolean
  submittedAt: string
  participantName: string
  activityTitle: string
}

export interface EvaluationStats {
  totalResponses: number
  averageRating: number
  recommendRate: number
}

export async function fetchEvaluations(): Promise<{ stats: EvaluationStats; rows: EvaluationRow[] }> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('id, rating, feedback, would_recommend, submitted_at, registration_id')
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('fetchEvaluations error:', error.message)
    return { stats: { totalResponses: 0, averageRating: 0, recommendRate: 0 }, rows: [] }
  }

  const regIds = [...new Set((data || []).map((e: any) => e.registration_id))]
  let regMap: Record<string, any> = {}

  if (regIds.length) {
    const { data: regs } = await supabase
      .from('registration_details')
      .select('id, name, activity_id')
      .in('id', regIds)
    regMap = Object.fromEntries((regs || []).map((r: any) => [r.id, r]))
  }

  const activityIds = [...new Set(Object.values(regMap).map((r: any) => r.activity_id))]
  let actMap: Record<string, string> = {}
  if (activityIds.length) {
    const { data: acts } = await supabase.from('legacy_activities').select('id, title').in('id', activityIds)
    actMap = Object.fromEntries((acts || []).map((a: any) => [a.id, a.title]))
  }

  const rows: EvaluationRow[] = (data || []).map((e: any) => {
    const reg = regMap[e.registration_id]
    return {
      id: e.id,
      rating: e.rating,
      feedback: e.feedback || '',
      wouldRecommend: !!e.would_recommend,
      submittedAt: e.submitted_at,
      participantName: reg?.name || '—',
      activityTitle: reg ? actMap[reg.activity_id] || '—' : '—',
    }
  })

  const totalResponses = rows.length
  const averageRating = totalResponses > 0 ? rows.reduce((s, r) => s + r.rating, 0) / totalResponses : 0
  const recommendCount = rows.filter((r) => r.wouldRecommend).length
  const recommendRate = totalResponses > 0 ? Math.round((recommendCount / totalResponses) * 100) : 0

  return {
    stats: { totalResponses, averageRating: Math.round(averageRating * 10) / 10, recommendRate },
    rows,
  }
}

export interface SubmitEvaluationPayload {
  refCode: string
  rating: number
  feedback: string
  wouldRecommend: boolean
  responses: Record<string, string>
}

export async function submitEvaluation(
  payload: SubmitEvaluationPayload
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('submit_legacy_evaluation', {
    p_ref_code: payload.refCode.trim().toUpperCase(),
    p_rating: payload.rating,
    p_feedback: payload.feedback,
    p_would_recommend: payload.wouldRecommend,
    p_responses: payload.responses,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}