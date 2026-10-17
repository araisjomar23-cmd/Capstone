import { useState } from 'react'
import { updateStatusInDB } from './participantService'
import type { Registration } from '../../types/registration'
import { X } from 'lucide-react'
import { useToast } from '../../components/ToastProvider'

const PILL_STYLES: Record<string, string> = {
  registered: 'bg-green-100 text-green-700',
  attended: 'bg-blue-100 text-blue-700',
  completed: 'bg-teal-100 text-teal-700',
  inactive: 'bg-gray-100 text-gray-600',
}

const STATUS_OPTIONS = ['registered', 'attended', 'completed', 'inactive'] as const

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  )
}

interface Props {
  participant: Registration
  onClose: () => void
  onStatusChange: (ref: string, newStatus: string) => void
}

function ParticipantModal({ participant: p, onClose, onStatusChange }: Props) {
  const { showToast } = useToast()
  const [updating, setUpdating] = useState(false)

  const fields: [string, string][] = [
    ['Full Name', p.name],
    ['Age / Gender', `${p.age} / ${p.gender}`],
    ['Barangay', p.barangay],
    ['Contact', p.contact],
    ['Organization', p.org || '—'],
    ['Reference Code', p.ref || '—'],
    ['Registered At', fmt(p.registeredAt)],
    ['Attended At', fmt(p.attendedAt)],
    ['Program', p.program],
    ['Activity', p.activityTitle],
    ['Date', p.activityDate],
    ['Venue', p.activityVenue],
    ['Notes', p.notes || '—'],
  ]

  async function handleStatusClick(newStatus: string) {
  setUpdating(true)
  const ok = await updateStatusInDB(p.ref, newStatus)
  setUpdating(false)
  if (ok) {
    onStatusChange(p.ref, newStatus)
    showToast(`Status updated to "${newStatus}".`, 'success')
  } else {
    showToast('Failed to update status. Please try again.', 'error')
  }
}

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{p.name}</h2>
            <p className="text-sm text-gray-500">{p.activityTitle} · {p.program}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-3 mb-5">
            {fields.map(([label, value]) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">
                  {label}
                </div>
                <div className="text-sm font-semibold text-gray-800 break-all">{value}</div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-2">
              Current Status
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${PILL_STYLES[p.status] || 'bg-gray-100 text-gray-600'}`}>
              {p.status.toUpperCase()}
            </span>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-2">
              Update Status
            </div>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  disabled={updating || status === p.status}
                  onClick={() => handleStatusClick(status)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ParticipantModal