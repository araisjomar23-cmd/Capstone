import { useId, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { ActivityRegistrationsChart, BudgetOverviewChart, ActivitySatisfactionChart } from './DashboardCharts'
import type { DashboardData } from './useDashboardData'

const views = [{ id: 'registrations', label: 'Registrations' }, { id: 'budget', label: 'Budget' }, { id: 'satisfaction', label: 'Satisfaction' }] as const

export default function DashboardComparisons({ data }: { data: DashboardData }) {
  const [selected, setSelected] = useState<typeof views[number]['id']>('registrations')
  const id = useId()
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % views.length : event.key === 'ArrowLeft' ? (index + views.length - 1) % views.length : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setSelected(views[next].id)
    document.getElementById(`${id}-${views[next].id}`)?.focus()
  }
  return <section className="dashboard-comparison min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Activity comparisons">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-4 sm:p-5">
      <h2 className="text-sm font-bold text-slate-900">Compare activities</h2>
      <div role="tablist" aria-label="Activity comparison view" className="grid w-full grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 sm:w-auto sm:min-w-80">
        {views.map((view, index) => <button key={view.id} id={`${id}-${view.id}`} type="button" role="tab" aria-selected={selected === view.id} aria-controls={`${id}-panel`} tabIndex={selected === view.id ? 0 : -1} onClick={() => setSelected(view.id)} onKeyDown={event => moveTab(event, index)} className={`min-h-10 rounded-md px-2 text-xs font-semibold transition-colors ${selected === view.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{view.label}</button>)}
      </div>
    </header>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${selected}`} tabIndex={0} className="max-h-[28rem] min-w-0 overflow-y-auto">
      {selected === 'registrations' ? <ActivityRegistrationsChart data={data.activityRegistrations} /> : selected === 'budget' ? <BudgetOverviewChart data={data.budgetOverview} allocated={data.totalBudgetAllocated} spent={data.totalBudgetSpent} /> : <ActivitySatisfactionChart data={data.activitySatisfaction} />}
    </div>
    <footer className="border-t border-slate-100 px-4 sm:px-5"><Link to={selected === 'budget' ? '/admin/budget' : selected === 'satisfaction' ? '/admin/evaluations' : '/admin/participants'} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-primary">{selected === 'budget' ? 'Manage budgets' : selected === 'satisfaction' ? 'View evaluations' : 'View participants'}<ArrowUpRight size={14} aria-hidden="true" /></Link></footer>
  </section>
}
