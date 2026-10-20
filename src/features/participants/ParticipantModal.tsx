import type { Registration } from '../../types/registration'
import { X } from 'lucide-react'

const PILL_STYLES: Record<string, string> = {
  registered: 'bg-green-100 text-green-700',
  attended: 'bg-blue-100 text-blue-700',
  completed: 'bg-teal-100 text-teal-700',
  inactive: 'bg-gray-100 text-gray-600',
  not_registered: 'bg-amber-100 text-amber-700',
}

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
}

function ParticipantModal({ participant: p, onClose }: Props) {

  const fields: [string, string][] = [
    ['Full Name', p.name],
    ['Email', p.email || '—'],
    ['Age / Gender', `${p.age} / ${p.gender}`],
    ['Birthday', p.birthday || '—'],
    ['Barangay', p.barangay],
    ['City / Municipality', p.cityMunicipality || '—'],
    ['Province', p.province || '—'],
    ['Contact', p.contact],
    ['Organization', p.org || '—'],
    ['Youth Classification', p.youthClassification || '—'],
    ['Sectoral Group', p.sectoralGroup || '—'],
    ['Reference Code', p.ref || '—'],
    [p.status === 'not_registered' ? 'Account Created' : 'Registered At', fmt(p.registeredAt)],
    ['Attended At', fmt(p.attendedAt)],
    ['Program', p.program],
    ['Activity', p.status === 'not_registered' ? 'Unregistered' : p.activityTitle],
    ['Date', p.activityDate],
    ['Venue', p.activityVenue],
    ['Notes', p.notes || '—'],
  ]

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
            <p className="text-sm text-gray-500">{p.status === 'not_registered' ? 'Unregistered' : `${p.activityTitle} · ${p.program}`}</p>
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
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-2">Attendance History</div>
            {p.attendanceHistory.length ? (
              <ul className="space-y-1 text-sm text-gray-700">
                {p.attendanceHistory.map((record, index) => (
                  <li key={`${record.checkedInAt}-${record.dayNumber}-${index}`}>
                    Day {record.dayNumber} · {fmt(record.checkedInAt)}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-400">No check-ins recorded for this activity.</p>}
          </div>

          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-2">
              Current Status
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${PILL_STYLES[p.status] || 'bg-gray-100 text-gray-600'}`}>
              {p.status === 'not_registered' ? 'UNREGISTERED' : p.status.toUpperCase()}
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}

export default ParticipantModal
