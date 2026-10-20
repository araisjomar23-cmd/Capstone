import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchActivityById, registerParticipant } from '../../features/public/registrationService'
import type { PublicActivity } from '../../features/public/publicActivityService'
import { CheckCircle2 } from 'lucide-react'
import { ArrowLeft, MapPin, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../features/auth/AuthContext'
import { QRCodeCanvas } from 'qrcode.react'
import { fetchMyRegistrations } from '../../features/public/registrationService'

function ActivityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const backTo = role === 'participant' ? '/participant' : '/'
  const [activity, setActivity] = useState<PublicActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [refCode, setRefCode] = useState('')
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)

  useEffect(() => {
    if (id) load(id)
  }, [id])

  useEffect(() => {
    if (role !== 'participant' || !id) return
    fetchMyRegistrations().then((result) => {
      if (!result.ok) return
      setAlreadyRegistered(result.data.some((registration) =>
        registration.activityId === id && registration.status !== 'inactive'
      ))
    })
  }, [id, role])

  useEffect(() => {
    if (!id) return

    const channel = supabase
      .channel(`activity-detail-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities', filter: `id=eq.${id}` }, () => load(id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `activity_id=eq.${id}` }, () => load(id))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  async function load(activityId: string) {
    setLoading(true)
    const data = await fetchActivityById(activityId)
    setActivity(data)
    setLoading(false)
  }

  async function handleRegister() {
    if (!activity) return
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      sessionStorage.setItem('postLoginRedirect', `/activities/${activity.id}`)
      navigate('/admin/login')
      return
    }

    setSubmitting(true)
    const result = await registerParticipant(activity.id)
    setSubmitting(false)

    if (!result.ok) {
      if (result.error?.includes('complete your profile')) {
        navigate('/participant/complete-profile')
        return
      }
      setError(result.error || 'Registration failed.')
      return
    }

    setRefCode(result.refCode || '')
    setAlreadyRegistered(true)

    const updated = await fetchActivityById(activity.id)
    if (updated) {
      setActivity(updated)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  }

  if (!activity) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Activity not found.</p>
        <button onClick={() => navigate(backTo)} className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline">
          <ArrowLeft size={14} /> Back to activities
        </button>
      </div>
    )
  }

  if (refCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle2 size={48} className="mx-auto mb-3 text-primary" />
          <h1 className="text-xl font-bold text-gray-900 mb-1">You're Registered!</h1>
          <p className="text-sm text-gray-500 mb-6">{activity.title}</p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <div className="text-xs text-gray-500 mb-1">Your Reference Code</div>
            <div className="text-2xl font-bold text-primary tracking-wider">{refCode}</div>
          </div>
          <div className="inline-flex p-3 bg-white border rounded-xl mb-4" aria-label="Attendance QR code">
            <QRCodeCanvas value={refCode} size={176} level="M" />
          </div>
          <p className="text-xs text-gray-400 mb-6">
            Save this code — you'll need it to check in / mark attendance on the activity day.
          </p>
          <button
              onClick={() => navigate(backTo)}
              className="w-full bg-primary text-white font-medium py-2.5 rounded-lg"
            >
            Back to Activities
          </button>
        </div>
      </div>
    )
  }

  const open = Math.max(0, activity.slots - activity.taken)
  const soldOut = open <= 0 || activity.status === 'full' || activity.status === 'closed'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
       <button onClick={() => navigate(backTo)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4">
          <ArrowLeft size={14} /> Back to activities
       </button>

        <div className="panel overflow-hidden">
          <div className="h-28 relative" style={{ backgroundColor: activity.colorBg || '#1a5c3a' }}>
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
          </div>
            <div className="p-4 sm:p-6">
            <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">{activity.programName}</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{activity.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 mb-4">
              <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {activity.date}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {activity.venue}</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{activity.previewDesc}</p>

            {activity.fullDesc && !(role === 'participant' && alreadyRegistered) && (
              <p className="text-sm text-gray-500 mb-4 italic">
                Full details unlock after you register.
              </p>
            )}

            <div className="flex justify-between items-center text-sm text-gray-500 mb-5">
              <span>{open <= 0 ? 'Full' : `${open} slot${open === 1 ? '' : 's'} left`}</span>
              <span>{activity.taken}/{activity.slots} registered</span>
            </div>

            {alreadyRegistered && <p className="text-sm text-green-700 mb-4">You are registered for this activity. You can review its details here.</p>}
            {error && <p className="text-sm text-red-500 mb-4">⚠️ {error}</p>}
            
            <button
              onClick={handleRegister}
              disabled={alreadyRegistered || soldOut || submitting}
              className="w-full btn-primary py-2.5 disabled:opacity-40"
              >
              {alreadyRegistered
                ? 'Registered'
                : activity.status === 'closed'
                ? 'Registration Closed'
                : soldOut
                ? 'Activity Full'
                : submitting
                ? 'Registering…'
                : 'Register Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ActivityDetail
