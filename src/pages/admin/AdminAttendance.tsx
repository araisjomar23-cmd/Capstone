import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { fetchActivities } from '../../features/activities/activityService'
import { loadTodayLog, markAttendance } from '../../features/attendance/attendanceService'
import type { Activity } from '../../types/activity'
import type { AttendanceLogRow } from '../../features/attendance/attendanceService'
import type { MarkAttendanceResult } from '../../features/attendance/attendanceService'
import { ClipboardList, Download, ArrowLeft,QrCode, RefreshCw, CheckCircle2 } from 'lucide-react'
import { SkeletonCard } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'

const PILL_STYLES: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  upcoming: 'bg-blue-100 text-blue-700',
  full: 'bg-red-100 text-red-700',
  closed: 'bg-gray-100 text-gray-600',
}

function AdminAttendance() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [log, setLog] = useState<AttendanceLogRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [selectedActivity, setSelectedActivity] = useState('')
  const [refInput, setRefInput] = useState('')
  const [dayNumber, setDayNumber] = useState(1)
  const [scanResult, setScanResult] = useState<MarkAttendanceResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [selectedQrActivityId, setSelectedQrActivityId] = useState<string | null>(null)

  useEffect(() => {
    init()

    const channel = supabase
      .channel('attendance-log-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_log' },
        async () => {
          const logData = await loadTodayLog()
          setLog(logData)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function init() {
    const [acts, logData] = await Promise.all([fetchActivities(), loadTodayLog()])
    setActivities(acts)
    setLog(logData)
    setInitialLoading(false)
  }

  async function handleMark() {
     if (checking || !selectedActivity || !refInput.trim()) return // Blocks empty clicks
      setChecking(true)
      const result = await markAttendance(selectedActivity, refInput, dayNumber)
      setScanResult(result)
      setChecking(false)
      if (result.status === 'success') {
        setRefInput('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleMark()
    }
  }

  function downloadQR(activityId: string, title: string) {
    const canvas = document.getElementById(`qr-canvas-${activityId}`) as HTMLCanvasElement | null
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `QR_${title.replace(/\s+/g, '_')}.png`
    a.click()
  }

  const scannableActivities = activities.filter((a) => a.status !== 'closed')
  const selectedQrActivity = selectedQrActivityId
    ? activities.find((a) => a.id === selectedQrActivityId) || null
    : null

  if (initialLoading) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-primary mb-6">Attendance & QR</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Attendance & QR</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="panel p-4 sm:p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">Mark Attendance</h2>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-gray-600">Activity</label>
              <select
                value={selectedActivity}
                onChange={(e) => setSelectedActivity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base mt-1"
              >
                <option value="">Choose an activity</option>
                {scannableActivities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col xs:flex-row gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-600">Reference Code</label>
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scan or paste code"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base mt-1 font-medium"
                  autoFocus
                />
              </div>
              <div className="w-full xs:w-24">
                <label className="text-xs font-semibold text-gray-600">No. of Day</label>
                <input
                  type="number"
                  min={1}
                  value={dayNumber}
                  onChange={(e) => setDayNumber(Number(e.target.value) || 1)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base mt-1"
                />
              </div>
            </div>

            <button
              onClick={handleMark}
              disabled={checking || !selectedActivity || !refInput.trim()} // Fixed here
              className="w-full btn-primary flex items-center justify-center gap-2 py-3.5 text-base disabled:opacity-50"
            >
              <CheckCircle2 size={18} />
              {checking ? 'Checking…' : 'Mark Attendance'}
            </button>
          </div>

          {scanResult && (
            <div
              className={`rounded-lg p-3 text-sm ${
                scanResult.status === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}
            >
              <div className="font-semibold">{scanResult.title}</div>
              <div className="text-xs mt-0.5">{scanResult.body}</div>
            </div>
          )}
        </div>

        <div className="panel p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-gray-900">
              Today's Log <span className="text-gray-400 font-normal text-sm">({log.length})</span>
            </h2>
            <button
              onClick={async () => setLog(await loadTodayLog())}
              className="inline-flex items-center gap-1 text-primary text-xs font-semibold hover:underline">

              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {log.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">
                <ClipboardList size={28} className="mx-auto mb-2 text-gray-300" />
                No scans recorded today yet.
              </div>
            ) : (
              log.map((row, i) => (
                <div
                  key={row.id}
                  className={`flex justify-between items-center gap-2 py-2.5 ${
                    i !== log.length - 1 ? 'border-b border-gray-50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{row.name}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {row.refCode} · {row.activityTitle}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">
                      {new Date(row.checkedInAt).toLocaleTimeString('en-PH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    {row.dayNumber > 1 && (
                      <div className="text-[10px] text-gray-400">Day {row.dayNumber}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <QrCode size={20} /> Activity QR Codes
      </h2>

      {activities.length === 0 ? (
        <p className="text-sm text-gray-400">No activities found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {activities.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedQrActivityId(a.id)}
              className="panel p-4 flex flex-col items-center text-center hover:shadow-md hover:border-primary/30 transition-all"
            >
              <div className="text-sm font-bold text-gray-900">{a.title}</div>
              <div className="text-xs text-gray-400 mb-3">
                {a.date} · {a.venue}
              </div>
              <QrCode size={64} className="text-gray-300 mb-3" />
              <div className="text-[10px] text-gray-400">
                ACT-{String(a.id).padStart(4, '0')}
              </div>
              <span
                className={`px-2 py-1 rounded-full text-[10px] font-medium mt-2 ${
                  PILL_STYLES[a.status] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {a.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedQrActivity && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6">
          <button
            onClick={() => setSelectedQrActivityId(null)}
            className="absolute top-6 left-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary"
          >
            <ArrowLeft size={18} /> Back to all activities
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="text-2xl font-bold text-gray-900">{selectedQrActivity.title}</div>
            <div className="text-sm text-gray-400 mb-6">
              {selectedQrActivity.date} · {selectedQrActivity.venue}
            </div>

            <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm">
              <QRCodeCanvas
                id={`visible-qr-canvas-${selectedQrActivity.id}`}
                value={`${window.location.origin}/?activity=${selectedQrActivity.id}`}
                size={320}
                fgColor="#1a5c3a"
                bgColor="#ffffff"
              />
            </div>

            <div className="text-xs text-gray-400 mt-4">
              ACT-{String(selectedQrActivity.id).padStart(4, '0')}
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium mt-2 mb-6 ${
                PILL_STYLES[selectedQrActivity.status] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {selectedQrActivity.status}
            </span>

            <button
              onClick={() => downloadQR(selectedQrActivity.id, selectedQrActivity.title)}
              className="text-primary text-sm font-semibold hover:underline"
            >
              <Download size={16} className="inline mr-1" /> Download PNG
            </button>
          </div>
        </div>
      )}

      <div className="hidden" aria-hidden="true">
  {scannableActivities.map((a) => (
    <QRCodeCanvas
      key={a.id}
      id={`qr-canvas-${a.id}`}
      value={`${window.location.origin}/?activity=${a.id}`}
      size={256}
    />
      ))}
    </div>

    </div>
  )
}

export default AdminAttendance