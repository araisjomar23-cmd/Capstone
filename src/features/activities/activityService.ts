import { supabase } from '../../lib/supabase'
import type { Activity } from '../../types/activity'
import type { Program } from '../../types/program'
import type { Facilitator } from '../../types/facilitator'
import { getActivityLifecycleStatus } from './activityLifecycle'

function formatDateRange(startDate?: string, endDate?: string): string {
  if (!startDate) return '—'
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return !endDate || startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`
}

export async function autoCloseExpiredActivities(): Promise<void> {
  const { error } = await supabase.rpc('close_expired_legacy_activities')
  if (error) throw new Error(`Unable to update expired activities: ${error.message}`)
}

export async function fetchActivities(): Promise<Activity[]> {
  const { data: acts, error: actsErr } = await supabase
    .from('legacy_activities')
    .select(`
      id, program_id, title, color_bg, tags,
      status, slots, taken,
      start_date, end_date, start_time, end_time, checkin_early_access_minutes,
      venue, preview_desc, full_desc,
      outcomes, schedule, bring, note,
      created_at, updated_at,
      programs ( id, name )
    `)
    .order('created_at', { ascending: false })

  if (actsErr) {
    console.error('fetchActivities error:', actsErr)
    return []
  }

  const { data: budgetRows } = await supabase
    .from('budget_entries')
    .select('activity_id, amount, entry_type')

  const budgetMap: Record<string, { allocated: number; spent: number }> = {}
  ;(budgetRows || []).forEach((b) => {
    const id = b.activity_id
    const amt = Number(b.amount) || 0
    if (!budgetMap[id]) budgetMap[id] = { allocated: 0, spent: 0 }
    if (b.entry_type === 'allocation') budgetMap[id].allocated += amt
    if (b.entry_type === 'expense') budgetMap[id].spent += amt
  })

  const { data: regRows } = await supabase
    .from('registrations')
    .select('activity_id, status')

  const regMap: Record<string, number> = {}
  ;(regRows || []).forEach((r) => {
    if (r.status !== 'inactive') regMap[r.activity_id] = (regMap[r.activity_id] || 0) + 1
  })

  return (acts || []).map((a: any) => ({
    id: a.id,
    programId: a.program_id,
    programName: a.programs?.name || '—',
    title: a.title || '',
    colorBg: a.color_bg || '',
    tags: a.tags || [],
    status: a.status || 'open',
    slots: a.slots || 0,
    taken: a.taken || 0,
    regCount: regMap[a.id] || 0,
    venue: a.venue || '—',
    startDate: a.start_date,
    endDate: a.end_date,
    startTime: a.start_time,
    endTime: a.end_time,
    checkInEarlyAccessMinutes: a.checkin_early_access_minutes ?? 30,
    previewDesc: a.preview_desc || '',
    fullDesc: a.full_desc || '',
    outcomes: a.outcomes || [],
    schedule: a.schedule || [],
    bring: a.bring || [],
    note: a.note || '',
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    budgetAlloc: budgetMap[a.id]?.allocated || 0,
    budgetSpent: budgetMap[a.id]?.spent || 0,
    date: formatDateRange(a.start_date, a.end_date),
  }))
}

export async function toggleActivityStatus(
  id: string,
  currentStatus: string,
  currentEndDate?: string
): Promise<boolean> {
  const isReopening = currentStatus === 'closed'
  const newStatus = isReopening ? 'open' : 'closed'

  const now = new Date()
  const todayDate = now.toISOString().slice(0, 10)
  const nowTime = now.toTimeString().slice(0, 5)

  const updatePayload: Record<string, any> = { status: newStatus }

  if (isReopening) {
    updatePayload.start_date = todayDate
    updatePayload.start_time = nowTime
    if (!currentEndDate || currentEndDate < todayDate) {
      updatePayload.end_date = todayDate
    }
  }

  const { error } = await supabase.from('legacy_activities').update(updatePayload).eq('id', id)

  if (error) {
    console.error('toggleActivityStatus error:', error.message)
    return false
  }

  return true
}

export async function fetchPrograms(): Promise<Program[]> {
  const { data, error } = await supabase.from('programs').select('id, name').order('name')
  if (error) {
    console.error('fetchPrograms error:', error.message)
    return []
  }
  return data || []
}

export async function fetchFacilitators(): Promise<Facilitator[]> {
  const { data, error } = await supabase
    .from('facilitators')
    .select('id, name, initials')
    .order('name')
  if (error) {
    console.error('fetchFacilitators error:', error.message)
    return []
  }
  return (data || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    initials: f.initials || f.name.charAt(0).toUpperCase(),
  }))
}

export async function fetchActivityFacilitators(activityId: string): Promise<Facilitator[]> {
  const { data, error } = await supabase
    .from('activity_facilitators')
    .select('facilitator_id, facilitators(id, name, initials)')
    .eq('activity_id', activityId)

  if (error) {
    console.warn('fetchActivityFacilitators error:', error.message)
    return []
  }

  return (data || []).map((r: any) => ({
    id: r.facilitators.id,
    name: r.facilitators.name,
    initials: r.facilitators.initials,
  }))
}

function formatDateText(startDate: string, endDate: string): string {
  if (!startDate) return ''
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`
}

export interface ActivityFormPayload {
  title: string
  programId: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  checkInEarlyAccessMinutes: number
  slots: number
  status?: string
  venue: string
  previewDesc: string
  fullDesc: string
  colorBg: string
  note: string
  budget: number
}

export async function saveActivity(
  payload: ActivityFormPayload,
  facilitators: Facilitator[],
  editingId: string | null
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const dbPayload = {
    title: payload.title,
    program_id: payload.programId,
    start_date: payload.startDate,
    end_date: payload.endDate,
    start_time: payload.startTime,
    end_time: payload.endTime,
    checkin_early_access_minutes: payload.checkInEarlyAccessMinutes,
    date_text: formatDateText(payload.startDate, payload.endDate),
    slots: payload.slots,
    status: payload.status || (() => {
      const lifecycle = getActivityLifecycleStatus({
        startDate: payload.startDate,
        endDate: payload.endDate,
        startTime: payload.startTime,
        endTime: payload.endTime,
      })
      return lifecycle === 'upcoming' ? 'upcoming' : lifecycle === 'ongoing' ? 'open' : 'closed'
    })(),
    venue: payload.venue,
    preview_desc: payload.previewDesc,
    full_desc: payload.fullDesc,
    color_bg: payload.colorBg || '',
    note: payload.note,
  }

  let activityId = editingId

  if (editingId) {
    const { error } = await supabase.from('legacy_activities').update(dbPayload).eq('id', editingId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: inserted, error } = await supabase
      .from('legacy_activities')
      .insert(dbPayload)
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    activityId = inserted.id
  }

  if (!activityId) return { ok: false, error: 'Missing activity id after save.' }

  if (editingId) {
    await supabase
      .from('budget_entries')
      .delete()
      .eq('activity_id', activityId)
      .eq('entry_type', 'allocation')
  }
  if (payload.budget > 0) {
    await supabase.from('budget_entries').insert({
      activity_id: activityId,
      category: 'Initial Budget',
      description: 'Allocated budget set on activity creation',
      amount: payload.budget,
      entry_type: 'allocation',
      recorded_at: new Date().toISOString(),
    })
  }

  await supabase.from('activity_facilitators').delete().eq('activity_id', activityId)
  for (const f of facilitators) {
    await supabase
      .from('activity_facilitators')
      .insert({ activity_id: activityId, facilitator_id: f.id })
  }

  return { ok: true, id: activityId }
}
