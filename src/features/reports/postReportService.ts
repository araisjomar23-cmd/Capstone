import { supabase } from '../../lib/supabase'
import { createPostReport, type PostReportFields } from './postReportModel'
import type { Activity } from '../../types/activity'

export interface SavedPostReport { fields: PostReportFields; revision: number }

export async function loadPostReport(activity: Activity): Promise<SavedPostReport> {
  const saved = await supabase.from('activity_post_reports').select('fields, revision').eq('activity_id', activity.id).maybeSingle()
  if (saved.error) throw new Error('Unable to load the saved post report: ' + saved.error.message)
  if (saved.data) return saved.data as SavedPostReport
  const [attendance, publication] = await Promise.all([
    supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('activity_id', activity.id).in('status', ['attended', 'completed']),
    activity.proposalId
      ? supabase.from('ppa_publications').select('fields').eq('proposal_id', activity.proposalId).order('published_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (attendance.error || publication.error) throw new Error('Unable to load activity attendance or approved proposal details. Please retry.')
  return { fields: createPostReport(activity, attendance.count ?? 0, publication.data?.fields ?? {}), revision: 0 }
}

export async function savePostReport(activityId: string, report: SavedPostReport): Promise<SavedPostReport> {
  const payload = { fields: report.fields, revision: report.revision + 1, updated_at: new Date().toISOString() }
  const result = report.revision === 0
    ? await supabase.from('activity_post_reports').insert({ activity_id: activityId, ...payload }).select('fields, revision').single()
    : await supabase.from('activity_post_reports').update(payload).eq('activity_id', activityId).eq('revision', report.revision).select('fields, revision').maybeSingle()
  if (result.error?.code === '23505' || (!result.error && !result.data)) throw new Error('Another administrator saved this report. Reload it before editing again; your changes are still shown here.')
  if (result.error) throw new Error('Unable to save post report: ' + result.error.message)
  return result.data as SavedPostReport
}
