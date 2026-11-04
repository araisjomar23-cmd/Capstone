import ActivityDateFilter from '../../components/ActivityDateFilter'
import { currentYearPeriod, matchesDatePeriod } from '../../lib/activityDatePeriod'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Activity } from '../../types/activity'
import ActivityFormModal from '../../features/activities/ActivityFormModal'
import { Plus, Eye } from 'lucide-react'
import { fetchActivities, toggleActivityStatus, autoCloseExpiredActivities } from '../../features/activities/activityService'
import { useToast } from '../../components/ToastProvider'
import { SkeletonTableRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { Pin as PinIcon } from 'lucide-react'
import { getActivityLifecycleStatus, getActivityDisplayStatus, ACTIVITY_STATUS_DISPLAY } from '../../features/activities/activityLifecycle'

const LIFECYCLE_PILL = ACTIVITY_STATUS_DISPLAY

function barColor(pct: number) {
  if (pct >= 85) return 'bg-red-500'
  if (pct >= 60) return 'bg-amber-500'
  return 'bg-green-500'
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

function AdminActivities() {
  const [period, setPeriod] = useState(currentYearPeriod)
  const { showToast } = useToast()
  const [all, setAll] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [programFilter, setProgramFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [repeatActivity, setRepeatActivity] = useState<Activity | null>(null)
  const [lifecycleFilter, setLifecycleFilter] = useState('')
  const [viewingActivityId, setViewingActivityId] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)
  const [loadError, setLoadError] = useState('')
  const loadSequence = useRef(0)
  const viewedActivity = all.find((activity) => activity.id === viewingActivityId) || null

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

 useEffect(() => {
  load()

  const channel = supabase
    .channel(`activities-live-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => load())
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [])

async function load() {
  const sequence = ++loadSequence.current
  setLoading(true)
  setLoadError('')
  try {
    await autoCloseExpiredActivities()
    const data = await fetchActivities(true)
    if (sequence === loadSequence.current) setAll(data)
  } catch (error) {
    if (sequence === loadSequence.current) setLoadError(error instanceof Error ? error.message : 'Unable to load activities. Please try again.')
  } finally {
    if (sequence === loadSequence.current) setLoading(false)
  }
}

  const programOptions = useMemo(() => {
    const seen = new Map<string, string>()
    all.forEach((a) => {
      if (!seen.has(a.programId)) seen.set(a.programId, a.programName)
    })
    return Array.from(seen.entries())
  }, [all])

  const filtered = useMemo(() => {
    return all.filter((a) => {
      const mP = !programFilter || String(a.programId) === programFilter
      return mP && (!lifecycleFilter || getActivityDisplayStatus(a, clockNow) === lifecycleFilter) && matchesDatePeriod(a.startDate, a.endDate, period)
    })
  }, [all, programFilter, period, lifecycleFilter, clockNow])

  const outsidePeriod = all.filter((a) => !matchesDatePeriod(a.startDate, a.endDate, period))
  const outsideYears = [...new Set(outsidePeriod.map((a) => a.startDate?.slice(0, 4)).filter((year) => year && /^\d{4}$/.test(year)))].sort()

async function handleToggle(a: Activity) {
  if (toggling) return
  if (getActivityLifecycleStatus(a) === 'completed') {
    setEditingActivity(null)
    setRepeatActivity(a)
    setFormOpen(true)
    return
  }
  setToggling(true)
  try {
    const wasClosed = a.status === 'closed'
    const ok = await toggleActivityStatus(a.id, a.status)
    if (ok) {
      showToast(wasClosed ? 'Activity reopened.' : 'Activity closed.', 'success')
      await load()
    } else {
      showToast('Failed to update activity status.', 'error')
    }
  } catch {
    showToast('Failed to update activity status. Please try again.', 'error')
  } finally {
    setToggling(false)
  }
}

  function openCreateForm() {
  setViewingActivityId(null)
  setRepeatActivity(null)
  setEditingActivity(null)
  setFormOpen(true)
}

  function openEditForm(a: Activity) {

  setRepeatActivity(null)
  setEditingActivity(a)
  setFormOpen(true)
}

  function handleSaved(saved?: { id: string; startDate: string; endDate: string }) {
    if (saved) {
      setPeriod((current) => matchesDatePeriod(saved.startDate, saved.endDate, current)
        ? current : { year: saved.startDate.slice(0, 4), month: current.month ? saved.startDate.slice(5, 7) : '' })
      setProgramFilter('')
      setLifecycleFilter('')
    }
    void load()
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
      <h1 className="text-2xl font-bold text-primary">Activities</h1>
      <button onClick={openCreateForm} className="btn-primary inline-flex items-center justify-center gap-1.5">
        <Plus size={16} /> Create New Activity
      </button>
    </div>

      {loadError && <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError} <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">Retry</button></div>}
      <ActivityDateFilter value={period} onChange={setPeriod} dates={all.map((a) => ({ start: a.startDate, end: a.endDate }))} />

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-4">
        <div className="relative w-full sm:w-auto sm:min-w-[180px]">
          <select aria-label="Program" value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="input appearance-none !pr-10 min-h-11">
            <option value="">All Programs</option>
            {programOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="relative w-full sm:w-auto sm:min-w-[200px]">
          <select aria-label="Activity status" value={lifecycleFilter} onChange={(e) => setLifecycleFilter(e.target.value)} className="input appearance-none !pr-10 min-h-11">
            <option value="">All Activity Statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {loading
          ? 'Loading…'
          : filtered.length === all.length
          ? `${all.length} ${all.length === 1 ? 'activity' : 'activities'}`
          : `Showing ${filtered.length} of ${all.length} activities`}
      </p>

      {!loading && outsidePeriod.length > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          <span>{outsidePeriod.length} {outsidePeriod.length === 1 ? 'activity is' : 'activities are'} outside the selected date period.</span>
          {outsideYears.map((year) => <button type="button" key={year} onClick={() => { setPeriod({ year, month: '' }); setProgramFilter(''); setLifecycleFilter('') }} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 font-semibold hover:bg-blue-100">View {year}{year === period.year && period.month ? ' (all months)' : ''}</button>)}
        </div>
      )}

      {/* Desktop table view */}
      <div className="panel overflow-x-auto hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Activity</th>
              <th className="text-left px-4 py-3">Program</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Slots</th>
              <th className="text-left px-4 py-3">Fill</th>
              <th className="text-left px-4 py-3">Activity Status</th>
              <th className="text-left px-4 py-3">Budget</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
                <SkeletonTableRows cols={8} />
              ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        icon={<PinIcon size={22} />}
                        title="No activities found"
                        subtitle={programFilter || lifecycleFilter || period.year || period.month ? 'Try adjusting your filters.' : 'Click "Create New Activity" to get started.'}/>
                    </td>
                  </tr>
                ) : (
              filtered.map((a) => {
                const pct = a.slots > 0 ? Math.min(100, Math.round((a.regCount / a.slots) * 100)) : 0
                const lifecycle = LIFECYCLE_PILL[getActivityDisplayStatus(a, clockNow)]
                const bPct = a.budgetAlloc > 0 ? Math.round((a.budgetSpent / a.budgetAlloc) * 100) : 0

                return (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.title}</div>
                      <div className="text-xs text-gray-400">{a.venue}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{a.programName}</td>
                    <td className="px-4 py-3 text-xs">
                      <div>{a.date}</div>
                      {formatTimeRange(a.startTime, a.endTime) && (
                        <div className="text-[11px] text-gray-400">{formatTimeRange(a.startTime, a.endTime)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{a.slots}</td>
                    <td className="px-4 py-3 min-w-[130px]">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{a.regCount}/{a.slots}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${lifecycle.cls}`}>
                          {lifecycle.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {a.budgetAlloc > 0 ? (
                        <>
                          ₱{a.budgetAlloc.toLocaleString()}
                          <div className={bPct >= 80 ? 'text-red-500' : 'text-gray-400'}>
                            {bPct}% used
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                   <td className="px-4 py-3">
                    <button type="button" onClick={() => setViewingActivityId(a.id)} className="inline-flex items-center gap-1 text-primary text-xs font-semibold hover:underline min-h-9">
                      <Eye size={14} /> View
                    </button>
                  </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="panel !p-4 h-32 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<PinIcon size={22} />}
              title="No activities found"
              subtitle={programFilter || lifecycleFilter || period.year || period.month ? 'Try adjusting your filters.' : 'Click "Create New Activity" to get started.'}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => {
              const pct = a.slots > 0 ? Math.min(100, Math.round((a.regCount / a.slots) * 100)) : 0
              const lifecycle = LIFECYCLE_PILL[getActivityLifecycleStatus(a, clockNow)]
              const bPct = a.budgetAlloc > 0 ? Math.round((a.budgetSpent / a.budgetAlloc) * 100) : 0

              return (
                <div key={a.id} className="panel !p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{a.title}</div>
                      <div className="text-xs text-gray-400">{a.venue}</div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${lifecycle.cls}`}>
                        {lifecycle.label}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 mb-3">
                    <span className="text-gray-400">{a.programName}</span>
                    {' · '}
                    {a.date}
                    {formatTimeRange(a.startTime, a.endTime) && (
                      <span className="text-gray-400"> · {formatTimeRange(a.startTime, a.endTime)}</span>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{a.regCount}/{a.slots} slots filled</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {a.budgetAlloc > 0 && (
                    <div className="text-xs text-gray-600 mb-3">
                      Budget: ₱{a.budgetAlloc.toLocaleString()}
                      <span className={bPct >= 80 ? 'text-red-500 ml-1' : 'text-gray-400 ml-1'}>
                        ({bPct}% used)
                      </span>
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-3">
                    <button type="button" onClick={() => setViewingActivityId(a.id)} className="w-full inline-flex items-center justify-center gap-2 text-primary text-sm font-semibold border border-primary/20 rounded-lg min-h-11">
                      <Eye size={16} /> View Activity
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {!formOpen && viewedActivity && (
        <ActivityFormModal
          viewOnly
          editingActivity={viewedActivity}
          onClose={() => setViewingActivityId(null)}
          onEdit={() => openEditForm(viewedActivity)}
          onToggle={() => void handleToggle(viewedActivity)}
          toggling={toggling}
          onSaved={handleSaved}
        />
      )}
      {formOpen && (
        <ActivityFormModal
          editingActivity={editingActivity}
          repeatActivity={repeatActivity}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

export default AdminActivities
