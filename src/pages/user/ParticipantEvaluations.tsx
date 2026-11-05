import { ACTIVITY_STATUS_DISPLAY } from '../../features/activities/activityLifecycle'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ClipboardList, Clock3 } from 'lucide-react'
import ParticipantLayout from '../../layouts/ParticipantLayout'
import { EmptyState } from '../../components/EmptyState'
import ParticipantLoading from '../../components/participant/ParticipantLoading'
import { fetchMyRegistrations, type MyRegistration } from '../../features/public/registrationService'
import { supabase } from '../../lib/supabase'

export default function ParticipantEvaluations() {
  const [registrations, setRegistrations] = useState<MyRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    const result = await fetchMyRegistrations()
    setRegistrations(result.data)
    setError(result.ok ? '' : result.error || 'Unable to load your evaluation status.')
    if (initial) setLoading(false)
  }, [])

  useEffect(() => {
    void load(true)
    const refreshTimer = window.setInterval(() => { void load() }, 60_000)
    let channel: ReturnType<typeof supabase.channel> | null = null
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      channel = supabase.channel(`participant-evaluations-${data.user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => { void load() })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `user_uuid=eq.${data.user.id}` }, () => { void load() })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_log' }, () => { void load() })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evaluations' }, () => { void load() })
        .subscribe()
    })
    return () => {
      window.clearInterval(refreshTimer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [load])

  return (
    <ParticipantLayout>
      <h1 className="text-3xl font-bold mb-1">My Evaluations</h1>
      <p className="text-gray-700 mb-8 text-sm leading-relaxed">Review your evaluation status. On activity day, scan the Attendance &amp; Evaluation QR provided by your facilitator.</p>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <ParticipantLoading view="evaluations" />
      ) : registrations.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<ClipboardList size={22} />} title="No registered activities" subtitle="Once you register for an activity, its evaluation status will appear here." />
        </div>
      ) : (
        <div className="space-y-4">
          {registrations.map((registration) => {
            const cancelled = registration.status === 'inactive'
            const eligible = !cancelled && registration.status !== 'absent' && registration.hasAttended && registration.activityStatus === 'completed'
            const statusText = registration.hasEvaluation
              ? 'Evaluation submitted. Thank you for your feedback.'
              : cancelled
                ? 'This registration was cancelled. Evaluation is unavailable.'
              : registration.activityStatus === 'closed'
                ? 'This activity was manually closed. Evaluation is unavailable.'
              : !registration.hasAttended
                ? registration.activityStatus === 'upcoming'
                  ? 'Evaluation will be available after the activity ends.'
                  : registration.activityStatus === 'ongoing'
                    ? 'Follow your facilitator’s instructions for evaluation and attendance.'
                    : 'No attendance is recorded for this activity. Contact your facilitator for assistance.'
                : registration.activityStatus !== 'completed'
                  ? 'Attendance is recorded. The evaluation opens after the activity ends.'
                  : 'Your evaluation is ready.'

            return (
              <article key={registration.id} className="panel !p-5 sm:!p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="shrink-0 rounded-xl bg-primary-light p-2.5 text-primary"><ClipboardList size={22} /></span>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-gray-900 break-words leading-relaxed">{registration.title}</h2>
                    <span className={"inline-flex mt-2 rounded-full px-2 py-1 text-xs font-semibold " + ACTIVITY_STATUS_DISPLAY[registration.activityStatus].cls}>{ACTIVITY_STATUS_DISPLAY[registration.activityStatus].label}</span>
                    <p className="text-sm text-gray-800 mt-3 leading-relaxed">{statusText}</p>
                    {!cancelled && registration.activityStatus !== 'closed' && registration.activityStatus !== 'completed' && !registration.hasAttended && !registration.hasEvaluation && (
                      <p className="text-sm text-gray-700 mt-1 leading-relaxed">Scan the activity’s Attendance &amp; Evaluation QR when provided, then complete the evaluation to record your attendance.</p>
                    )}
                    {registration.hasAttended && registration.activityStatus !== 'closed' && registration.activityStatus !== 'completed' && !registration.hasEvaluation && (
                      <p className="text-sm text-gray-700 mt-1 leading-relaxed">The evaluation form will become available when this activity is complete.</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
                {registration.hasEvaluation ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700"><CheckCircle2 size={16} /> Submitted</span>
                ) : eligible ? (
                  <Link to={`/evaluate/${registration.activityId}`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Open evaluation</Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700"><Clock3 size={16} /> {cancelled ? 'Registration cancelled' : registration.activityStatus === 'closed' ? 'Activity Closed' : registration.activityStatus === 'completed' ? 'Attendance not recorded' : 'Not available yet'}</span>
                )}
                  <Link to={`/activities/${registration.activityId}`} state={{ from: '/participant/evaluations' }} className="text-sm font-semibold text-primary hover:underline min-h-11 inline-flex items-center">View Activity Details</Link>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </ParticipantLayout>
  )
}
