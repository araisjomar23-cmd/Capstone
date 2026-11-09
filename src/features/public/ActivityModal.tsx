import { activityDescription } from '../activities/activityDescription'
import { getActivityLifecycleStatus, getActivityDisplayStatus, ACTIVITY_STATUS_DISPLAY } from '../activities/activityLifecycle'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, MapPin, Calendar, Clock } from 'lucide-react'
import { fetchActivityById, registerParticipant } from './registrationService'
import type { PublicActivity } from './publicActivityService'
import { supabase } from '../../lib/supabase'
import RegistrationConfirmation from './RegistrationConfirmation'
import ActivityDeliveryDetails from './ActivityDeliveryDetails'
import { useAuth } from '../auth/AuthContext'

interface Props {
  activityId: string
  onClose: () => void
}

function ActivityModal({ activityId, onClose }: Props) {
  const navigate = useNavigate()
  const { loading: authLoading, role } = useAuth()
  const [activity, setActivity] = useState<PublicActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [refCode, setRefCode] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    load(activityId)
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [activityId])

  async function load(id: string) {
    setLoading(true)
    const data = await fetchActivityById(id)
    setActivity(data)
    setLoading(false)
  }

  async function handleRegister() {
    if (!activity) return
    setError('')

    if (authLoading) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      navigate(`/signup?activity=${encodeURIComponent(activity.id)}`)
      return
    }

    if (role && role !== 'participant') {
      setError('You are signed in with a staff account. Sign out, then create or sign in to a participant account to register.')
      return
    }

    setSubmitting(true)
    const result = await registerParticipant(activity.id)
    setSubmitting(false)

    if (!result.ok) {
      if (result.error?.includes('complete your profile')) {
        navigate(`/participant/complete-profile?activity=${encodeURIComponent(activity.id)}`)
        return
      }
      setError(result.error || 'Registration failed.')
      return
    }

    setRefCode(result.refCode || '')
  }

  const activityStatus = activity ? getActivityDisplayStatus(activity, clockNow) : 'upcoming'
  const lifecycle = activity ? getActivityLifecycleStatus(activity, clockNow) : 'upcoming'
  const open = activity ? Math.max(0, activity.slots - activity.taken) : 0
  const soldOut = activity? open <= 0 || activity.status === 'full' || activity.status === 'closed' || lifecycle !== 'upcoming': true

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center pt-2 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-500 hover:text-gray-800"
        >
          <X size={16} />
        </button>

        {loading ? (
          <div className="py-24 text-center text-gray-400">Loading…</div>
        ) : !activity ? (
          <div className="py-24 text-center text-gray-400">Activity not found.</div>
        ) : refCode ? (
          <RegistrationConfirmation activity={activity} refCode={refCode} onBrowse={onClose} />
        ) : (
          <>
            <div className="h-28 relative" style={{ backgroundColor: activity.colorBg || '#0756a0' }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
            </div>
            <div className="p-6">
              <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">{activity.programName}</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{activity.title}</h1>
              <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold mb-3 " + ACTIVITY_STATUS_DISPLAY[activityStatus].cls}>{ACTIVITY_STATUS_DISPLAY[activityStatus].label}</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base font-medium text-gray-800 mb-5">
                <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {activity.date}</span>
                {activity.time && <span className="inline-flex items-center gap-1.5"><Clock size={14} /> {activity.time}</span>}
                <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {activity.venue}</span>
              </div>
              <ActivityDeliveryDetails activityId={activity.id} />
              <h2 className="text-lg font-bold text-gray-900 mb-3">About this activity</h2>
              <p className="whitespace-pre-wrap break-words text-base leading-7 text-gray-800 mb-6">{activityDescription(activity.previewDesc, activity.fullDesc)}</p>

              <div className="flex justify-between items-center text-sm text-gray-500 mb-5">
                <span>{open <= 0 ? 'Full' : `${open} slot${open === 1 ? '' : 's'} left`}</span>
                <span>{activity.taken}/{activity.slots} registered</span>
              </div>

              {error && <p className="text-sm text-red-500 mb-3">⚠️ {error}</p>}

              <button
                onClick={handleRegister}
                disabled={soldOut || submitting || authLoading}
                className="w-full btn-primary py-2.5 disabled:opacity-40"
              >
                {(lifecycle !== 'upcoming' || activity.status === 'closed')
                  ? (activityStatus === 'closed' ? 'Activity Closed' : lifecycle === 'completed' ? 'Activity Completed' : 'Registration Closed')
                  : soldOut
                  ? 'Activity Full'
                  : submitting
                  ? 'Registering…'
                  : 'Register Now'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ActivityModal
