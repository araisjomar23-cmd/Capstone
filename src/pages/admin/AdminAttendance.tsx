import ActivityQrGallery from '../../features/attendance/ActivityQrGallery'
import { useEffect, useState } from 'react'
import { fetchActivities } from '../../features/activities/activityService'
import { loadTodayLog, markAttendance } from '../../features/attendance/attendanceService'
import type { Activity } from '../../types/activity'
import type { AttendanceLogRow } from '../../features/attendance/attendanceService'
import type { MarkAttendanceResult } from '../../features/attendance/attendanceService'
import { ClipboardList, CheckCircle2 } from 'lucide-react'
import RefreshLogButton from '../../features/attendance/RefreshLogButton'
import { SkeletonCard } from '../../components/Skeleton'
import { supabase } from '../../lib/supabase'
import { isActivityVisibleInCatalog } from '../../features/activities/activityLifecycle'


function AdminAttendance() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [log, setLog] = useState<AttendanceLogRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [selectedActivity, setSelectedActivity] = useState('')
  const [refInput, setRefInput] = useState('')
  const [dayNumber, setDayNumber] = useState(1)
  const [scanResult, setScanResult] = useState<MarkAttendanceResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [clockNow, setClockNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    init()

    const channel = supabase
      .channel('attendance-log-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, async () => { setActivities(await fetchActivities()) })
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
     if (checking || !selectedActivity || !refInput.trim()) return
     if (!activities.some((a) => a.id === selectedActivity && isActivityVisibleInCatalog(a))) {
       setScanResult({ status: 'error', title: 'Activity unavailable', body: 'Closed and completed activities cannot accept manual check-ins.' })
       return
     }
      setChecking(true)
      const result = await markAttendance(selectedActivity, refInput, dayNumber, 'manual')
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


  const scannableActivities = activities.filter((a) => isActivityVisibleInCatalog(a, clockNow))
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
                className="filter-select w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base mt-1"
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
                  placeholder="Enter participant reference code"
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
              disabled={checking || !scannableActivities.some((a) => a.id === selectedActivity) || !refInput.trim()} // Fixed here
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

        <div className="panel p-4 sm:p-5 relative min-h-64">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-gray-900">
              Today's Log <span className="text-gray-400 font-normal text-sm">({log.length})</span>
            </h2>
            <RefreshLogButton onRefresh={async () => setLog(await loadTodayLog())} />
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

      <ActivityQrGallery activities={activities} now={clockNow} onRefresh={() => void init()} />

    </div>
  )
}

export default AdminAttendance
