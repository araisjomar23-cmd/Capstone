import { supabase } from '../../lib/supabase'

export interface AttendanceLogRow {
  id: string
  checkedInAt: string
  dayNumber: number
  method: string
  name: string
  refCode: string
  activityTitle: string
  activityId: string
}

interface AttendanceLogRecord {
  id: string
  checked_in_at: string
  day_number: number
  method: string
  activity_id: string
  registration_id: string
}

interface RegistrationNameRecord {
  id: string
  ref_code: string
  name: string
}

interface ActivityNameRecord {
  id: string
  title: string
}

export async function loadTodayLog(): Promise<AttendanceLogRow[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: logs, error } = await supabase
    .from('attendance_log')
    .select('id, checked_in_at, day_number, method, activity_id, registration_id')
    .gte('checked_in_at', todayStart.toISOString())
    .order('checked_in_at', { ascending: false })

  if (error) {
    console.error('loadTodayLog error:', error.message)
    return []
  }

  const records = (logs || []) as AttendanceLogRecord[]
  const registrationIds = [...new Set(records.map((row) => row.registration_id))]
  const activityIds = [...new Set(records.map((row) => row.activity_id))]
  const [{ data: registrations }, { data: activities }] = await Promise.all([
    registrationIds.length
      ? supabase.from('registration_details').select('id, ref_code, name').in('id', registrationIds)
      : Promise.resolve({ data: [] as RegistrationNameRecord[] }),
    activityIds.length
      ? supabase.from('legacy_activities').select('id, title').in('id', activityIds)
      : Promise.resolve({ data: [] as ActivityNameRecord[] }),
  ])

  const registrationMap = new Map(((registrations || []) as RegistrationNameRecord[]).map((row) => [row.id, row]))
  const activityMap = new Map(((activities || []) as ActivityNameRecord[]).map((row) => [row.id, row.title]))
  return records.map((row) => ({
    id: row.id,
    checkedInAt: row.checked_in_at,
    dayNumber: row.day_number,
    method: row.method,
    name: registrationMap.get(row.registration_id)?.name || '—',
    refCode: registrationMap.get(row.registration_id)?.ref_code || '—',
    activityTitle: activityMap.get(row.activity_id) || '—',
    activityId: row.activity_id,
  }))
}

export interface MarkAttendanceResult {
  status: 'success' | 'error'
  title: string
  body: string
}

interface AttendanceRpcResponse {
  success: boolean
  message: string
  participant_name: string | null
}

export async function markAttendance(
  activityId: string,
  rawRefCode: string,
  dayNumber: number,
  method: 'manual' | 'qr' = 'manual'
): Promise<MarkAttendanceResult> {
  let refCode = rawRefCode.trim()
  try {
    if (/^https?:\/\//i.test(refCode)) {
      const parsed = new URL(refCode)
      refCode = parsed.searchParams.get('ref') || parsed.searchParams.get('code') || parsed.pathname.split('/').filter(Boolean).at(-1) || refCode
    }
  } catch {
    // Treat malformed scanner output as a raw reference code.
  }
  refCode = refCode.trim().toUpperCase()

  if (!activityId) return { status: 'error', title: 'No Activity Selected', body: 'Please choose an activity first.' }
  if (!refCode) return { status: 'error', title: 'No Code Entered', body: 'Paste or scan a participant reference code.' }
  if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) {
    return { status: 'error', title: 'Invalid Day', body: 'Enter a valid event day number (1 or greater).' }
  }

  let data: AttendanceRpcResponse[] | null
  try {
    const response = await supabase.rpc('record_legacy_attendance', {
      p_activity_id: activityId,
      p_ref_code: refCode,
      p_day_number: dayNumber,
      p_method: method,
    })
    if (response.error) return { status: 'error', title: 'Check-In Failed', body: response.error.message }
    data = (response.data || []) as AttendanceRpcResponse[]
  } catch (cause) {
    return { status: 'error', title: 'Check-In Failed', body: cause instanceof Error ? cause.message : 'Unable to reach the attendance service.' }
  }
  const result = (data || [])[0]
  if (!result) return { status: 'error', title: 'Check-In Failed', body: 'The attendance service returned no result.' }
  if (!result.success) {
    const title = result.message.includes('already checked in') ? 'Already Scanned'
      : result.message.includes('different activity') ? 'Wrong Activity'
      : result.message.includes('cancelled') ? 'Registration Cancelled'
      : result.message.includes('not found') ? 'Not Found'
      : 'Check-In Failed'
    return { status: 'error', title, body: result.message }
  }

  return {
    status: 'success',
    title: `${result.participant_name || 'Participant'} — Checked In!`,
    body: `Day ${dayNumber} · ${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`,
  }
}
