import { useEffect, useMemo, useState } from 'react'
import { fetchParticipants } from '../../features/participants/participantService'
import ParticipantModal from '../../features/participants/ParticipantModal'
import type { Registration } from '../../types/registration'
import { Search, Eye, ChevronRight } from 'lucide-react'
import { SkeletonStatCard, SkeletonTableRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const PILL_STYLES: Record<string, string> = {
  registered: 'bg-green-100 text-green-700',
  attended: 'bg-blue-100 text-blue-700',
  completed: 'bg-teal-100 text-teal-700',
  inactive: 'bg-gray-100 text-gray-600',
}

function AdminParticipants() {
  const [all, setAll] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<Registration | null>(null)

 useEffect(() => {
    load()

    const channel = supabase
      .channel(`participants-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => load())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function load() {
    setLoading(true)
    const data = await fetchParticipants()
    setAll(data)
    setLoading(false)
  }

  function handleStatusChange(ref: string, newStatus: string) {
  setAll((prev) =>
    prev.map((p) => (p.ref === ref ? { ...p, status: newStatus as Registration['status'] } : p))
  )
  setSelected((prev) => (prev && prev.ref === ref ? { ...prev, status: newStatus as Registration['status'] } : prev))
}

  const activityOptions = useMemo(() => {
    const seen = new Map<string, string>()
    all.forEach((p) => {
      if (!seen.has(p.activityId)) seen.set(p.activityId, p.activityTitle)
    })
    return Array.from(seen.entries())
  }, [all])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const isAgeQuery = /^\d+$/.test(q)

    return all.filter((p) => {
      let mQ = true
      if (q) {
        mQ = isAgeQuery
          ? String(p.age ?? '') === q
          : p.name.toLowerCase().includes(q) ||
            p.barangay.toLowerCase().includes(q) ||
            p.ref.toLowerCase().includes(q) ||
            p.org.toLowerCase().includes(q) ||
            p.gender.toLowerCase().includes(q) ||
            p.program.toLowerCase().includes(q) ||
            p.activityTitle.toLowerCase().includes(q) ||
            p.contact.includes(q)
      }
      const mA = !activityFilter || String(p.activityId) === activityFilter
      const mS = !statusFilter || p.status === statusFilter
      return mQ && mA && mS
    })
  }, [all, search, activityFilter, statusFilter])

  const countBy = (s: string) => all.filter((p) => p.status === s).length

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Participants</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {loading ? (
          <>
            <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
          </>
        ) : (
          <>
            <StatBox label="Total" value={all.length} barColor="var(--color-primary)" />
            <StatBox label="Registered" value={countBy('registered')} barColor="var(--color-teal)" />
            <StatBox label="Attended" value={countBy('attended')} barColor="var(--color-info)" />
            <StatBox label="Inactive" value={countBy('inactive')} barColor="var(--color-muted)" />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, barangay, ref code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !pl-9"
          />
        </div>
        <select
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 sm:flex-none min-w-[140px]"
        >
          <option value="">All Activities</option>
          {activityOptions.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 sm:flex-none min-w-[140px]"
        >
          <option value="">All Statuses</option>
          <option value="registered">Registered</option>
          <option value="attended">Attended</option>
          <option value="completed">Completed</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {loading ? 'Loading…' : `Showing ${filtered.length} of ${all.length} participants`}
      </p>

      {/* Desktop table view */}
      <div className="panel overflow-x-auto hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Age / Gender</th>
              <th className="text-left px-4 py-3">Barangay</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Activity</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Registered</th>
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
                        icon={<Users size={22} />}
                        title="No participants found"
                        subtitle={search || activityFilter || statusFilter ? 'Try adjusting your filters.' : 'Participants will appear here once youth register for activities.'}/>
                    </td>
                  </tr>
                ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.ref || '—'}</div>
                  </td>
                  <td className="px-4 py-3">{p.age} / {p.gender}</td>
                  <td className="px-4 py-3">{p.barangay}</td>
                  <td className="px-4 py-3">{p.contact}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.activityTitle}</div>
                    <div className="text-xs text-gray-400">{p.program}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${PILL_STYLES[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(p.registeredAt).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(p)}
                      className="inline-flex items-center gap-1 text-primary text-xs font-semibold hover:underline"
                    >
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="panel !p-4 h-24 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<Users size={22} />}
              title="No participants found"
              subtitle={search || activityFilter || statusFilter ? 'Try adjusting your filters.' : 'Participants will appear here once youth register for activities.'}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="panel !p-4 w-full text-left active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.ref || '—'}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${PILL_STYLES[p.status] || 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-600 mb-2">
                  <div><span className="text-gray-400">Age/Gender: </span>{p.age} / {p.gender}</div>
                  <div><span className="text-gray-400">Barangay: </span>{p.barangay}</div>
                  <div className="col-span-2"><span className="text-gray-400">Contact: </span>{p.contact}</div>
                </div>

                <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-800 truncate">{p.activityTitle}</div>
                    <div className="text-[11px] text-gray-400">
                      {new Date(p.registeredAt).toLocaleDateString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <ParticipantModal
          participant={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}

function StatBox({ label, value, barColor }: { label: string; value: number; barColor: string }) {
  return (
    <div className="stat-card !p-4">
      <div className="stat-accent-bar" style={{ background: barColor }} />
      <div className="stat-label !mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

export default AdminParticipants