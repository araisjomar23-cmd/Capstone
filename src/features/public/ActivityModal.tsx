import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, MapPin, Calendar, Clock, CheckCircle2 } from 'lucide-react'
import { fetchActivityById, registerParticipant } from './registrationService'
import type { PublicActivity } from './publicActivityService'
import { supabase } from '../../lib/supabase'

interface Props {
  activityId: string
  onClose: () => void
}

function ActivityModal({ activityId, onClose }: Props) {
  const navigate = useNavigate()
  const [activity, setActivity] = useState<PublicActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [refCode, setRefCode] = useState('')

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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      sessionStorage.setItem('postLoginRedirect', `/?activity=${activity.id}`)
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
  }

  const open = activity ? Math.max(0, activity.slots - activity.taken) : 0
  const soldOut = activity? open <= 0 || activity.status === 'full' || activity.status === 'closed': true

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
          <div className="p-8 text-center">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-primary" />
            <h1 className="text-xl font-bold text-gray-900 mb-1">You're Registered!</h1>
            <p className="text-sm text-gray-500 mb-6">{activity.title}</p>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <div className="text-xs text-gray-500 mb-1">Your Reference Code</div>
              <div className="text-2xl font-bold text-primary tracking-wider">{refCode}</div>
            </div>
            <p className="text-xs text-gray-400 mb-6">
              Save this code — you'll need it to check in / mark attendance on the activity day.
            </p>
            <button onClick={onClose} className="w-full btn-primary py-2.5">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="h-28 relative" style={{ backgroundColor: activity.colorBg || '#1a5c3a' }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
            </div>
            <div className="p-6">
              <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">{activity.programName}</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{activity.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-4">
                <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {activity.date}</span>
                {activity.time && <span className="inline-flex items-center gap-1.5"><Clock size={14} /> {activity.time}</span>}
                <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {activity.venue}</span>
              </div>
              <p className="text-sm text-gray-600 mb-4">{activity.previewDesc}</p>

              {activity.fullDesc && (
                <p className="text-sm text-gray-500 mb-4 italic">Full details unlock after you register.</p>
              )}

              <div className="flex justify-between items-center text-sm text-gray-500 mb-5">
                <span>{open <= 0 ? 'Full' : `${open} slot${open === 1 ? '' : 's'} left`}</span>
                <span>{activity.taken}/{activity.slots} registered</span>
              </div>

              {error && <p className="text-sm text-red-500 mb-3">⚠️ {error}</p>}

              <button
                onClick={handleRegister}
                disabled={soldOut || submitting}
                className="w-full btn-primary py-2.5 disabled:opacity-40"
              >
                {activity.status === 'closed'
                  ? 'Registration Closed'
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