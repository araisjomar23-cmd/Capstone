import { useEffect, useState } from 'react'
import ParticipantLayout from '../../layouts/ParticipantLayout'
import { SkeletonCard } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import CancelRegistrationModal from '../../components/CancelRegistrationModal'
import { Calendar, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { QRCodeCanvas } from 'qrcode.react'
import { formatActivityCheckInOpensAt } from '../../features/activities/activityLifecycle'
import {
  fetchMyRegistrations,
  cancelRegistration,
  type MyRegistration,
} from '../../features/public/registrationService'
import {
  REGISTRATION_STATUS,
  STATUS_PILL_STYLES,
  STATUS_PILL_FALLBACK,
  CANCELLATION_FALLBACK_MESSAGE,
  DISPLAY_LOCALE,
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  type RegistrationStatus,
} from '../../features/public/registrationConstants'

const SKELETON_COUNT = 3

export default function MyActivities() {
  const [registrations, setRegistrations] = useState<MyRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')

  const [target, setTarget] = useState<MyRegistration | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  useEffect(() => {
    loadRegistrations(true)
    let channel: ReturnType<typeof supabase.channel> | null = null
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      channel = supabase.channel(`my-registrations-${data.user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `user_uuid=eq.${data.user.id}` }, () => { void loadRegistrations() })
        .subscribe()
    })
    return () => { if (channel) void supabase.removeChannel(channel) }
  }, [])

  async function loadRegistrations(initial = false) {
    if (initial) setLoading(true)
    const result = await fetchMyRegistrations()
    setRegistrations(result.data)
    setLoadError(result.ok ? '' : result.error || 'Failed to load your activities.')
    if (initial) setLoading(false)
  }

  function openCancel(registration: MyRegistration) {
    setCancelError('')
    setNotice('')
    setTarget(registration)
  }

  function closeCancel() {
    if (cancelling) return
    setTarget(null)
    setCancelError('')
  }

  async function handleConfirmCancel(reason: string) {
    if (!target) return
    setCancelling(true)
    setCancelError('')

    const result = await cancelRegistration(target.id, reason)
    setCancelling(false)

    if (!result.ok) {
      setCancelError(result.error || CANCELLATION_FALLBACK_MESSAGE)
      return
    }

    setNotice(`Your registration for "${target.title}" has been cancelled.`)
    setTarget(null)
    await loadRegistrations()
  }

  const fmtDate = (value: string) =>
    new Date(value).toLocaleDateString(DISPLAY_LOCALE, DATE_FORMAT)
  const fmtDateTime = (value: string) =>
    new Date(value).toLocaleString(DISPLAY_LOCALE, DATE_TIME_FORMAT)

  return (
    <ParticipantLayout>
      <h1 className="text-3xl font-bold mb-1">My Activities</h1>
      <p className="text-gray-500 mb-8 text-sm">Activities you've registered for.</p>

      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {notice}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mb-4 text-sm text-red-500">⚠️ {loadError}</p>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : registrations.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="No registrations yet"
            subtitle="Browse activities from your dashboard and register to see them here."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {registrations.map((reg) => {
            const isRegistered = reg.status === REGISTRATION_STATUS.REGISTERED
            return (
              <div key={reg.id} className="panel !p-0 overflow-hidden flex">
                <div className="w-1.5 shrink-0" style={{ backgroundColor: reg.colorBg }} />
                <div className="p-5 flex-1 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="font-bold text-lg text-gray-900">{reg.title}</h2>
                    <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                      <Calendar size={13} />
                      Registered {fmtDate(reg.registeredAt)}
                    </p>
                    {isRegistered && reg.cancelDeadline && (
                      <p className="text-xs text-gray-400 mt-1">
                        {reg.canCancel
                          ? `You can cancel until ${fmtDateTime(reg.cancelDeadline)}`
                          : 'Cancellation period has ended'}
                      </p>
                    )}
                    {reg.hasAttended && (
                      reg.hasEvaluation ? (
                        <p className="text-xs text-green-700 mt-2">Evaluation submitted. Thank you for your feedback.</p>
                      ) : reg.activityStatus === 'completed' && reg.refCode ? (
                        <Link to={`/evaluate/${reg.activityId}`} className="inline-flex mt-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
                          Complete activity evaluation
                        </Link>
                      ) : reg.activityStatus !== 'completed' ? (
                        <p className="text-xs text-amber-700 mt-2">Evaluation opens after the activity has ended.</p>
                      ) : <p className="text-xs text-amber-700 mt-2">Evaluation link unavailable. Contact the activity facilitator.</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {reg.refCode && reg.status !== 'inactive' && (
                      reg.activityStatus === 'upcoming' ? (
                        <p className="max-w-40 text-center text-[11px] text-gray-500">Check-in opens on {formatActivityCheckInOpensAt(reg.checkInOpensAt)}</p>
                      ) : reg.activityStatus === 'ongoing' ? (
                        <div className="text-center">
                          <QRCodeCanvas value={reg.refCode} size={80} level="M" />
                          <p className="text-[10px] text-gray-500 mt-1">Attendance QR</p>
                        </div>
                      ) : <p className="max-w-40 text-center text-[11px] text-gray-500">Check-in is closed.</p>
                    )}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${reg.activityStatus === 'upcoming' ? 'bg-blue-50 text-blue-700' : reg.activityStatus === 'ongoing' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                        {reg.activityStatus === 'upcoming' ? 'Upcoming' : reg.activityStatus === 'ongoing' ? 'Ongoing' : 'Completed'}
                      </span>
                      <span
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                        STATUS_PILL_STYLES[reg.status as RegistrationStatus] ?? STATUS_PILL_FALLBACK
                      }`}
                    >
                      {reg.status}
                    </span>
                    </div>
                    {isRegistered && reg.canCancel && (
                      <button
                        type="button"
                        onClick={() => openCancel(reg)}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                      >
                        Cancel registration
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {target && (
        <CancelRegistrationModal
          activityTitle={target.title}
          submitting={cancelling}
          error={cancelError}
          onConfirm={handleConfirmCancel}
          onClose={closeCancel}
        />
      )}
    </ParticipantLayout>
  )
}
