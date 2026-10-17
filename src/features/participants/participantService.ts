import { supabase } from '../../lib/supabase'
import type { Registration } from '../../types/registration'

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

  return (data || []).map((r: any) => ({
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
    activityTitle: r.legacy_activities?.title ?? '—',
    activityDate: r.legacy_activities?.date_text ?? '—',
    activityVenue: r.legacy_activities?.venue ?? '—',
    program: r.legacy_activities?.programs?.name ?? '—',
    sectoralGroup: r.sectoral_group || 'None',
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