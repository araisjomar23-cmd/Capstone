import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, CircleAlert, CheckCircle2 } from 'lucide-react'
import type { DashboardData } from './useDashboardData'
import { getActivityLifecycleStatus, getActivityDisplayStatus } from '../activities/activityLifecycle'
import { activityDateLabel } from '../../lib/activityDatePeriod'

export default function DashboardControlPanel({ data, now }: { data: DashboardData; now: number }) {
  const scheduled = data.acts.filter((a) => a.startDate && a.endDate)
  const ongoing = scheduled.filter((a) => getActivityDisplayStatus(a, now) === 'ongoing')
  const upcoming = scheduled.filter((a) => getActivityDisplayStatus(a, now) === 'upcoming')
  const completed = scheduled.filter((a) => getActivityDisplayStatus(a, now) === 'completed')
  const closed = scheduled.filter((a) => getActivityDisplayStatus(a, now) === 'closed')
  const nextActivities = [...ongoing, ...upcoming].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 4)
  const overBudget = data.acts.filter((a) => a.budgetSpent > a.budgetAlloc)
  const noBudget = [...ongoing, ...upcoming].filter((a) => a.budgetAlloc === 0)
  const full = [...ongoing, ...upcoming].filter((a) => a.slots > 0 && (data.liveCount[a.id] || 0) >= a.slots)
  const alerts = [
    { count: overBudget.length, title: 'Activities over budget', detail: 'Review spending and allocations.', to: '/admin/budget', tone: 'text-red-700 bg-red-50' },
    { count: noBudget.length, title: 'Activities without a budget', detail: 'Upcoming or ongoing activities need an allocation.', to: '/admin/budget', tone: 'text-amber-800 bg-amber-50' },
    { count: full.length, title: 'Activities at capacity', detail: 'Review available slots and registrations.', to: '/admin/activities', tone: 'text-blue-700 bg-blue-50' },
  ].filter((item) => item.count > 0)

  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch gap-4">
        <section className="panel !p-4 sm:!p-5 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800"><CalendarDays size={18} className="text-primary" aria-hidden="true" />Activity overview</h2>
            <Link to="/admin/activities" className="inline-flex items-center gap-1 min-h-11 text-xs font-semibold text-primary">View all <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[{ label: 'Closed', count: closed.length, color: 'bg-gray-100 text-gray-600' }, { label: 'Ongoing', count: ongoing.length, color: 'bg-amber-50 text-amber-800' }, { label: 'Upcoming', count: upcoming.length, color: 'bg-blue-50 text-blue-700' }, { label: 'Completed', count: completed.length, color: 'bg-teal-50 text-teal-700' }].map((item) => (
              <div key={item.label} className={'rounded-xl p-3 ' + item.color}><p className="text-xl font-bold">{item.count}</p><p className="text-[11px] sm:text-xs mt-1">{item.label}</p></div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-2">Ongoing and next scheduled activities</p>
          {nextActivities.length ? <ul className="divide-y divide-gray-100">{nextActivities.map((a) => (
            <li key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <div className="min-w-0"><p className="text-sm font-semibold text-gray-800 break-words">{a.title}</p><p className="text-xs text-gray-500 mt-1">{activityDateLabel(a.startDate, a.endDate)}</p><p className="text-xs text-gray-500 mt-1 break-words">{a.venue || 'Venue to be confirmed'}</p></div>
              <span className={'self-start shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ' + (getActivityLifecycleStatus(a, now) === 'ongoing' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700')}>{getActivityLifecycleStatus(a, now) === 'ongoing' ? 'Ongoing' : 'Upcoming'}</span>
            </li>
          ))}</ul> : <p className="py-6 text-sm text-gray-500 text-center">No upcoming or ongoing activities. Open Activities to plan the next one.</p>}
        </section>
        <section className="panel !p-4 sm:!p-5 min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2"><CircleAlert size={18} className="text-amber-600" aria-hidden="true" />Needs attention</h2>
          <p className="text-xs text-gray-500 mb-4">Items to review based on the latest loaded records.</p>
          {alerts.length ? <ul className="space-y-3">{alerts.map((item) => <li key={item.title}><Link to={item.to} className={'flex items-center gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-primary ' + item.tone}>
            <span className="text-2xl font-bold shrink-0">{item.count}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p><p className="text-xs mt-1">{item.detail}</p></div><ArrowRight size={16} className="shrink-0" aria-hidden="true" />
          </Link></li>)}</ul> : <div className="rounded-xl bg-teal-50 p-5 text-teal-800"><CheckCircle2 size={24} className="mb-2" aria-hidden="true" /><p className="text-sm font-semibold">No budget or capacity issues flagged</p><p className="text-xs mt-1">Review activities and feedback regularly as new records come in.</p></div>}

        </section>
      </div>
    </div>
  )
}
