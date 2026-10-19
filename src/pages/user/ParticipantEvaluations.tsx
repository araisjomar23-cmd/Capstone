import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ClipboardList, Clock3 } from 'lucide-react'
import ParticipantLayout from '../../layouts/ParticipantLayout'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonCard } from '../../components/Skeleton'
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
    let channel: ReturnType<typeof supabase.channel> | null = null
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      channel = supabase.channel(`participant-evaluations-${data.user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `user_uuid=eq.${data.user.id}` }, () => { void load() })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_log' }, () => { void load() })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evaluations' }, () => { void load() })
        .subscribe()
    })
    return () => { if (channel) void supabase.removeChannel(channel) }
  }, [load])

  return (
    <ParticipantLayout>
      <h1 className="text-3xl font-bold mb-1">My Evaluations</h1>
      <p className="text-gray-500 mb-8 text-sm">Your registered activities and when their evaluation forms become available.</p>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}</div>
      ) : registrations.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<ClipboardList size={22} />} title="No registered activities" subtitle="Once you register for an activity, its evaluation status will appear here." />
        </div>
      ) : (
        <div className="space-y-4">
          {registrations.map((registration) => {
            const eligible = registration.hasAttended && registration.activityStatus === 'completed'
            const statusText = registration.hasEvaluation
              ? 'Evaluation submitted. Thank you for your feedback.'
              : !registration.hasAttended
                ? 'Evaluation is locked until your attendance is recorded.'
                : registration.activityStatus !== 'completed'
                  ? 'Attendance is recorded. The evaluation opens after the activity ends.'
                  : 'Your evaluation is ready.'

            return (
              <article key={registration.id} className="panel flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 text-primary"><ClipboardList size={20} /></span>
                  <div>
                    <h2 className="font-bold text-gray-900">{registration.title}</h2>
                    <p className="text-sm text-gray-500 mt-1">{statusText}</p>
                    {!registration.hasAttended && !registration.hasEvaluation && (
                      <p className="text-xs text-gray-500 mt-1">Attend the activity and wait for staff to record your attendance before taking the evaluation.</p>
                    )}
                    {registration.hasAttended && registration.activityStatus !== 'completed' && !registration.hasEvaluation && (
                      <p className="text-xs text-gray-500 mt-1">The evaluation form will become available when this activity is complete.</p>
                    )}
                  </div>
                </div>

                {registration.hasEvaluation ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700"><CheckCircle2 size={16} /> Submitted</span>
                ) : eligible ? (
                  <Link to={`/evaluate/${registration.activityId}`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Open evaluation</Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600"><Clock3 size={16} /> Not available yet</span>
                )}
              </article>
            )
          })}
        </div>
      )}
    </ParticipantLayout>
  )
}
