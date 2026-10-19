import { supabase } from '../../lib/supabase'
import type { PublicActivity } from './publicActivityService'
import {
  CANCELLATION_ERROR,
  CANCELLATION_ERROR_MESSAGES,
  CANCELLATION_FALLBACK_MESSAGE,
  CANCELLATION_REASON_MAX_LENGTH,
} from './registrationConstants'

/**
 * Formats database 24h string values (e.g. "13:00:00") into a clean 12h AM/PM layout
 */
function formatTimeRange(startTime?: string, endTime?: string): string {
  if (!startTime) return '—'
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, '0')} ${period}`
  }
  return endTime ? `${fmt(startTime)} – ${fmt(endTime)}` : fmt(startTime)
}

/**
 * Fetches a single activity by its ID.
 */
export async function fetchActivityById(id: string): Promise<PublicActivity | null> {
  const { data, error } = await supabase
    .from('legacy_activities')
    .select(`
      id, program_id, title, color_bg, tags,
      status, slots, taken, start_date, end_date, start_time, end_time, venue,
      preview_desc, full_desc, outcomes, schedule, bring, note,
      programs ( id, name )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

  return {
    id: String(data.id),
    programId: data.program_id,
    programName: (data as any).programs?.name || '—',
    title: data.title || '',
    colorBg: data.color_bg || '',
    tags: data.tags || [],
    status: data.status || 'open',
    slots: data.slots || 0,
    taken: data.taken || 0,
    venue: data.venue || '—',
    date:
      data.start_date === data.end_date
        ? fmt(data.start_date)
        : `${fmt(data.start_date)} – ${fmt(data.end_date)}`,
    time: formatTimeRange(data.start_time, data.end_time),
    previewDesc: data.preview_desc || '',
    fullDesc: data.full_desc || '',
    outcomes: data.outcomes || [],
    schedule: data.schedule || [],
    bring: data.bring || [],
    note: data.note || '',
  }
}

export interface RegisterResult {
  ok: boolean
  error?: string
  refCode?: string
}

/**
 * Registers a logged-in user to a specific activity via an atomic backend RPC.
 */
export async function registerParticipant(activityId: string): Promise<RegisterResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'Please login first.' }
  }

  // Single atomic call — the lock inside the RPC handles the race.
  const { data, error } = await supabase.rpc('register_participant', {
    p_activity_id: activityId,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  const result = data?.[0]
  if (!result?.success) {
    return { ok: false, error: result?.message || 'Registration failed.' }
  }

  return { ok: true, refCode: result.ref_code }
}

/* ───────────────────────── My registrations & cancellation ───────────────────────── */

export interface MyRegistration {
  id: string
  activityId: string
  title: string
  colorBg: string
  status: string
  registeredAt: string
  cancelDeadline: string | null
  canCancel: boolean
  refCode: string
  hasEvaluation: boolean
  hasAttended: boolean
  activityStatus: 'upcoming' | 'ongoing' | 'completed'
  checkInOpensAt: string
}

interface MyRegistrationRecord {
  id: string
  activity_id: string
  title: string | null
  color_bg: string | null
  status: string
  registered_at: string
  cancel_deadline: string | null
  can_cancel: boolean
}

interface MyEvaluationStatusRecord {
  registration_id: string
  ref_code: string
  activity_title: string
  evaluated: boolean
  attended: boolean
  activity_status: 'upcoming' | 'ongoing' | 'completed'
  checkin_opens_at: string
}

export interface MyRegistrationsResult {
  ok: boolean
  data: MyRegistration[]
  error?: string
}

/**
 * Loads the logged-in participant's registrations. Cancellation eligibility
 * is computed server-side so the client never re-implements the rules.
 */
export async function fetchMyRegistrations(): Promise<MyRegistrationsResult> {
  const [{ data, error }, { data: evaluationStatuses, error: evaluationError }] = await Promise.all([
    supabase.rpc('get_my_registrations'),
    supabase.rpc('get_my_evaluation_status'),
  ])

  if (error || evaluationError) {
    return { ok: false, data: [], error: (error || evaluationError)?.message }
  }

  const statusByRegistration = new Map<string, MyEvaluationStatusRecord>(
    ((evaluationStatuses ?? []) as MyEvaluationStatusRecord[]).map((status) => [status.registration_id, status])
  )
  const rows: MyRegistration[] = ((data ?? []) as MyRegistrationRecord[]).map((r) => ({
    id: r.id,
    activityId: r.activity_id,
    title: r.title || 'Untitled Activity',
    colorBg: r.color_bg || '#1a5c3a',
    status: r.status,
    registeredAt: r.registered_at,
    cancelDeadline: r.cancel_deadline,
    canCancel: Boolean(r.can_cancel),
    refCode: statusByRegistration.get(r.id)?.ref_code || '',
    hasEvaluation: statusByRegistration.get(r.id)?.evaluated || false,
    hasAttended: statusByRegistration.get(r.id)?.attended || false,
    activityStatus: statusByRegistration.get(r.id)?.activity_status || 'upcoming',
    checkInOpensAt: statusByRegistration.get(r.id)?.checkin_opens_at || '',
  }))

  return { ok: true, data: rows }
}

export interface CancelResult {
  ok: boolean
  error?: string
}

/**
 * Withdraws the participant from an activity. The RPC validates ownership,
 * status and deadline, then releases the slot atomically.
 */
export async function cancelRegistration(
  registrationId: string,
  reason?: string
): Promise<CancelResult> {
  const trimmed = reason?.trim().slice(0, CANCELLATION_REASON_MAX_LENGTH)

  const { error } = await supabase.rpc('cancel_registration', {
    p_registration_id: registrationId,
    p_reason: trimmed || null,
  })

  if (error) {
    const code = Object.values(CANCELLATION_ERROR).find((c) => error.message?.includes(c))
    return {
      ok: false,
      error: (code && CANCELLATION_ERROR_MESSAGES[code]) || CANCELLATION_FALLBACK_MESSAGE,
    }
  }

  return { ok: true }
}
