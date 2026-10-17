import { supabase } from '../../lib/supabase'

export async function getMyFacilitatorId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('facilitators')
    .select('id')
    .eq('user_uuid', userId)
    .single()

  if (error || !data) return null
  return data.id
}

export async function getMyAssignedActivityIds(facilitatorId: string): Promise<string[]> {
  const { data } = await supabase
    .from('activity_facilitators')
    .select('activity_id')
    .eq('facilitator_id', facilitatorId)

  return (data || []).map((a: any) => a.activity_id)
}

export interface FacActivityRow {
  id: string
  title: string
  program: string
  date: string
  venue: string
  slots: number
  status: string
}

export interface FacDashboardData {
  activities: FacActivityRow[]
  totalParticipants: number
  totalAttended: number
  upcoming: number
}

export async function fetchFacilitatorDashboard(activityIds: string[]): Promise<FacDashboardData> {
  if (activityIds.length === 0) {
    return { activities: [], totalParticipants: 0, totalAttended: 0, upcoming: 0 }
  }

  const { data: acts } = await supabase
    .from('legacy_activities')
    .select('id, title, date_text, venue, status, slots, programs(name)')
    .in('id', activityIds)
    .order('start_date', { ascending: true })

  const { data: regs } = await supabase
    .from('registrations')
    .select('id, status, activity_id')
    .in('activity_id', activityIds)

  const totalParticipants = regs?.length || 0
  const totalAttended = (regs || []).filter((r: any) => r.status === 'attended' || r.status === 'completed').length
  const upcoming = (acts || []).filter((a: any) => a.status === 'open' || a.status === 'upcoming').length

  const activities: FacActivityRow[] = (acts || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    program: a.programs?.name || '—',
    date: a.date_text || '—',
    venue: a.venue || '—',
    slots: a.slots,
    status: a.status,
  }))

  return { activities, totalParticipants, totalAttended, upcoming }
}