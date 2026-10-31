import { supabase } from '../../lib/supabase'

export interface EvaluationRow {
  id: string
  rating: number
  feedback: string
  wouldRecommend: boolean
  submittedAt: string
  participantName: string
  activityId: string
  activityStartDate?: string
  activityEndDate?: string
  activityTitle: string
}

export interface EvaluationStats {
  totalResponses: number
  averageRating: number
  recommendRate: number
}

export async function fetchEvaluations(strict = false): Promise<{ stats: EvaluationStats; rows: EvaluationRow[] }> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('id, rating, feedback, would_recommend, submitted_at, registration_id')
    .order('submitted_at', { ascending: false })

  if (error) {
    if (strict) throw new Error('Unable to load evaluations: ' + error.message)
    console.error('fetchEvaluations error:', error.message)
    return { stats: { totalResponses: 0, averageRating: 0, recommendRate: 0 }, rows: [] }
  }

  const regIds = [...new Set((data || []).map((e: any) => e.registration_id))]
  let regMap: Record<string, any> = {}

  if (regIds.length) {
    const { data: regs, error: registrationError } = await supabase
      .from('registration_details')
      .select('id, name, activity_id')
      .in('id', regIds)
    if (strict && registrationError) throw new Error('Unable to load evaluation registrations: ' + registrationError.message)
    regMap = Object.fromEntries((regs || []).map((r: any) => [r.id, r]))
  }

  const activityIds = [...new Set(Object.values(regMap).map((r: any) => r.activity_id))]
  let actMap: Record<string, { title: string; start_date: string; end_date: string }> = {}
  if (activityIds.length) {
    const { data: acts, error: activityError } = await supabase.from('legacy_activities').select('id, title, start_date, end_date').in('id', activityIds)
    if (strict && activityError) throw new Error('Unable to load evaluation activities: ' + activityError.message)
    actMap = Object.fromEntries((acts || []).map((a: any) => [a.id, a]))
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
      activityId: reg?.activity_id || '',
      activityStartDate: actMap[reg?.activity_id]?.start_date,
      activityEndDate: actMap[reg?.activity_id]?.end_date,
      activityTitle: reg ? actMap[reg.activity_id]?.title || '—' : '—',
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
  markAttendedOnSubmit?: boolean
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
    p_mark_attended_on_submit: payload.markAttendedOnSubmit ?? false,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

export async function recordAttendanceForSubmittedEvaluation(
  refCode: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('record_attendance_for_submitted_evaluation', {
    p_ref_code: refCode.trim().toUpperCase(),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
