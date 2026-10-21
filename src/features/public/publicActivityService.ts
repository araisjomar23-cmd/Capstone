import { supabase } from '../../lib/supabase'
import { getActivityLifecycleStatus, type ActivityLifecycleStatus } from '../activities/activityLifecycle'

export interface PublicActivity {
  id: string
  programId: string
  programName: string
  title: string
  colorBg: string
  tags: string[]
  status: string
  lifecycleStatus: ActivityLifecycleStatus
  slots: number
  taken: number
  venue: string
  date: string
  time: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  previewDesc: string
  fullDesc: string
  outcomes: string[]
  schedule: string[]
  bring: string[]
  note: string
}

function formatDateRange(startDate?: string, endDate?: string): string {
  if (!startDate) return '—'
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return startDate === endDate
  ? fmt(startDate)
  : `${fmt(startDate)} – ${fmt(endDate ?? startDate)}`
}

function formatTimeRange(startTime?: string, endTime?: string): string {
  if (!startTime) return ''
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, '0')} ${period}`
  }
  return endTime ? `${fmt(startTime)} – ${fmt(endTime)}` : fmt(startTime)
}

export async function fetchPublicActivities(): Promise<PublicActivity[]> {
  const { data, error } = await supabase
    .from('legacy_activities')
    .select(`
  id, program_id, title, color_bg, tags,
  status, slots, start_date, end_date, start_time, end_time, venue,
  preview_desc, full_desc, outcomes, schedule, bring, note,
  programs ( id, name )
`)
    .not('status', 'eq', 'closed')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Unable to load public activities: ${error.message}`)
  }

  const { data: regRows, error: countError } = await supabase
    .from('public_legacy_activity_counts')
    .select('activity_id, registration_count')
  if (countError) {
    throw new Error(`Unable to load activity registration counts: ${countError.message}`)
  }

  const regMap: Record<string, number> = {}
  ;(regRows || []).forEach((r) => {
    regMap[r.activity_id] = r.registration_count
  })

  return (data || []).map((a: any) => ({
    id: a.id,
    programId: a.program_id,
    programName: a.programs?.name || '—',
    title: a.title || '',
    colorBg: a.color_bg || '',
    tags: a.tags || [],
    status: a.status || 'open',
    lifecycleStatus: getActivityLifecycleStatus({
      startDate: a.start_date,
      endDate: a.end_date,
      startTime: a.start_time,
      endTime: a.end_time,
    }),
    slots: a.slots || 0,
    taken: regMap[a.id] || 0,
    venue: a.venue || '—',
    date: formatDateRange(a.start_date, a.end_date),
    time: formatTimeRange(a.start_time, a.end_time),
    startDate: a.start_date,
    endDate: a.end_date,
    startTime: a.start_time,
    endTime: a.end_time,
    previewDesc: a.preview_desc || '',
    fullDesc: a.full_desc || '',
    outcomes: a.outcomes || [],
    schedule: a.schedule || [],
    bring: a.bring || [],
    note: a.note || '',
  }))
}
