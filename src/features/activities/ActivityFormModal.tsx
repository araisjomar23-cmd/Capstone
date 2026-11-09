import { activityDescription } from './activityDescription'
import { useEffect, useRef, useState } from 'react'
import {
  fetchPrograms,
  fetchFacilitators,
  fetchActivityFacilitators,
  saveActivity,
} from './activityService'
import type { Activity } from '../../types/activity'
import type { Program } from '../../types/program'
import type { Facilitator } from '../../types/facilitator'
import { useToast } from '../../components/ToastProvider'
import DatePicker from '../../components/DatePicker'
import TimePicker from '../../components/TimePicker'
import { getActivityLifecycleStatus, getActivityDisplayStatus, ACTIVITY_STATUS_DISPLAY } from './activityLifecycle'
import { useConfirmation } from '../../components/ConfirmationProvider'

interface Props {
  editingActivity: Activity | null
  repeatActivity?: Activity | null
  viewOnly?: boolean
  onEdit?: () => void
  onToggle?: () => void
  toggling?: boolean
  onClose: () => void
  onSaved: (saved?: { id: string; startDate: string; endDate: string }) => void
}

const emptyForm = {
  title: '',
  programId: '',
  slots: '',
  colorBg: '#0756a0',
  venue: '',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  checkInEarlyAccessMinutes: '30',
  previewDesc: '',
  budget: '',
  note: '',
}

function ActivityFormModal({ editingActivity, repeatActivity = null, viewOnly = false, onEdit, onToggle, toggling = false, onClose, onSaved }: Props) {
  const { showToast } = useToast()
  const confirm = useConfirmation()
  const submitLock = useRef(false)
  const isEdit = !!editingActivity
  const [form, setForm] = useState(emptyForm)
  const [programs, setPrograms] = useState<Program[]>([])
  const [allFacilitators, setAllFacilitators] = useState<Facilitator[]>([])
  const [selectedFacilitatorId, setSelectedFacilitatorId] = useState('')
  const [tagged, setTagged] = useState<Facilitator[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const [progs, facs] = await Promise.all([fetchPrograms(), fetchFacilitators()])
      setPrograms(progs)
      setAllFacilitators(facs)

      const source = editingActivity || repeatActivity
      if (source) {
        setForm({
          title: source.title,
          programId: String(source.programId),
          slots: String(source.slots),
          colorBg: source.colorBg || '#0756a0',
          venue: source.venue,
          startDate: repeatActivity ? '' : source.startDate || '',
          endDate: repeatActivity ? '' : source.endDate || '',
          startTime: source.startTime || '',
          endTime: source.endTime || '',
          checkInEarlyAccessMinutes: String(source.checkInEarlyAccessMinutes ?? 30),
          previewDesc: activityDescription(source.previewDesc, source.fullDesc),
          budget: !repeatActivity && source.budgetAlloc > 0 ? String(source.budgetAlloc) : '',
          note: source.note,
        })
        const existingFacs = await fetchActivityFacilitators(source.id)
        setTagged(existingFacs)
      }
    }
    init()
  }, [editingActivity, repeatActivity])

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addFacilitator() {
    if (!selectedFacilitatorId) return
    const f = allFacilitators.find((x) => String(x.id) === selectedFacilitatorId)
    if (!f) return
    if (tagged.some((t) => t.id === f.id)) return
    setTagged((prev) => [...prev, f])
    setSelectedFacilitatorId('')
  }

  function removeFacilitator(id: string) {
    setTagged((prev) => prev.filter((f) => f.id !== id))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = 'Activity title is required.'
    if (!form.programId) errs.programId = 'Please select a program.'
    if (!form.slots || Number(form.slots) < 1) errs.slots = 'Slots must be at least 1.'
    if (!form.venue.trim()) errs.venue = 'Venue is required.'
    if (!form.previewDesc.trim()) errs.previewDesc = 'Description is required.'
    if (!form.startDate) errs.startDate = 'Start date is required.'
    if (!form.endDate) errs.endDate = 'End date is required.'
    if (!form.startTime) errs.startTime = 'Start time is required.'
    if (!form.endTime) errs.endTime = 'End time is required.'
    if (form.startDate && form.endDate && form.endDate < form.startDate) errs.endDate = 'End date must be on or after the start date.'
    if (form.startDate === form.endDate && form.startTime && form.endTime && form.endTime <= form.startTime) errs.endTime = 'End time must be after the start time.'
    if (repeatActivity && getActivityLifecycleStatus(form) !== 'upcoming') errs.startDate = 'Choose a future start date and time for the new run.'
    if (!/^\d+$/.test(form.checkInEarlyAccessMinutes) || Number(form.checkInEarlyAccessMinutes) > 1440) {
      errs.checkInEarlyAccessMinutes = 'Enter a whole number from 0 to 1440.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (viewOnly || submitLock.current || !validate()) return
    submitLock.current = true

    setSubmitting(true)
    try {
      if (isEdit || repeatActivity) {
        const approved = await confirm({
          title: repeatActivity ? 'Create a new activity run?' : 'Save activity changes?',
          message: repeatActivity ? 'The completed activity and all its records will be kept. The new run starts with no registrations or expenses.' : 'Save the updated details for "' + form.title.trim() + '"?',
          confirmLabel: repeatActivity ? 'Create New Run' : 'Save Changes',
          cancelLabel: 'Keep Editing',
        })
        if (!approved) return
      }
    const result = await saveActivity(
      {
        title: form.title.trim(),
        programId: form.programId,
        startDate: form.startDate,
        endDate: form.endDate,
        startTime: form.startTime,
        endTime: form.endTime,
        checkInEarlyAccessMinutes: Number(form.checkInEarlyAccessMinutes),
        slots: Number(form.slots),
        status: editingActivity?.status,
        venue: form.venue.trim(),
        previewDesc: form.previewDesc.trim(),
        fullDesc: '',
        colorBg: form.colorBg,
        note: form.note.trim(),
        budget: Number(form.budget) || 0,
        ...(repeatActivity ? { previousActivityId: repeatActivity.id, tags: repeatActivity.tags, outcomes: repeatActivity.outcomes, schedule: repeatActivity.schedule, bring: repeatActivity.bring } : {}),
      },
      tagged,
      editingActivity?.id || null
    )
    if (result.ok) {
        showToast(isEdit ? 'Activity updated successfully.' : 'Activity created successfully.', 'success')
        onSaved(result.id ? { id: result.id, startDate: form.startDate, endDate: form.endDate } : undefined)
        onClose()
      } else {
        showToast('Failed to save: ' + result.error, 'error')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to save activity. Please try again.', 'error')
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  const inputClass = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm ${
      errors[field] ? 'border-red-400' : 'border-gray-300'
    }`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label={viewOnly ? "Activity Details" : isEdit ? "Edit Activity" : "Create Activity"} className="activity-form-dialog bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="p-5 sm:px-8 sm:py-6 border-b border-gray-200 bg-white z-10 flex justify-between items-start gap-5 shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {viewOnly ? 'Activity Details' : isEdit ? 'Edit Activity' : repeatActivity ? 'Create New Activity Run' : 'Create New Activity'}
            </h2>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              {viewOnly ? 'Review activity details and manage this activity below.' : isEdit ? 'Update the activity details below' : repeatActivity ? 'Choose a new schedule. Past participants, attendance, budgets, and evaluations stay with the completed run.' : 'Fill in the details to publish a new activity'}
            </p>
            {viewOnly && editingActivity && <div className="mt-3">
              <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ' + ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(editingActivity)].cls}>{ACTIVITY_STATUS_DISPLAY[getActivityDisplayStatus(editingActivity)].label}</span>
              {getActivityDisplayStatus(editingActivity) === 'closed' && <p className="mt-2 text-xs text-gray-500">Closed by an administrator. The saved schedule and existing registrations are preserved.</p>}
            </div>}

          </div>
          <button type="button" aria-label="Close activity dialog" disabled={submitting || toggling} onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <div className="overflow-y-auto p-5 sm:p-8 min-h-0 space-y-6">
          <fieldset disabled={viewOnly || submitting || toggling} className="space-y-7 min-w-0">
          <section className="space-y-5">
          <h3 className="text-base font-bold text-primary border-b border-gray-200 pb-3">Activity information</h3>
          <div className="flex gap-3">
            <div className="flex-[2]">
              <label className="text-xs font-semibold text-gray-600">Activity Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                className={inputClass('title')}
              />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>
            <div className="flex-[1.5]">
              <label className="text-xs font-semibold text-gray-600">Program</label>
              <select
                value={form.programId}
                onChange={(e) => setField('programId', e.target.value)}
                className={inputClass('programId')}
              >
                <option value="" disabled hidden>Select program</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.programId && <p className="text-xs text-red-500 mt-1">{errors.programId}</p>}
            </div>
          </div>



          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">Slots</label>
              <input
                type="number"
                min={1}
                value={form.slots}
                onChange={(e) => setField('slots', e.target.value)}
                className={inputClass('slots')}
              />
              {errors.slots && <p className="text-xs text-red-500 mt-1">{errors.slots}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">Card Color</label>
              <input
                type="color"
                value={form.colorBg}
                onChange={(e) => setField('colorBg', e.target.value)}
                className="w-full border border-gray-300 rounded-lg h-[38px] cursor-pointer"
              />
            </div>
          </div>

          </section>
          <section className="space-y-5">
          <h3 className="text-base font-bold text-primary border-b border-gray-200 pb-3">Schedule &amp; location</h3>
          <div>
            <label className="text-xs font-semibold text-gray-600">Venue</label>
            <input
              type="text"
              value={form.venue}
              onChange={(e) => setField('venue', e.target.value)}
              className={inputClass('venue')}
            />
            {errors.venue && <p className="text-xs text-red-500 mt-1">{errors.venue}</p>}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">Start Date</label>
              <DatePicker value={form.startDate} onChange={(value) => setField('startDate', value)} className={inputClass('startDate')} aria-label="Start date" />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">End Date</label>
              <DatePicker value={form.endDate} onChange={(value) => setField('endDate', value)} className={inputClass('endDate')} aria-label="End date" />
              {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">Start Time</label>
              <TimePicker value={form.startTime} onChange={(value) => setField('startTime', value)} className={inputClass('startTime')} aria-label="Start time" />
              {errors.startTime && <p className="text-xs text-red-500 mt-1">{errors.startTime}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">End Time</label>
              <TimePicker value={form.endTime} onChange={(value) => setField('endTime', value)} className={inputClass('endTime')} aria-label="End time" />
              {errors.endTime && <p className="text-xs text-red-500 mt-1">{errors.endTime}</p>}
            </div>
          </div>

          </section>
          <section className="space-y-5">
          <h3 className="text-base font-bold text-primary border-b border-gray-200 pb-3">Activity description</h3>
          <div>
            <label className="text-xs font-semibold text-gray-600">Description</label>
            <textarea
              rows={5}
              value={form.previewDesc}
              onChange={(e) => setField('previewDesc', e.target.value)}
              className={inputClass('previewDesc')}
            />
            {errors.previewDesc && <p className="text-xs text-red-500 mt-1">{errors.previewDesc}</p>}
          </div>

          </section>
          <section className="space-y-5">
          <h3 className="text-base font-bold text-primary border-b border-gray-200 pb-3">Team &amp; budget</h3>
          <div>
            <label className="text-xs font-semibold text-gray-600">Facilitators</label>
            {allFacilitators.length > 0 ? (
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedFacilitatorId}
                  onChange={(e) => setSelectedFacilitatorId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="" disabled hidden>Select facilitator</option>
                  {allFacilitators.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.initials})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addFacilitator}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                >
                  + Add
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-2">
                No facilitators found. Add one in the Facilitators section first.
              </p>
            )}
            <div className="space-y-2">
              {tagged.length === 0 ? (
                <p className="text-xs text-gray-400">No facilitators added yet.</p>
              ) : (
                tagged.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {f.initials}
                    </div>
                    <div className="flex-1 text-sm font-medium">{f.name}</div>
                    <button
                      type="button"
                      onClick={() => removeFacilitator(f.id)}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      ✕ Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Allocated Budget (₱)</label>
            <input
              type="number"
              min={0}
              value={form.budget}
              step="0.01"
              onWheel={(e) => e.currentTarget.blur()}
              onChange={(e) => setField('budget', e.target.value)}
              className={inputClass('budget')}
            />
          </div>

          </section>
          </fieldset>
          {viewOnly && editingActivity && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
              <div><span className="block text-xs text-gray-500">Registrations</span><span className="font-semibold">{editingActivity.regCount} / {editingActivity.slots}</span></div>
              <div><span className="block text-xs text-gray-500">Budget spent</span><span className="font-semibold">PHP {editingActivity.budgetSpent.toLocaleString()}</span></div>
            </div>
          )}
          </div>
          {viewOnly ? (
            <div className="flex flex-col sm:flex-row gap-3 border-t border-gray-200 p-5 sm:px-8 bg-white shrink-0">
              <button type="button" onClick={onEdit} disabled={toggling} className="btn-primary min-h-11 flex-1 disabled:opacity-50">Edit Activity</button>
              <button type="button" onClick={onToggle} disabled={toggling} className="min-h-11 flex-1 rounded-lg border border-primary px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-50">
                {toggling ? 'Updating...' : editingActivity && getActivityLifecycleStatus(editingActivity) === 'completed' ? 'Reopen as New Run' : editingActivity?.status === 'closed' ? 'Reopen Activity' : 'Close Activity'}
              </button>
            </div>
          ) : <div className="flex flex-col-reverse sm:flex-row gap-3 border-t border-gray-200 p-5 sm:px-8 bg-white shrink-0">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-primary text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
            >
              {submitting ? (isEdit ? 'Saving…' : 'Publishing…') : isEdit ? 'Save Changes' : repeatActivity ? 'Create New Run' : 'Publish Activity'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium"
            >
              Cancel
            </button>
          </div>}
        </form>
      </div>
    </div>
  )
}

export default ActivityFormModal
