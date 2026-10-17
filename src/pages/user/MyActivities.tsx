import { useEffect, useState } from 'react'
import ParticipantLayout from '../../layouts/ParticipantLayout'
import { SkeletonCard } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import CancelRegistrationModal from '../../components/CancelRegistrationModal'
import { Calendar, ClipboardList } from 'lucide-react'
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
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                        STATUS_PILL_STYLES[reg.status as RegistrationStatus] ?? STATUS_PILL_FALLBACK
                      }`}
                    >
                      {reg.status}
                    </span>
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