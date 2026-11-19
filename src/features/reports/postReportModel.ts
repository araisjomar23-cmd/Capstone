import type { Activity } from '../../types/activity'

export interface PostReportFields {
  date: string
  title: string
  venue: string
  beneficiaries: string
  target: string
  attended: string
  allocation: string
  highlights: string
  office: string
  background: string
  objectives: string
  preparedName: string
  preparedPosition: string
  notedName: string
  notedPosition: string
}

export function createPostReport(activity: Activity, attended: number, published: Record<string, unknown> = {}): PostReportFields {
  const text = (key: string) => typeof published[key] === 'string' ? published[key] as string : ''
  return {
    date: activity.date, title: activity.title, venue: activity.venue,
    beneficiaries: text('beneficiaries'), target: String(activity.slots), attended: String(attended),
    allocation: String(activity.budgetAlloc), highlights: '',
    office: text('implementingOffice') || 'City Youth Development Office',
    background: text('rationale') || activity.fullDesc, objectives: text('objectives'),
    preparedName: '', preparedPosition: '', notedName: '', notedPosition: '',
  }
}

export function postReportIssues(fields: PostReportFields) {
  return (Object.keys(postReportLabels) as (keyof PostReportFields)[]).flatMap(key => {
    const issue = postReportFieldIssue(fields, key)
    return issue ? [!fields[key]?.trim() ? postReportLabels[key] : `${postReportLabels[key]}: ${issue}`] : []
  })
}

export function postReportFieldIssue(fields: PostReportFields, key: keyof PostReportFields) {
  if (!fields[key]?.trim()) return 'This field is required.'
  if (key === 'target' || key === 'attended' || key === 'allocation') {
    const valid = key === 'allocation' ? /^\d+(\.\d{1,2})?$/.test(fields[key]) : /^\d+$/.test(fields[key])
    if (!valid || !Number.isFinite(Number(fields[key]))) return `Enter a nonnegative ${key === 'allocation' ? 'amount with up to two decimal places' : 'whole number'}.`
  }
  return null
}

export const postReportLabels: Record<keyof PostReportFields, string> = {
  date: 'Date', title: 'Event Title', venue: 'Venue', beneficiaries: 'Beneficiaries',
  target: 'No. of Target Participants', attended: 'Number of Actual Attendees', allocation: 'Budget Allocation (PHP)',
  highlights: 'Highlight of the Activity', office: 'Implementing Office', background: 'Background of the Activity',
  objectives: 'Objectives', preparedName: 'Prepared by — name', preparedPosition: 'Prepared by — position',
  notedName: 'Noted by — name', notedPosition: 'Noted by — position',
}
