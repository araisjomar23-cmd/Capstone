export type ActivityLifecycleStatus = 'upcoming' | 'ongoing' | 'completed'

function activityTimestamp(date: string, time: string | null | undefined, fallbackTime: string): number {
  return new Date(`${date}T${time || fallbackTime}+08:00`).getTime()
}

export function getActivityLifecycleStatus(
  activity: { startDate: string; endDate: string; startTime?: string | null; endTime?: string | null },
  now = Date.now()
): ActivityLifecycleStatus {
  const startsAt = activityTimestamp(activity.startDate, activity.startTime, '00:00:00')
  const endsAt = activityTimestamp(activity.endDate, activity.endTime, '23:59:59.999')
  if (now < startsAt) return 'upcoming'
  if (now > endsAt) return 'completed'
  return 'ongoing'
}

export function formatActivityCheckInOpensAt(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export const ACTIVITY_LIFECYCLE_DISPLAY: Record<ActivityLifecycleStatus, { label: string; cls: string }> = {
  upcoming: { label: 'Upcoming', cls: 'bg-blue-50 text-blue-700' },
  ongoing: { label: 'Ongoing', cls: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-teal-50 text-teal-700' },
}

export type ActivityDisplayStatus = ActivityLifecycleStatus | 'closed'
export const ACTIVITY_STATUS_DISPLAY: Record<ActivityDisplayStatus, { label: string; cls: string }> = {
  ...ACTIVITY_LIFECYCLE_DISPLAY,
  closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-600' },
}

type ScheduledActivity = { startDate: string; endDate: string; startTime?: string | null; endTime?: string | null; status: string; manuallyClosed?: boolean }

export function getActivityDisplayStatus(activity: ScheduledActivity, now = Date.now()): ActivityDisplayStatus {
  if (activity.manuallyClosed) return 'closed'
  const lifecycle = getActivityLifecycleStatus(activity, now)
  if (lifecycle === 'completed') return 'completed'
  return activity.status === 'closed' ? 'closed' : lifecycle
}

export function isActivityVisibleInCatalog(activity: ScheduledActivity, now = Date.now()): boolean {
  const status = getActivityDisplayStatus(activity, now)
  return status === 'upcoming' || status === 'ongoing'
}
