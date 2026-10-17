import { Pin, Users, CheckCircle2, Clock } from 'lucide-react'
import { useMyActivityIds } from '../../features/facilitators/useMyActivityIds'
import { fetchFacilitatorDashboard } from '../../features/facilitators/facilitatorPortalService'
import type { FacDashboardData } from '../../features/facilitators/facilitatorPortalService'
import { SkeletonStatCard, SkeletonTableRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_PILL: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  upcoming: 'bg-blue-100 text-blue-700',
  full: 'bg-red-100 text-red-700',
  closed: 'bg-gray-100 text-gray-600',
}

function FacilitatorDashboard() {
  const { activityIds, loading: idsLoading } = useMyActivityIds()
  const [data, setData] = useState<FacDashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!idsLoading) load()
  }, [idsLoading, activityIds])

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    const channel = supabase
      .channel(`facilitator-dashboard-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => loadRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => loadRef.current())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function load() {
    setLoading(true)
    const d = await fetchFacilitatorDashboard(activityIds)
    setData(d)
    setLoading(false)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-1">My Dashboard</h1>
      <p className="text-sm text-gray-400 mb-6">Overview of your assigned activities</p>

      {loading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Pin size={40} />} barColor="var(--color-primary)" label="My Activities" value={data.activities.length} />
          <StatCard icon={<Users size={40} />} barColor="var(--color-info)" label="Total Participants" value={data.totalParticipants} />
          <StatCard icon={<CheckCircle2 size={40} />} barColor="var(--color-teal)" label="Attended" value={data.totalAttended} />
          <StatCard icon={<Clock size={40} />} barColor="var(--color-accent)" label="Upcoming/Open" value={data.upcoming} />
        </div>
      )}

      <div className="panel overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Activity</th>
              <th className="text-left px-4 py-3">Program</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Venue</th>
              <th className="text-left px-4 py-3">Slots</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonTableRows cols={6} />
            ) : !data || data.activities.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={<Pin size={22} />} title="No assigned activities" subtitle="You'll see activities here once an admin assigns you to one." />
                </td>
              </tr>
            ) : (
              data.activities.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.title}</td>
                  <td className="px-4 py-3 text-xs">{a.program}</td>
                  <td className="px-4 py-3 text-xs">{a.date}</td>
                  <td className="px-4 py-3 text-xs">{a.venue}</td>
                  <td className="px-4 py-3">{a.slots}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_PILL[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </span>
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

function StatCard({ icon, barColor, label, value }: { icon: React.ReactNode; barColor: string; label: string; value: number }) {
  return (
    <div className="stat-card">
      <div className="stat-accent-bar" style={{ background: barColor }} />
      <div className="stat-icon-watermark" style={{ color: barColor }}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

export default FacilitatorDashboard