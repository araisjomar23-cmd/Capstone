import { ACTIVITY_STATUS_DISPLAY } from '../../features/activities/activityLifecycle'
import { Search, Users, Printer } from 'lucide-react'
import ActivityDateFilter from '../../components/ActivityDateFilter'
import { currentYearPeriod, matchesDatePeriod, activityDateLabel } from '../../lib/activityDatePeriod'
import { printAttendance } from '../../features/participants/printAttendance'
import { useMyActivityIds } from '../../features/facilitators/useMyActivityIds'
import { fetchParticipants } from '../../features/participants/participantService'
import type { Registration } from '../../types/registration'
import { SkeletonTableRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'

const PILL_STYLES: Record<string, string> = {
  absent: 'bg-red-50 text-red-700',
  registered: 'bg-green-100 text-green-700',
  attended: 'bg-blue-100 text-blue-700',
  completed: 'bg-teal-100 text-teal-700',
  inactive: 'bg-gray-100 text-gray-600',
}

function FacilitatorParticipants() {
  const { activityIds, loading: idsLoading } = useMyActivityIds()
  const [all, setAll] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState(currentYearPeriod)
  const [activityFilter, setActivityFilter] = useState('')

  useEffect(() => {
    if (!idsLoading) load()
  }, [idsLoading, activityIds])

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    const timer = window.setInterval(() => { void loadRef.current() }, 60_000)
    const channel = supabase
      .channel(`facilitator-participants-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => { void loadRef.current() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => loadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_details' }, () => loadRef.current())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_log' }, () => loadRef.current())
      .subscribe()

    return () => {
      window.clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  async function load() {
    setLoading(true)
    const data = await fetchParticipants()
    setAll(data.filter((p) => activityIds.includes(p.activityId)))
    setLoading(false)
  }

  const assigned = useMemo(() => all.filter(p => activityIds.includes(p.activityId)), [all, activityIds])
  const activityOptions = useMemo(() => [...new Map(assigned.map(p => [p.activityId, `${p.activityTitle} (${activityDateLabel(p.activityStartDate, p.activityEndDate)})`])).entries()], [assigned])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assigned.filter(
      (p) =>
        matchesDatePeriod(p.activityStartDate, p.activityEndDate, period) &&
        (!activityFilter || p.activityId === activityFilter) &&
        (!q || p.name.toLowerCase().includes(q) ||
        p.ref.toLowerCase().includes(q) ||
        p.activityTitle.toLowerCase().includes(q))
    ).sort((a, b) => a.name.localeCompare(b.name, 'en-PH', { sensitivity: 'base' }))
  }, [assigned, search, period, activityFilter])
  const busy = loading || idsLoading

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">My Participants</h1>
      <ActivityDateFilter value={period} onChange={setPeriod} showHelp={false}
        dates={assigned.map(p => ({ start: p.activityStartDate, end: p.activityEndDate }))}
        actions={<button type="button" className="btn-primary min-h-11 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={busy || !filtered.length}
          onClick={() => { if (!busy && filtered.length) printAttendance(filtered, period) }}>
          <Printer size={16} aria-hidden="true" /> Print attendance
        </button>} />
      <label className="block text-xs font-medium text-gray-600 mb-4 max-w-md">
        Activity
        <select className="input filter-select mt-1.5" value={activityFilter} onChange={e => setActivityFilter(e.target.value)}>
          <option value="">All assigned activities</option>
          {activityOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </label>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search name, ref code, activity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input !pl-9"
        />
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {busy ? 'Loading…' : `Showing ${filtered.length} of ${assigned.length} participants`}
      </p>

      <div className="panel overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Age / Gender</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Activity</th>
              <th className="text-left px-4 py-3">Registration Status</th>
              <th className="text-left px-4 py-3">Registered</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <SkeletonTableRows cols={6} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={<Users size={22} />}
                    title="No participants found"
                    subtitle={search ? 'Try a different search.' : 'Participants for your assigned activities will appear here.'}
                  />
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.ref || '—'}</div>
                  </td>
                  <td className="px-4 py-3">{p.age} / {p.gender}</td>
                  <td className="px-4 py-3">{p.contact}</td>
                  <td className="px-4 py-3"><div>{p.activityTitle}</div>{p.activityStatus && <span className={"inline-flex mt-1 rounded-full px-2 py-1 text-xs font-medium " + ACTIVITY_STATUS_DISPLAY[p.activityStatus].cls}>{ACTIVITY_STATUS_DISPLAY[p.activityStatus].label}</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${PILL_STYLES[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(p.registeredAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default FacilitatorParticipants
