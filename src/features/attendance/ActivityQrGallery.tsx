import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { ArrowLeft, Download, QrCode, Calendar, MapPin } from 'lucide-react'
import type { Activity } from '../../types/activity'
import { ACTIVITY_STATUS_DISPLAY, getActivityDisplayStatus } from '../activities/activityLifecycle'
import FinalizeAttendanceButton from './FinalizeAttendanceButton'

export default function ActivityQrGallery({ activities, now: clockNow, onRefresh }: { activities: Activity[]; now: number; onRefresh: () => void }) {
  const [selectedQrActivityId, setSelectedQrActivityId] = useState<string | null>(null)
  const sortedActivities = activities.filter(a => !a.attendanceFinalizedAt && getActivityDisplayStatus(a, clockNow) !== 'closed').sort((a, b) =>
    (a.startDate || '9999-12-31').localeCompare(b.startDate || '9999-12-31') ||
    (a.startTime || '').localeCompare(b.startTime || '') ||
    a.title.localeCompare(b.title))
  const selectedQrActivity = sortedActivities.find(a => a.id === selectedQrActivityId) ?? null
  useEffect(() => {
    if (!selectedQrActivity) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedQrActivityId(null) }
    window.addEventListener('keydown', close)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close) }
  }, [selectedQrActivity])
  function downloadQR(activityId: string, title: string) {
    const canvas = document.getElementById(`visible-checkin-qr-canvas-${activityId}`) as HTMLCanvasElement | null
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `QR_${title.replace(/\s+/g, '_')}_attendance_evaluation.png`
    a.click()
  }

  return <>
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <QrCode size={20} /> Activity QR Codes
      </h2>

      {sortedActivities.length === 0 ? (
        <p className="text-sm text-gray-600">No activity QR codes available. Closed and finalized activities are removed from this list; submitted feedback remains in Evaluations.</p>
      ) : (
        <div className="space-y-8">
          {[...new Set(sortedActivities.map(a => a.programName || 'Other programs'))].sort().map(program => {
            const group = sortedActivities.filter(a => (a.programName || 'Other programs') === program)
            return <section key={program} aria-label={`${program} QR codes`}>
              <div className="flex items-center gap-3 border-b border-primary/10 pb-3 mb-4">
                <span className="w-1 h-6 bg-primary rounded-full" aria-hidden="true" />
                <h3 className="font-bold text-lg text-primary">{program}</h3>
                <span className="rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary whitespace-nowrap">{group.length} {group.length === 1 ? 'activity' : 'activities'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {group.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedQrActivityId(a.id)}
              className="panel !p-5 flex flex-col items-start text-left gap-3 hover:shadow-md hover:border-primary/30 transition-all"
            >
              <div className="flex items-start gap-3 w-full">
                <span className="shrink-0 rounded-xl bg-primary-light p-3 text-primary"><QrCode size={26} /></span>
                <div className="text-base font-bold text-gray-900 leading-relaxed break-words min-w-0">{a.title}</div>
              </div>
              <div className="space-y-2 text-sm text-gray-700 w-full">
                <div className="flex items-start gap-2"><Calendar size={16} className="text-primary shrink-0 mt-0.5" /><span>{a.date}</span></div>
                <div className="flex items-start gap-2"><MapPin size={16} className="text-primary shrink-0 mt-0.5" /><span className="break-words min-w-0">{a.venue}</span></div>
              </div>
              <div className="mt-auto pt-3 border-t border-gray-100 w-full flex items-center justify-between gap-3">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(a, clockNow)].cls
                }`}
              >
                {ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(a, clockNow)].label}
              </span>
              <span className="text-xs font-semibold text-primary">View QR →</span>
              </div>
            </button>
          ))}
              </div>
            </section>
          })}
        </div>
      )}

      {selectedQrActivity && (
        <div role="dialog" aria-modal="true" aria-label="Attendance and evaluation QR" className="fixed inset-0 z-50 bg-white overflow-y-auto p-6">
          <button
            onClick={() => setSelectedQrActivityId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary"
          >
            <ArrowLeft size={18} /> Back to all activities
          </button>

          <div className="flex min-h-[80vh] flex-col items-center justify-center text-center py-8">
            <div className="text-2xl font-bold text-gray-900">{selectedQrActivity.title}</div>
            <div className="text-sm text-gray-400 mb-6">
              {selectedQrActivity.date} · {selectedQrActivity.venue}
            </div>

            <div className="text-xs text-gray-400 mt-4">
              ACT-{String(selectedQrActivity.id).padStart(4, '0')}
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium mt-2 mb-6 ${
                ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(selectedQrActivity, clockNow)].cls
              }`}
            >
              {ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(selectedQrActivity, clockNow)].label}
            </span>

            <FinalizeAttendanceButton activity={selectedQrActivity} now={clockNow} onFinalized={onRefresh} />
            {selectedQrActivity.attendanceFinalizedAt ? <p className="mt-4 text-sm text-gray-500">Evaluation and attendance submissions are closed.</p> : getActivityDisplayStatus(selectedQrActivity, clockNow) === 'closed' ? (
              <p className="mt-4 text-sm text-gray-500">This activity was manually closed. Check-in is unavailable.</p>
            ) : (
            <div className="grid grid-cols-1 gap-8 w-full max-w-3xl mt-4">
              <section className="flex flex-col items-center">
                <h3 className="font-semibold text-gray-900 mb-2">Attendance & Evaluation QR</h3>
                <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm">
                  <QRCodeCanvas
                    id={`visible-checkin-qr-canvas-${selectedQrActivity.id}`}
                    value={`${window.location.origin}/checkin/${selectedQrActivity.id}`}
                    size={220}
                    fgColor="#0756a0"
                    bgColor="#ffffff"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2 mb-3">Show this QR near the end or after the activity. Participants complete the evaluation, then attendance is recorded automatically.</p>
                <button onClick={() => downloadQR(selectedQrActivity.id, selectedQrActivity.title)} className="text-primary text-sm font-semibold hover:underline">
                  <Download size={16} className="inline mr-1" /> Download QR
                </button>
              </section>
            </div>
            )}
          </div>
        </div>
      )}

  </>
}
