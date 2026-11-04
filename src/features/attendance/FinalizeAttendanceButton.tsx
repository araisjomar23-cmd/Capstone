import { useRef, useState } from 'react'
import type { Activity } from '../../types/activity'
import { getActivityDisplayStatus } from '../activities/activityLifecycle'
import { supabase } from '../../lib/supabase'
import { useConfirmation } from '../../components/ConfirmationProvider'
import { useToast } from '../../components/ToastProvider'

export default function FinalizeAttendanceButton({ activity, now, onFinalized }: {
  activity: Activity
  now: number
  onFinalized: () => void
}) {
  const confirm = useConfirmation()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  if (activity.attendanceFinalizedAt) return <p className="mt-3 text-sm font-semibold text-gray-600">Attendance finalized</p>
  if (getActivityDisplayStatus(activity, now) !== 'completed') return null

  async function finalize() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      if (!await confirm({
        title: 'Finalize attendance?',
        message: `Finalize attendance for "${activity.title}"? Remaining registered participants without attendance will be marked Absent. Existing attendance and cancelled registrations will be kept. Further evaluation and attendance submissions will be blocked. Check that everyone has finished submitting first.`,
        confirmLabel: 'Finalize Attendance',
        cancelLabel: 'Keep Open',
      })) return
      const { data, error } = await supabase.rpc('finalize_activity_attendance', { p_activity_id: activity.id })
      if (error) { showToast(error.message, 'error'); return }
      showToast(`Attendance finalized. ${Number(data) || 0} participant(s) marked Absent.`, 'success')
      onFinalized()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to finalize attendance.', 'error')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return <button type="button" disabled={busy} onClick={() => void finalize()} className="btn-primary mt-3 disabled:opacity-50">{busy ? 'Finalizing…' : 'Finalize Attendance'}</button>
}
