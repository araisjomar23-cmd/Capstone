import { useEffect, useState } from 'react'
import { CANCELLATION_REASON_MAX_LENGTH } from '../features/public/registrationConstants'

interface CancelRegistrationModalProps {
  activityTitle: string
  submitting: boolean
  error: string
  onConfirm: (reason: string) => void
  onClose: () => void
}

export default function CancelRegistrationModal({
  activityTitle,
  submitting,
  error,
  onConfirm,
  onClose,
}: CancelRegistrationModalProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [submitting, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-registration-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cancel-registration-title" className="text-lg font-bold text-gray-900">
          Cancel your registration?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          You're about to withdraw from <strong>{activityTitle}</strong>. Your slot will be
          released for other participants.
        </p>

        <label htmlFor="cancel-reason" className="mt-4 block text-sm font-medium text-gray-700">
          Reason <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={CANCELLATION_REASON_MAX_LENGTH}
          rows={3}
          disabled={submitting}
          className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <p className="mt-1 text-right text-xs text-gray-400">
          {reason.length}/{CANCELLATION_REASON_MAX_LENGTH}
        </p>

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            ⚠️ {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Keep registration
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={submitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Cancelling…' : 'Yes, cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}