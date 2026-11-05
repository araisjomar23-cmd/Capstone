import type { Registration } from '../../types/registration'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const PILL_STYLES: Record<string, string> = {
  absent: 'bg-red-50 text-red-700',
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
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')
        if (!buttons?.length) return
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [onClose])
  const personal: [string, string][] = [
    ['Full Name', p.name],
    ['Email', p.email || '—'],
    ['Age / Gender', `${p.age} / ${p.gender}`],
    ['Birthday', p.birthday || '—'],
    ['Contact', p.contact],
  ]
  const address: [string, string][] = [
    ['Barangay', p.barangay],
    ['City / Municipality', p.cityMunicipality || '—'],
    ['Province', p.province || '—'],
  ]
  const youth: [string, string][] = [
    ['Organization', p.org || '—'],
    ['Youth Classification', p.youthClassification || '—'],
    ['Sectoral Group', p.sectoralGroup || '—'],
  ]
  const activity: [string, string][] = [
    ['Reference Code', p.ref || '—'],
    [p.status === 'not_registered' ? 'Account Created' : 'Registered At', fmt(p.registeredAt)],
    ['Attended At', fmt(p.attendedAt)],
    ['Program', p.program],
    ['Activity', p.status === 'not_registered' ? 'Unregistered' : p.activityTitle],
    ['Date', p.activityDate],
    ['Venue', p.activityVenue],
  ]
  const groups = [
    { title: 'Personal information', fields: personal },
    { title: 'Address', fields: address },
    { title: 'Youth information', fields: youth },
    { title: 'Activity registration', fields: activity },
  ]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="participant-details-title"
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:px-8 sm:py-6 border-b border-gray-200 flex justify-between items-start gap-5 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Participant details</p>
            <h2 id="participant-details-title" className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{p.name}</h2>
            <span className={`inline-flex mt-3 px-3 py-1 rounded-full text-xs font-semibold ${PILL_STYLES[p.status] || 'bg-gray-100 text-gray-600'}`}>
              {p.status === 'not_registered' ? 'Unregistered' : p.status.charAt(0).toUpperCase() + p.status.slice(1)}
            </span>
          </div>
          <button ref={closeRef} type="button" aria-label="Close participant details" onClick={onClose} className="shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-8 space-y-7 min-h-0">
          {groups.map(group => <section key={group.title}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{group.title}</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5">
              {group.fields.map(([label, value]) => <div key={label} className={`min-w-0 ${['Activity', 'Venue', 'Organization'].includes(label) ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
                <dt className="text-xs font-medium text-gray-600 mb-1.5">{label}</dt>
                <dd className="text-sm font-semibold text-gray-900 leading-relaxed break-words [overflow-wrap:anywhere]">{value}</dd>
              </div>)}
            </dl>
          </section>)}

          <div className="mb-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">Attendance history</h3>
            {p.attendanceHistory.length ? (
              <ul className="space-y-1 text-sm text-gray-700">
                {p.attendanceHistory.map((record, index) => (
                  <li key={`${record.checkedInAt}-${record.dayNumber}-${index}`}>
                    Day {record.dayNumber} · {fmt(record.checkedInAt)}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-700">No check-ins recorded for this activity.</p>}
          </div>

        </div>
      </div>
    </div>
  )
}

export default ParticipantModal
