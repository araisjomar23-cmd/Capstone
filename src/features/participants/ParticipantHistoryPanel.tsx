import type { Registration } from '../../types/registration'
import { participationTotals } from './participationHistory'
import { activityDateLabel } from '../../lib/activityDatePeriod'
import { ACTIVITY_STATUS_DISPLAY } from '../activities/activityLifecycle'

function timestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

export default function ParticipantHistoryPanel({ rows }: { rows: Registration[] }) {
  const totals = participationTotals(rows)
  return <section aria-labelledby="participant-history-title" className="min-w-0">
    <h3 id="participant-history-title" className="text-base font-bold text-gray-900">Participation across programs</h3>
    <p className="mt-1 text-xs text-gray-500">All loaded activity registrations for this youth, including history outside the directory filters. Times use Manila time.</p>
    <dl className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
      ['Registrations', totals.registrations], ['Programs', totals.programs], ['Attended / completed', totals.attended], ['Absent', totals.absent],
    ].map(([label, value]) => <div key={label} className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-600">{label}</dt><dd className="mt-1 text-lg font-bold text-gray-900">{value}</dd></div>)}</dl>
    {rows.length ? <ol className="space-y-3">{rows.map(row => <li key={row.id} className="min-w-0 rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words text-sm font-semibold text-gray-900">{row.activityTitle}</h4><p className="mt-1 break-words text-xs text-primary">{row.program}</p></div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${row.status === 'absent' ? 'bg-red-50 text-red-700' : row.status === 'attended' || row.status === 'completed' ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{row.status}</span></div>
      <p className="mt-2 text-xs text-gray-600">{activityDateLabel(row.activityStartDate, row.activityEndDate)}</p>
      {row.activityStatus && <p className="mt-1 text-xs text-gray-600">Activity: {ACTIVITY_STATUS_DISPLAY[row.activityStatus].label}</p>}
      <p className="mt-1 break-words text-xs text-gray-600">Reference: {row.ref || 'Unavailable'} · Registered: {timestamp(row.registeredAt)}</p>
      {row.attendanceHistory.length ? <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-700">{row.attendanceHistory.map((entry, index) => <li key={`${entry.checkedInAt}-${entry.dayNumber}-${index}`}>Day {entry.dayNumber} · {timestamp(entry.checkedInAt)}</li>)}</ul>
        : <p className="mt-3 text-xs text-gray-500">{row.attendedAt ? `Attendance recorded: ${timestamp(row.attendedAt)}` : 'No check-ins recorded.'}</p>}
    </li>)}</ol> : <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">No activity registrations for this youth yet.</p>}
  </section>
}
