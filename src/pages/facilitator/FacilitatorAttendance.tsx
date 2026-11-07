import ActivityQrGallery from '../../features/attendance/ActivityQrGallery'
import { ACTIVITY_STATUS_DISPLAY, getActivityDisplayStatus, isActivityVisibleInCatalog } from '../../features/activities/activityLifecycle'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import RefreshLogButton from '../../features/attendance/RefreshLogButton'
import { useMyActivityIds } from '../../features/facilitators/useMyActivityIds'
import { fetchActivities } from '../../features/activities/activityService'
import { loadTodayLog, markAttendance } from '../../features/attendance/attendanceService'
import type { Activity } from '../../types/activity'
import type { AttendanceLogRow, MarkAttendanceResult } from '../../features/attendance/attendanceService'
import { EmptyState } from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import QrCameraScanner from '../../components/QrCameraScanner'


function FacilitatorAttendance() {
  const { activityIds, loading: idsLoading } = useMyActivityIds()
  const [activities, setActivities] = useState<Activity[]>([])
  const [log, setLog] = useState<AttendanceLogRow[]>([])
  const [selectedActivity, setSelectedActivity] = useState('')
  const [refInput, setRefInput] = useState('')
  const [dayNumber, setDayNumber] = useState(1)
  const [attendanceMethod, setAttendanceMethod] = useState<'manual' | 'qr'>('manual')
  const [scanResult, setScanResult] = useState<MarkAttendanceResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const initRef = useRef(init)
  useEffect(() => { initRef.current = init })

 useEffect(() => {
    if (!idsLoading) init()
  }, [idsLoading, activityIds])

  useEffect(() => {
    const timer = window.setInterval(() => { setClockNow(Date.now()); void initRef.current() }, 60_000)
    const channel = supabase
      .channel(`facilitator-attendance-live-${Math.random().toString(36).slice(2)}`)
.on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => { void initRef.current() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_log' }, async () => {
        const logData = await loadTodayLog()
        setLog(logData)
      })
      .subscribe()

    return () => {
      window.clearInterval(timer)
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
    if (!activities.some((a) => a.id === selectedActivity && isActivityVisibleInCatalog(a))) {
      setScanResult({ status: 'error', title: 'Activity unavailable', body: 'Select an upcoming or ongoing activity. Closed and completed activities cannot accept check-ins.' })
      return
    }
    setChecking(true)
    const result = await markAttendance(selectedActivity, refInput, dayNumber, attendanceMethod)
    setScanResult(result)
    setChecking(false)
    if (result.status === 'success') {
      setRefInput('')
      setAttendanceMethod('manual')
      const logData = await loadTodayLog()
      setLog(logData)
    }
  }

  async function handleQrScan(value: string) {
    if (checking || !selectedActivity || !activities.some((a) => a.id === selectedActivity && isActivityVisibleInCatalog(a))) return
    setRefInput(value)
    setAttendanceMethod('qr')
    setChecking(true)
    const result = await markAttendance(selectedActivity, value, dayNumber, 'qr')
    setScanResult(result)
    setChecking(false)
    if (result.status === 'success') {
      setRefInput('')
      setLog(await loadTodayLog())
    }
    setAttendanceMethod('manual')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleMark()
    }
  }


  const scannableActivities = activities.filter((a) => isActivityVisibleInCatalog(a, clockNow))

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Attendance & QR</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="panel p-4 sm:p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">Mark Attendance</h2>
          {scannableActivities.length === 0 ? (
            <EmptyState icon={<ClipboardList size={22} />} title="No active activities" subtitle="You have no upcoming or ongoing assigned activities available for check-in." />
          ) : (
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-semibold text-gray-600">Activity</label>
                <select value={selectedActivity} onChange={(e) => setSelectedActivity(e.target.value)} className="filter-select input">
                  <option value="">Choose an activity</option>
                  {scannableActivities.map((a) => (
                    <option key={a.id} value={a.id}>{a.title} ({ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(a, clockNow)].label})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-600">Reference Code</label>
                  <input
                    type="text"
                    value={refInput}
                    onChange={(e) => { setRefInput(e.target.value); setAttendanceMethod('manual') }}
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
              <button onClick={handleMark} disabled={checking || !scannableActivities.some((a) => a.id === selectedActivity)} className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-50">
                <CheckCircle2 size={16} />
                {checking ? 'Checking…' : 'Mark Attendance'}
              </button>
            </div>
          )}

          <QrCameraScanner disabled={checking || !selectedActivity} onScan={(value) => { void handleQrScan(value) }} />

          {scanResult && (
            <div className={`rounded-lg p-3 text-sm ${scanResult.status === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              <div className="font-semibold">{scanResult.title}</div>
              <div className="text-xs mt-0.5">{scanResult.body}</div>
            </div>
          )}
        </div>

        <div className="panel p-4 sm:p-5 relative min-h-64">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-gray-900">
              Today's Log <span className="text-gray-400 font-normal text-sm">({log.filter((r) => activityIds.includes(r.activityId)).length})</span>
            </h2>
            <RefreshLogButton onRefresh={async () => setLog((await loadTodayLog()).filter(row => activityIds.includes(row.activityId)))} />
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

      <ActivityQrGallery activities={activities.filter(a => activityIds.includes(a.id))} now={clockNow} onRefresh={() => void init()} />

    </div>
  )
}

export default FacilitatorAttendance
