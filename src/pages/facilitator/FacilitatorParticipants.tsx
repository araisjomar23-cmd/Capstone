import { Search, Users } from 'lucide-react'
import { useMyActivityIds } from '../../features/facilitators/useMyActivityIds'
import { fetchParticipants } from '../../features/participants/participantService'
import type { Registration } from '../../types/registration'
import { SkeletonTableRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'

const PILL_STYLES: Record<string, string> = {
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

  useEffect(() => {
    if (!idsLoading) load()
  }, [idsLoading, activityIds])

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    const channel = supabase
      .channel(`facilitator-participants-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => loadRef.current())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function load() {
    setLoading(true)
    const data = await fetchParticipants()
    setAll(data.filter((p) => activityIds.includes(p.activityId)))
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.ref.toLowerCase().includes(q) ||
        p.activityTitle.toLowerCase().includes(q)
    )
  }, [all, search])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">My Participants</h1>

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
        {loading ? 'Loading…' : `Showing ${filtered.length} of ${all.length} participants`}
      </p>

      <div className="panel overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Age / Gender</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Activity</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Registered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
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
                  <td className="px-4 py-3">{p.activityTitle}</td>
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