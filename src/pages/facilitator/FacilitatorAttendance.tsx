import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { QrCode, RefreshCw, CheckCircle2, Download, ClipboardList } from 'lucide-react'
import { useMyActivityIds } from '../../features/facilitators/useMyActivityIds'
import { fetchActivities } from '../../features/activities/activityService'
import { loadTodayLog, markAttendance } from '../../features/attendance/attendanceService'
import type { Activity } from '../../types/activity'
import type { AttendanceLogRow, MarkAttendanceResult } from '../../features/attendance/attendanceService'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'

const PILL_STYLES: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  upcoming: 'bg-blue-100 text-blue-700',
  full: 'bg-red-100 text-red-700',
  closed: 'bg-gray-100 text-gray-600',
}

function FacilitatorAttendance() {
  const { activityIds, loading: idsLoading } = useMyActivityIds()
  const [activities, setActivities] = useState<Activity[]>([])
  const [log, setLog] = useState<AttendanceLogRow[]>([])
  const [selectedActivity, setSelectedActivity] = useState('')
  const [refInput, setRefInput] = useState('')
  const [dayNumber, setDayNumber] = useState(1)
  const [scanResult, setScanResult] = useState<MarkAttendanceResult | null>(null)
  const [checking, setChecking] = useState(false)

 useEffect(() => {
    if (!idsLoading) init()
  }, [idsLoading, activityIds])

  useEffect(() => {
    const channel = supabase
      .channel(`facilitator-attendance-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_log' }, async () => {
        const logData = await loadTodayLog()
        setLog(logData)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function init() {
    const [allActs, logData] = await Promise.all([fetchActivities(), loadTodayLog()])
    setActivities(allActs.filter((a) => activityIds.includes(a.id)))
    setLog(logData.filter((row) => activityIds.includes(row.activityId)))
  }

  async function handleMark() {
    if (checking) return
    setChecking(true)
    const result = await markAttendance(selectedActivity, refInput, dayNumber)
    setScanResult(result)
    setChecking(false)
    if (result.status === 'success') {
      setRefInput('')
      const logData = await loadTodayLog()
      setLog(logData)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleMark()
    }
  }

  function downloadQR(activityId: string, title: string) {
    const canvas = document.getElementById(`fac-qr-canvas-${activityId}`) as HTMLCanvasElement | null
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `QR_${title.replace(/\s+/g, '_')}.png`
    a.click()
  }

  const scannableActivities = activities.filter((a) => a.status !== 'closed')

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Attendance & QR</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="panel p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">Mark Attendance</h2>
          {scannableActivities.length === 0 ? (
            <EmptyState icon={<ClipboardList size={22} />} title="No open activities" subtitle="You have no open/upcoming assigned activities to scan for right now." />
          ) : (
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-semibold text-gray-600">Activity</label>
                <select value={selectedActivity} onChange={(e) => setSelectedActivity(e.target.value)} className="input">
                  <option value="">Choose an activity</option>
                  {scannableActivities.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-600">Reference Code</label>
                  <input
                    type="text"
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Scan or paste code"
                    className="input"
                    autoFocus
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs font-semibold text-gray-600">Day No.</label>
                  <input type="number" min={1} value={dayNumber} onChange={(e) => setDayNumber(Number(e.target.value) || 1)} className="input" />
                </div>
              </div>
              <button onClick={handleMark} disabled={checking} className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-50">
                <CheckCircle2 size={16} />
                {checking ? 'Checking…' : 'Mark Attendance'}
              </button>
            </div>
          )}

          {scanResult && (
            <div className={`rounded-lg p-3 text-sm ${scanResult.status === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              <div className="font-semibold">{scanResult.title}</div>
              <div className="text-xs mt-0.5">{scanResult.body}</div>
            </div>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-gray-900">
              Today's Log <span className="text-gray-400 font-normal text-sm">({log.filter((r) => activityIds.includes(r.activityId)).length})</span>
            </h2>
            <button onClick={async () => setLog(await loadTodayLog())} className="inline-flex items-center gap-1 text-primary text-xs font-semibold hover:underline">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {log.filter((r) => activityIds.includes(r.activityId)).length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">
                <ClipboardList size={28} className="mx-auto mb-2 text-gray-300" />
                No scans recorded today yet.
              </div>
            ) : (
              log
                .filter((r) => activityIds.includes(r.activityId))
                .map((row, i, arr) => (
                  <div key={row.id} className={`flex justify-between items-center py-2.5 ${i !== arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{row.name}</div>
                      <div className="text-xs text-gray-400">{row.refCode} · {row.activityTitle}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">
                        {new Date(row.checkedInAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <QrCode size={20} /> My Activity QR Codes
      </h2>
      {activities.length === 0 ? (
        <EmptyState icon={<QrCode size={22} />} title="No assigned activities" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {activities.map((a) => (
            <div key={a.id} className="panel p-4 flex flex-col items-center text-center">
              <div className="text-sm font-bold text-gray-900">{a.title}</div>
              <div className="text-xs text-gray-400 mb-3">{a.date} · {a.venue}</div>
              <div className="p-2 bg-white">
                <QRCodeCanvas id={`fac-qr-canvas-${a.id}`} value={`${window.location.origin}/?activity=${a.id}`} size={130} fgColor="#1a5c3a" bgColor="#ffffff" />
              </div>
              <span className={`px-2 py-1 rounded-full text-[10px] font-medium mt-2 mb-3 ${PILL_STYLES[a.status] || 'bg-gray-100 text-gray-600'}`}>
                {a.status}
              </span>
              <button onClick={() => downloadQR(a.id, a.title)} className="text-primary text-xs font-semibold hover:underline">
                <Download size={14} className="inline mr-1" /> Download PNG
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FacilitatorAttendance