import { supabase } from '../../lib/supabase'

export interface PortalNotification {
  id: string
  recipient_id: string
  activity_id: string | null
  kind: 'registration' | 'activity' | 'assignment' | 'attendance' | 'evaluation'
  title: string
  message: string
  link: string
  created_at: string
  read_at: string | null
}

export const NOTIFICATION_PAGE_SIZE = 20

export async function fetchNotifications(userId: string, unreadOnly: boolean, limit: number) {
  let query = supabase.from('notifications').select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(limit + 1)
  if (unreadOnly) query = query.is('read_at', null)
  const { data, error } = await query
  if (error) throw new Error('Notifications could not be loaded. Please try again.')
  const rows = (data ?? []) as PortalNotification[]
  return { items: rows.slice(0, limit), hasMore: rows.length > limit }
}

export async function fetchUnreadCount(userId: string) {
  const { count, error } = await supabase.from('notifications')
    .select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null)
  if (error) throw new Error('Notifications could not be loaded. Please try again.')
  return count ?? 0
}

export async function markNotificationRead(userId: string, id: string) {
  const { data, error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId).eq('id', id).is('read_at', null).select('id')
  if (error) throw new Error('Could not mark the notification as read. Please try again.')
  return data?.length ?? 0
}

export async function markAllNotificationsRead(userId: string, before: string) {
  // Only mark notifications that existed when the user chose this action.
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId).is('read_at', null).lte('created_at', before)
  if (error) throw new Error('Could not mark notifications as read. Please try again.')
}

export function notificationDestination(role: string | null, link: string) {
  // A notification must never redirect out of the signed-in user's portal.
  const allowed = role === 'superadmin'
    ? ['/admin/participants', '/admin/activities', '/admin/evaluations', '/admin/attendance']
    : role === 'facilitator'
      ? ['/admin/facilitator-portal', '/admin/facilitator-portal/participants', '/admin/facilitator-portal/attendance']
      : ['/participant/my-activities', '/participant/evaluations', '/participant']
  return allowed.includes(link) ? link : role === 'superadmin' ? '/admin' : role === 'facilitator' ? '/admin/facilitator-portal' : '/participant'
}
