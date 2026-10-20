import { supabase } from '../../lib/supabase'
import type { ParticipantAttendance, Registration } from '../../types/registration'

interface AttendanceRecord {
  registration_id: string
  checked_in_at: string
  day_number: number
}

interface ProgramRecord {
  name: string | null
}

interface LegacyActivityRecord {
  id: string
  title: string | null
  date_text: string | null
  venue: string | null
  programs: ProgramRecord | ProgramRecord[] | null
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
  legacy_activities: LegacyActivityRecord | LegacyActivityRecord[] | null
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
  const attendanceByRegistration = new Map<string, ParticipantAttendance[]>()
  if (registrationIds.length) {
    const { data: attendanceRows, error: attendanceError } = await supabase
      .from('attendance_log')
      .select('registration_id, checked_in_at, day_number')
      .in('registration_id', registrationIds)
      .order('checked_in_at', { ascending: false })
    if (attendanceError) console.error('fetchParticipantAttendance error:', attendanceError.message)
    for (const row of (attendanceRows || []) as AttendanceRecord[]) {
      const history = attendanceByRegistration.get(row.registration_id) || []
      history.push({ dayNumber: row.day_number, checkedInAt: row.checked_in_at })
      attendanceByRegistration.set(row.registration_id, history)
    }
  }

  return registrations.map((r) => {
    const activity = Array.isArray(r.legacy_activities) ? r.legacy_activities[0] : r.legacy_activities
    const program = Array.isArray(activity?.programs) ? activity.programs[0] : activity?.programs

    return {
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
      activityId: activity?.id ?? r.activity_id,
      activityTitle: activity?.title ?? '—',
      activityDate: activity?.date_text ?? '—',
      activityVenue: activity?.venue ?? '—',
      program: program?.name ?? '—',
      sectoralGroup: r.sectoral_group || 'None',
      attendanceHistory: attendanceByRegistration.get(r.id) || [],
    }
  })
}

/** Admin directory: includes completed participant profiles with no activity registration yet. */
export async function fetchAdminParticipants(): Promise<Registration[]> {
  const [registered, profilesResult] = await Promise.all([
    fetchParticipants(),
    supabase
      .from('participants')
      .select('user_uuid, email, first_name, middle_name, last_name, suffix, age, gender_identity, contact, barangay, organization, sectoral_group, created_at'),
  ])

  if (profilesResult.error) {
    console.error('fetchAdminParticipantProfiles error:', profilesResult.error.message)
    return registered
  }

  const registeredUsers = new Set<string>()
  const { data: registrationUsers, error: registrationUsersError } = await supabase
    .from('registrations')
    .select('user_uuid')
  if (registrationUsersError) console.error('fetchAdminRegistrationUsers error:', registrationUsersError.message)
  for (const row of registrationUsers || []) registeredUsers.add(row.user_uuid)

  const unregisteredProfiles = (profilesResult.data || [])
    .filter((profile) => !registeredUsers.has(profile.user_uuid))
    .map((profile): Registration => ({
      id: `profile:${profile.user_uuid}`,
      ref: profile.email || '',
      registeredAt: profile.created_at,
      attendedAt: null,
      notes: '',
      status: 'not_registered',
      name: [profile.first_name, profile.middle_name, profile.last_name, profile.suffix].filter(Boolean).join(' ') || profile.email || 'Participant',
      age: profile.age ?? '—',
      gender: profile.gender_identity || '—',
      contact: profile.contact || '—',
      barangay: profile.barangay || '—',
      org: profile.organization || '',
      activityId: '',
      activityTitle: 'Not registered',
      activityDate: '—',
      activityVenue: '—',
      program: '—',
      sectoralGroup: profile.sectoral_group || 'None',
      attendanceHistory: [],
    }))

  return [...unregisteredProfiles, ...registered]
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



