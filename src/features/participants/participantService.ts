import { supabase } from '../../lib/supabase'
import type { ParticipantAttendance, Registration } from '../../types/registration'

interface AttendanceRecord {
  registration_id: string
  checked_in_at: string
  day_number: number
}

interface ParticipantRegistrationRow {
  id: string
  ref_code: string | null
  activity_id: string
  name: string | null
  age: number | null
  gender_identity: string | null
  contact: string | null
  barangay: string | null
  organization: string | null
  status: Registration['status'] | null
  registered_at: string
  attended_at: string | null
  notes: string | null
  sectoral_group: string | null
  legacy_activities: {
    title: string | null
    date_text: string | null
    venue: string | null
    programs: { name: string | null }[]
  }[]
}

export async function fetchParticipants(): Promise<Registration[]> {
  const { data, error } = await supabase
    .from('registration_details')
    .select(`
      id, ref_code, activity_id,
      name, age, gender_identity, contact, barangay, organization,
      status, registered_at, attended_at, notes, sectoral_group,
      legacy_activities (
        id, title, date_text, venue,
        programs ( name )
      )
    `)
    .order('registered_at', { ascending: false })

  if (error) {
    console.error('fetchParticipants error:', error.message)
    return []
  }

  const registrations = (data || []) as ParticipantRegistrationRow[]
  const registrationIds = registrations.map((row) => row.id)
  let attendanceByRegistration = new Map<string, ParticipantAttendance[]>()
  if (registrationIds.length) {
    const { data: attendanceRows, error: attendanceError } = await supabase
      .from('attendance_log')
      .select('registration_id, checked_in_at, day_number')
      .in('registration_id', registrationIds)
      .order('checked_in_at', { ascending: false })
    if (attendanceError) console.error('fetchParticipantAttendance error:', attendanceError.message)
    attendanceByRegistration = new Map<string, ParticipantAttendance[]>()
    for (const row of (attendanceRows || []) as AttendanceRecord[]) {
      const history = attendanceByRegistration.get(row.registration_id) || []
      history.push({ dayNumber: row.day_number, checkedInAt: row.checked_in_at })
      attendanceByRegistration.set(row.registration_id, history)
    }
  }

  return registrations.map((r) => ({
    id: r.id,
    ref: r.ref_code || '',
    registeredAt: r.registered_at,
    attendedAt: r.attended_at,
    notes: r.notes || '',
    status: r.status || 'registered',
    name: r.name || '—',
    age: r.age ?? '—',
    gender: r.gender_identity || '—',
    contact: r.contact || '—',
    barangay: r.barangay || '—',
    org: r.organization || '',
    activityId: r.activity_id,
    activityTitle: r.legacy_activities[0]?.title ?? '—',
    activityDate: r.legacy_activities[0]?.date_text ?? '—',
    activityVenue: r.legacy_activities[0]?.venue ?? '—',
    program: r.legacy_activities[0]?.programs[0]?.name ?? '—',
    sectoralGroup: r.sectoral_group || 'None',
    attendanceHistory: attendanceByRegistration.get(r.id) || [],
  }))
}

export async function updateStatusInDB(refCode: string, newStatus: string): Promise<boolean> {
  const { error } = await supabase
    .from('registrations')
    .update({ status: newStatus })
    .eq('ref_code', refCode)

  if (error) {
    console.error('updateStatusInDB error:', error.message)
    return false
  }
  return true
}
