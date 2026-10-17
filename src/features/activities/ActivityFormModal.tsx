import { useEffect, useState } from 'react'
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

interface Props {
  editingActivity: Activity | null
  onClose: () => void
  onSaved: () => void
}

const emptyForm = {
  title: '',
  programId: '',
  slots: '',
  status: 'open',
  colorBg: '#1a5c3a',
  venue: '',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  previewDesc: '',
  fullDesc: '',
  budget: '',
  note: '',
}

function ActivityFormModal({ editingActivity, onClose, onSaved }: Props) {
  const { showToast } = useToast()
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

      if (editingActivity) {
        setForm({
          title: editingActivity.title,
          programId: String(editingActivity.programId),
          slots: String(editingActivity.slots),
          status: editingActivity.status,
          colorBg: editingActivity.colorBg || '#1a5c3a',
          venue: editingActivity.venue,
          startDate: editingActivity.startDate || '',
          endDate: editingActivity.endDate || '',
          startTime: editingActivity.startTime || '',
          endTime: editingActivity.endTime || '',
          previewDesc: editingActivity.previewDesc,
          fullDesc: editingActivity.fullDesc,
          budget: editingActivity.budgetAlloc > 0 ? String(editingActivity.budgetAlloc) : '',
          note: editingActivity.note,
        })
        const existingFacs = await fetchActivityFacilitators(editingActivity.id)
        setTagged(existingFacs)
      }
    }
    init()
  }, [editingActivity])

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
    if (!form.previewDesc.trim()) errs.previewDesc = 'Preview description is required.'
    if (!form.startDate) errs.startDate = 'Start date is required.'
    if (!form.endDate) errs.endDate = 'End date is required.'
    if (!form.startTime) errs.startTime = 'Start time is required.'
    if (!form.endTime) errs.endTime = 'End time is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    const result = await saveActivity(
      {
        title: form.title.trim(),
        programId: form.programId,
        startDate: form.startDate,
        endDate: form.endDate,
        startTime: form.startTime,
        endTime: form.endTime,
        slots: Number(form.slots),
        status: form.status,
        venue: form.venue.trim(),
        previewDesc: form.previewDesc.trim(),
        fullDesc: form.fullDesc.trim(),
        colorBg: form.colorBg,
        note: form.note.trim(),
        budget: Number(form.budget) || 0,
      },
      tagged,
      editingActivity?.id || null
    )
    setSubmitting(false)

    if (result.ok) {
        showToast(isEdit ? 'Activity updated successfully.' : 'Activity created successfully.', 'success')
        onSaved()
        onClose()
      } else {
        showToast('Failed to save: ' + result.error, 'error')
      }
  }

  const inputClass = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm ${
      errors[field] ? 'border-red-400' : 'border-gray-300'
    }`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Edit Activity' : 'Create New Activity'}
            </h2>
            <p className="text-sm text-gray-500">
              {isEdit ? 'Update the activity details below' : 'Fill in the details to publish a new activity'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex gap-3">
            <div className="flex-[2]">
              <label className="text-xs font-semibold text-gray-600">Activity Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                className={inputClass('title')}
              />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>
            <div className="flex-[1.5]">
              <label className="text-xs font-semibold text-gray-600">Program *</label>
              <select
                value={form.programId}
                onChange={(e) => setField('programId', e.target.value)}
                className={inputClass('programId')}
              >
                <option value="">— Select —</option>
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
              <label className="text-xs font-semibold text-gray-600">Slots *</label>
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
              <label className="text-xs font-semibold text-gray-600">Status</label>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                className={inputClass('status')}
              >
                <option value="open">Open</option>
                <option value="upcoming">Upcoming</option>
                <option value="full">Full</option>
                <option value="closed">Closed</option>
              </select>
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

          <div>
            <label className="text-xs font-semibold text-gray-600">Venue *</label>
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
              <label className="text-xs font-semibold text-gray-600">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setField('startDate', e.target.value)}
                className={inputClass('startDate')}
              />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">End Date *</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setField('endDate', e.target.value)}
                className={inputClass('endDate')}
              />
              {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">Start Time *</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setField('startTime', e.target.value)}
                className={inputClass('startTime')}
              />
              {errors.startTime && <p className="text-xs text-red-500 mt-1">{errors.startTime}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">End Time *</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setField('endTime', e.target.value)}
                className={inputClass('endTime')}
              />
              {errors.endTime && <p className="text-xs text-red-500 mt-1">{errors.endTime}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Preview Description *</label>
            <textarea
              rows={3}
              value={form.previewDesc}
              onChange={(e) => setField('previewDesc', e.target.value)}
              className={inputClass('previewDesc')}
            />
            {errors.previewDesc && <p className="text-xs text-red-500 mt-1">{errors.previewDesc}</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">
              Full Description <span className="font-normal text-gray-400">(unlocked after registration)</span>
            </label>
            <textarea
              rows={4}
              value={form.fullDesc}
              onChange={(e) => setField('fullDesc', e.target.value)}
              className={inputClass('fullDesc')}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Facilitators</label>
            {allFacilitators.length > 0 ? (
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedFacilitatorId}
                  onChange={(e) => setSelectedFacilitatorId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— Select a facilitator —</option>
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
              onChange={(e) => setField('budget', e.target.value)}
              className={inputClass('budget')}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Internal Note</label>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setField('note', e.target.value)}
              className={inputClass('note')}
            />
          </div>

          <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-primary text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
            >
              {submitting ? (isEdit ? 'Saving…' : 'Publishing…') : isEdit ? 'Save Changes' : 'Publish Activity'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ActivityFormModal