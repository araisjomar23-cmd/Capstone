import { supabase } from '../../lib/supabase'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchPublicActivities } from '../../features/public/publicActivityService'
import type { PublicActivity } from '../../features/public/publicActivityService'
import ParticipantLayout from '../../layouts/ParticipantLayout'
import ParticipantLoading from '../../components/participant/ParticipantLoading'
import { EmptyState } from '../../components/EmptyState'
import { MapPin, Calendar, Clock3, CalendarX, Sparkles, Zap, Search } from 'lucide-react'
import { activityDescription } from '../../features/activities/activityDescription'
import { usePageTitle } from '../../hooks/usePageTitle'
import { fetchMyRegistrations } from '../../features/public/registrationService'
import { getActivityDisplayStatus, ACTIVITY_STATUS_DISPLAY, isActivityVisibleInCatalog } from '../../features/activities/activityLifecycle'


export default function ParticipantDashboard() {
  usePageTitle('PRIME')
  const navigate = useNavigate()
  const [activities, setActivities] = useState<PublicActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [registeredActivityIds, setRegisteredActivityIds] = useState<Set<string>>(new Set())
  const [clockNow, setClockNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

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
    const channel = supabase.channel('browse-activities-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => { void loadActivities() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => { void loadActivities() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const visibleActivities = activities.filter((a) => isActivityVisibleInCatalog(a, clockNow)
    && (!programFilter || a.programName === programFilter)
    && (!search.trim() || `${a.title} ${a.venue}`.toLowerCase().includes(search.trim().toLowerCase())))

  return (
    <ParticipantLayout>
      <h1 className="text-3xl font-bold mb-1">Browse Activities</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Browse upcoming and ongoing activities. Past activities remain in My Activities.
      </p>
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input aria-label="Search activities or venues" className="input !pl-11" placeholder="Search activities or venues..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select aria-label="Filter activities by program" className="filter-select input sm:!w-auto max-w-full" value={programFilter} onChange={e => setProgramFilter(e.target.value)}>
          <option value="">All Programs</option>
          {[...new Set(activities.map(a => a.programName))].sort().map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {loading ? (
        <ParticipantLoading view="catalog" />
      ) : visibleActivities.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<CalendarX size={22} />}
            title={search || programFilter ? 'No activities match your filters' : 'No activities available right now'}
            subtitle={search || programFilter ? 'Try another search or choose All Programs.' : 'Check back soon — new activities are added regularly.'}
          />
        </div>
      ) : (
        <div className="space-y-9">
          {[...new Set(visibleActivities.map(activity => activity.programName))].sort().map(program => (
            <section key={program} aria-label={`${program} activities`}>
              <div className="flex items-center gap-3 mb-4 border-b border-primary/10 pb-3">
                <span className="w-1 h-6 rounded-full bg-primary" aria-hidden="true" />
                <h2 className="text-lg font-bold text-primary">{program}</h2>
                <span className="rounded-full bg-primary-light text-primary px-2.5 py-1 text-xs font-semibold">{visibleActivities.filter(activity => activity.programName === program).length} activities</span>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleActivities.filter(activity => activity.programName === program).map((activity) => {
            const open = Math.max(0, activity.slots - activity.taken)
            const full = open <= 0
            const registered = registeredActivityIds.has(activity.id)
            const lifecycle = getActivityDisplayStatus(activity, clockNow)
            return (
              <div key={activity.id} className="bg-white rounded-2xl border border-border-warm overflow-hidden flex flex-col shadow-sm transition-transform hover:-translate-y-1.5">
                <div
                  className="h-[140px] relative flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: activity.colorBg || '#0756a0' }}
                >
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)',
                      backgroundSize: '18px 18px',
                    }}
                  />
                  <Sparkles size={44} className="relative text-white/90 drop-shadow-lg" />
                  <span className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${ACTIVITY_STATUS_DISPLAY[lifecycle].cls}`}>{ACTIVITY_STATUS_DISPLAY[lifecycle].label}</span>
                  {!full && activity.slots > 0 && open / activity.slots <= 0.15 && <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 bg-red-600 text-white rounded-full px-2.5 py-1 text-[10px] font-bold"><Zap size={10} /> Almost Full</span>}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1">
                    {activity.programName}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{activity.title}</h3>

                  <dl className="space-y-2.5 text-sm text-gray-700 mb-4 mt-1 leading-relaxed">
                    <div className="flex items-start gap-2.5"><Calendar size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" /><dt className="font-semibold shrink-0 w-12">Date</dt><dd>{activity.date}</dd></div>
                    {activity.time && <div className="flex items-start gap-2.5"><Clock3 size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" /><dt className="font-semibold shrink-0 w-12">Time</dt><dd>{activity.time}</dd></div>}
                    <div className="flex items-start gap-2.5"><MapPin size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" /><dt className="font-semibold shrink-0 w-12">Venue</dt><dd className="min-w-0 break-words">{activity.venue}</dd></div>
                  </dl>
                  <p className="text-sm text-gray-600 flex-1 mb-4 line-clamp-3">{activityDescription(activity.previewDesc, activity.fullDesc)}</p>
                  {registered && <span className="self-start rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 mb-3">Registered</span>}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{full ? 'Full' : open + (open === 1 ? ' slot left' : ' slots left')}</span>
                      <span>{activity.taken}/{activity.slots}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: (activity.slots > 0 ? Math.min(100, activity.taken / activity.slots * 100) : 0) + '%' }} />
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/activities/${activity.id}`)}
                    className="mt-auto w-full btn-primary py-2.5 disabled:opacity-40"
                  >
                    {registered || lifecycle !== 'upcoming' || activity.status === 'closed' || full ? 'View Details' : 'View & Register'}
                  </button>
                </div>
              </div>
            )
          })}
              </div>
            </section>
          ))}
        </div>
      )}
    </ParticipantLayout>
  )
}
