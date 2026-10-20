import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchPublicActivities } from '../../features/public/publicActivityService'
import type { PublicActivity } from '../../features/public/publicActivityService'
import ParticipantLayout from '../../layouts/ParticipantLayout'
import { SkeletonCard } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { MapPin, Calendar, Users, CalendarX } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'
import { fetchMyRegistrations } from '../../features/public/registrationService'

export default function ParticipantDashboard() {
  usePageTitle('PRIME')
  const navigate = useNavigate()
  const [activities, setActivities] = useState<PublicActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [registeredActivityIds, setRegisteredActivityIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadActivities() {
      try {
        const [data, registrations] = await Promise.all([fetchPublicActivities(), fetchMyRegistrations()])
        setActivities(data)
        if (registrations.ok) {
          setRegisteredActivityIds(new Set(
            registrations.data.filter((registration) => registration.status !== 'inactive').map((registration) => registration.activityId)
          ))
        }
      } finally {
        setLoading(false)
      }
    }
    loadActivities()
  }, [])

  return (
    <ParticipantLayout>
      <h1 className="text-3xl font-bold mb-1">Browse Activities</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Explore what's open right now and register for a spot.
      </p>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<CalendarX size={22} />}
            title="No activities available right now"
            subtitle="Check back soon — new activities are added regularly."
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((activity) => {
            const open = Math.max(0, activity.slots - activity.taken)
            const full = open <= 0
            const registered = registeredActivityIds.has(activity.id)
            return (
              <div key={activity.id} className="panel overflow-hidden flex flex-col">
                <div
                  className="h-20 relative"
                  style={{ backgroundColor: activity.colorBg || '#1a5c3a' }}
                >
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)',
                      backgroundSize: '18px 18px',
                    }}
                  />
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1">
                    {activity.programName}
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 mb-2">{activity.title}</h2>

                  <div className="space-y-1.5 text-sm text-gray-500 mb-4">
                    <p className="flex items-center gap-1.5"><MapPin size={14} /> {activity.venue}</p>
                    <p className="flex items-center gap-1.5"><Calendar size={14} /> {activity.date}</p>
                    <p className="flex items-center gap-1.5"><Users size={14} /> {activity.taken}/{activity.slots} registered</p>
                  </div>

                  <button
                    onClick={() => navigate(`/activities/${activity.id}`)}
                    className="mt-auto w-full btn-primary py-2.5 disabled:opacity-40"
                  >
                    {registered ? 'Registered · View Activity' : full ? 'Activity Full · View Details' : 'View & Register'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ParticipantLayout>
  )
}
