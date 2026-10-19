import { useEffect, useMemo, useState } from 'react'
import type { Activity } from '../../types/activity'
import ActivityFormModal from '../../features/activities/ActivityFormModal'
import { Plus, Pencil, RotateCcw, XCircle } from 'lucide-react'
import { fetchActivities, toggleActivityStatus, autoCloseExpiredActivities } from '../../features/activities/activityService'
import { useToast } from '../../components/ToastProvider'
import { SkeletonTableRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { Pin as PinIcon } from 'lucide-react'
import { getActivityLifecycleStatus, type ActivityLifecycleStatus } from '../../features/activities/activityLifecycle'

const STATUS_PILL: Record<string, { cls: string; label: string }> = {
  open: { cls: 'bg-green-100 text-green-700', label: 'Open' },
  upcoming: { cls: 'bg-blue-100 text-blue-700', label: 'Upcoming' },
  full: { cls: 'bg-red-100 text-red-700', label: 'Full' },
  closed: { cls: 'bg-gray-100 text-gray-600', label: 'Closed' },
}
const LIFECYCLE_PILL: Record<ActivityLifecycleStatus, { cls: string; label: string }> = {
  upcoming: { cls: 'bg-blue-50 text-blue-700', label: 'Upcoming' },
  ongoing: { cls: 'bg-amber-50 text-amber-700', label: 'Ongoing' },
  completed: { cls: 'bg-teal-50 text-teal-700', label: 'Completed' },
}

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
  const { showToast } = useToast()
  const [all, setAll] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [programFilter, setProgramFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)

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
  setLoading(true)
  await autoCloseExpiredActivities()
  const data = await fetchActivities()
  setAll(data)
  setLoading(false)
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
      const mS = !statusFilter || a.status === statusFilter
      return mP && mS
    })
  }, [all, programFilter, statusFilter])

async function handleToggle(a: Activity) {
  const wasClosed = a.status === 'closed'
  const ok = await toggleActivityStatus(a.id, a.status, a.endDate)
  if (ok) {
    showToast(wasClosed ? 'Activity reopened.' : 'Activity closed.', 'success')
    load()
  } else {
    showToast('Failed to update activity status.', 'error')
  }
}

  function openCreateForm() {
  setEditingActivity(null)
  setFormOpen(true)
}

  function openEditForm(a: Activity) {
  setEditingActivity(a)
  setFormOpen(true)
}

  function handleSaved() {
  load()
}

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
      <h1 className="text-2xl font-bold text-primary">Activities</h1>
      <button onClick={openCreateForm} className="btn-primary inline-flex items-center justify-center gap-1.5">
        <Plus size={16} /> Create New Activity
      </button>
    </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="input !w-auto flex-1 sm:flex-none min-w-[140px]"
        >
          <option value="">All Programs</option>
          {programOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 sm:flex-none min-w-[140px]"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="upcoming">Upcoming</option>
          <option value="full">Full</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {loading
          ? 'Loading…'
          : filtered.length === all.length
          ? `${all.length} ${all.length === 1 ? 'activity' : 'activities'}`
          : `Showing ${filtered.length} of ${all.length} activities`}
      </p>

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
              <th className="text-left px-4 py-3">Status</th>
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
                        subtitle={programFilter || statusFilter ? 'Try adjusting your filters.' : 'Click "Create New Activity" to get started.'}/>
                    </td>
                  </tr>
                ) : (
              filtered.map((a) => {
                const pct = a.slots > 0 ? Math.min(100, Math.round((a.regCount / a.slots) * 100)) : 0
                const pill = STATUS_PILL[a.status] || { cls: 'bg-gray-100 text-gray-600', label: a.status }
                const lifecycle = LIFECYCLE_PILL[getActivityLifecycleStatus(a)]
                const bPct = a.budgetAlloc > 0 ? Math.round((a.budgetSpent / a.budgetAlloc) * 100) : 0

                return (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.title}</div>
                      <div className="text-xs text-gray-400">{a.venue}</div>
                      <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${lifecycle.cls}`}>{lifecycle.label}</span>
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
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${pill.cls}`}>
                        {pill.label}
                      </span>
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
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEditForm(a)}
                        className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold hover:underline">
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={() => handleToggle(a)}
                        className="inline-flex items-center gap-1 text-primary text-xs font-semibold hover:underline">
                        {a.status === 'closed' ? <RotateCcw size={12} /> : <XCircle size={12} />}
                        {a.status === 'closed' ? 'Reopen' : 'Close'}
                      </button>
                    </div>
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
              subtitle={programFilter || statusFilter ? 'Try adjusting your filters.' : 'Click "Create New Activity" to get started.'}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => {
              const pct = a.slots > 0 ? Math.min(100, Math.round((a.regCount / a.slots) * 100)) : 0
              const pill = STATUS_PILL[a.status] || { cls: 'bg-gray-100 text-gray-600', label: a.status }
              const lifecycle = LIFECYCLE_PILL[getActivityLifecycleStatus(a)]
              const bPct = a.budgetAlloc > 0 ? Math.round((a.budgetSpent / a.budgetAlloc) * 100) : 0

              return (
                <div key={a.id} className="panel !p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{a.title}</div>
                      <div className="text-xs text-gray-400">{a.venue}</div>
                      <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${lifecycle.cls}`}>{lifecycle.label}</span>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${pill.cls}`}>
                      {pill.label}
                    </span>
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

                  <div className="flex gap-2 border-t border-gray-100 pt-3">
                    <button
                      onClick={() => openEditForm(a)}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-amber-600 text-xs font-semibold border border-amber-200 rounded-lg py-2"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleToggle(a)}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-primary text-xs font-semibold border border-primary/20 rounded-lg py-2"
                    >
                      {a.status === 'closed' ? <RotateCcw size={12} /> : <XCircle size={12} />}
                      {a.status === 'closed' ? 'Reopen' : 'Close'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <ActivityFormModal
          editingActivity={editingActivity}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

export default AdminActivities
