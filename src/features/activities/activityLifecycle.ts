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
