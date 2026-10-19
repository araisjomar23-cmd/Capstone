import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type CheckInResult = {
  success: boolean
  code: string
  message: string
}

const CHECK_IN_MESSAGES: Record<string, string> = {
  not_registered: 'You are not registered for this activity.',
  cancelled: 'Your registration for this activity was cancelled.',
  too_early: 'Check-in has not opened for this activity yet.',
  ended: 'The check-in window for this activity has ended.',
  already_checked_in: 'You are already checked in for this activity day.',
}

export default function ParticipantCheckin() {
  const { activityId } = useParams()
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<CheckInResult | null>(null)

  useEffect(() => {
    let active = true
    async function checkIn() {
      if (!activityId) {
        setResult({ success: false, code: 'not_registered', message: CHECK_IN_MESSAGES.not_registered })
        setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('check_in_my_activity', { p_activity_id: activityId })
      if (!active) return
      if (error) {
        setResult({ success: false, code: 'error', message: 'We could not record your check-in. Please try again or ask event staff for help.' })
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as CheckInResult | null
        setResult(row || { success: false, code: 'error', message: 'The check-in service returned no result. Please ask event staff for help.' })
      }
      setLoading(false)
    }
    void checkIn()
    return () => { active = false }
  }, [activityId])

  const message = result && (CHECK_IN_MESSAGES[result.code] || result.message)

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <section className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {loading ? (
          <LoaderCircle size={44} className="mx-auto mb-4 animate-spin text-primary" />
        ) : result?.success ? (
          <CheckCircle2 size={48} className="mx-auto mb-3 text-primary" />
        ) : (
          <CircleAlert size={48} className="mx-auto mb-3 text-amber-600" />
        )}
        <h1 className="text-xl font-bold text-gray-900 mb-2">{loading ? 'Checking you in…' : result?.success ? 'Check-in complete' : 'Check-in unavailable'}</h1>
        {!loading && <p role={result?.success ? 'status' : 'alert'} className="text-sm text-gray-600">{message}</p>}
        {!loading && <Link to="/participant/my-activities" className="inline-flex mt-6 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white">Go to My Activities</Link>}
      </section>
    </main>
  )
}
