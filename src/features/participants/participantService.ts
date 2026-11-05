import { getActivityDisplayStatus } from '../activities/activityLifecycle'
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
  status: string | null
  manually_closed: boolean | null
  start_time: string | null
  end_time: string | null
  start_date: string | null
  end_date: string | null
  date_text: string | null
  venue: string | null
  programs: ProgramRecord | ProgramRecord[] | null
}

interface ParticipantRegistrationRow {
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  suffix: string | null
  city_municipality: string | null
  province: string | null
  id: string
  user_uuid: string
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

export async function fetchParticipants(strict = false): Promise<Registration[]> {
  const { data, error } = await supabase
    .from('registration_details')
    .select(`
      id, user_uuid, ref_code, activity_id,
      name, age, gender_identity, contact, barangay, organization,
      first_name, middle_name, last_name, suffix, city_municipality, province,
      status, registered_at, attended_at, notes, sectoral_group,
      legacy_activities (
        id, title, start_date, end_date, start_time, end_time, status, manually_closed, date_text, venue,
        programs ( name )
      )
    `)
    .order('registered_at', { ascending: false })

  if (error) {
    if (strict) throw new Error('Unable to load registrations: ' + error.message)
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
    if (strict && attendanceError) throw new Error('Unable to load attendance: ' + attendanceError.message)
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
      userUuid: r.user_uuid,
      firstName: r.first_name || '',
      middleName: r.middle_name || '',
      lastName: r.last_name || '',
      suffix: r.suffix || '',
      cityMunicipality: r.city_municipality || '',
      province: r.province || '',
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
      activityStatus: activity ? getActivityDisplayStatus({ status: activity.status || 'open', manuallyClosed: activity.manually_closed === true, startDate: activity.start_date || '', endDate: activity.end_date || '', startTime: activity.start_time, endTime: activity.end_time }) : undefined,
      activityStartDate: activity?.start_date || undefined,
      activityEndDate: activity?.end_date || undefined,
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
      .select('user_uuid, email, first_name, middle_name, last_name, suffix, birthday, age, gender_identity, contact, barangay, city_municipality, province, organization, youth_classification, sectoral_group, created_at'),
  ])

  if (profilesResult.error) {
    console.error('fetchAdminParticipantProfiles error:', profilesResult.error.message)
    return registered
  }

  const profiles = profilesResult.data || []
  const profileByUser = new Map(profiles.map((profile) => [profile.user_uuid, profile]))
  const enrichedRegistrations = registered.map((registration) => {
    const profile = registration.userUuid ? profileByUser.get(registration.userUuid) : undefined
    return profile ? {
      ...registration,
      name: [profile.first_name, profile.middle_name, profile.last_name, profile.suffix].filter(Boolean).join(' ') || registration.name,
      age: profile.age ?? '—',
      gender: profile.gender_identity || '—',
      contact: profile.contact || '—',
      barangay: profile.barangay || '—',
      org: profile.organization || '',
      firstName: profile.first_name || '',
      middleName: profile.middle_name || '',
      lastName: profile.last_name || '',
      suffix: profile.suffix || '',
      email: profile.email || '',
      birthday: profile.birthday,
      cityMunicipality: profile.city_municipality || '',
      province: profile.province || '',
      youthClassification: profile.youth_classification || '',
      sectoralGroup: profile.sectoral_group || 'None',
    } : registration
  })

  const registeredUsers = new Set<string>()
  const { data: registrationUsers, error: registrationUsersError } = await supabase
    .from('registrations')
    .select('user_uuid')
  if (registrationUsersError) console.error('fetchAdminRegistrationUsers error:', registrationUsersError.message)
  for (const row of registrationUsers || []) registeredUsers.add(row.user_uuid)

  const unregisteredProfiles = profiles
    .filter((profile) => !registeredUsers.has(profile.user_uuid))
    .map((profile): Registration => ({
      id: `profile:${profile.user_uuid}`,
      ref: '',
      email: profile.email || '',
      birthday: profile.birthday,
      cityMunicipality: profile.city_municipality || '',
      province: profile.province || '',
      youthClassification: profile.youth_classification || '',
      userUuid: profile.user_uuid,
      registeredAt: profile.created_at,
      attendedAt: null,
      notes: '',
      status: 'not_registered',
      name: [profile.first_name, profile.middle_name, profile.last_name, profile.suffix].filter(Boolean).join(' ') || profile.email || 'Participant',
      firstName: profile.first_name || '',
      middleName: profile.middle_name || '',
      lastName: profile.last_name || '',
      suffix: profile.suffix || '',
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

  return [...unregisteredProfiles, ...enrichedRegistrations]
}



