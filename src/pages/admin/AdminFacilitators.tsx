import { useEffect, useState } from 'react'
import {
  fetchFacilitatorsList,
  createFacilitatorAccount,
  deleteFacilitator,
} from '../../features/facilitators/facilitatorService'
import type { FacilitatorRow } from '../../features/facilitators/facilitatorService'
import { Trash2 } from 'lucide-react'
import { useToast } from '../../components/ToastProvider'
import { SkeletonTableRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { UserSquare2 } from 'lucide-react'

const emptyForm = { name: '', initials: '', email: '', password: '' }

function AdminFacilitators() {
  const { showToast } = useToast()
  const [list, setList] = useState<FacilitatorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const data = await fetchFacilitatorsList()
    setList(data)
    setLoading(false)
  }

  function openModal() {
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim()) return setFormError('Full name is required.')
    if (!form.initials.trim()) return setFormError('Initials are required.')
    if (!form.email.trim()) return setFormError('Email is required.')
    if (!form.password || form.password.length < 8)
      return setFormError('Password must be at least 8 characters.')

    setSubmitting(true)
    const result = await createFacilitatorAccount({
      name: form.name.trim(),
      initials: form.initials.trim().toUpperCase(),
      email: form.email.trim(),
      password: form.password,
    })
    setSubmitting(false)

    if (!result.ok) {
  setFormError(result.error || 'Failed to create facilitator.')
  return
}

setModalOpen(false)
showToast('Facilitator account created successfully.', 'success')
load()
  }

  async function handleDelete(id: string) {
  if (!confirm('Delete this facilitator? This cannot be undone.')) return
  const ok = await deleteFacilitator(id)
  if (ok) {
    setList((prev) => prev.filter((f) => f.id !== id))
    showToast('Facilitator deleted.', 'success')
  } else {
    showToast('Failed to delete facilitator.', 'error')
  }
}

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-primary">Facilitators</h1>
        <button
          onClick={openModal}
          className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90"
        >
          + Add Facilitator
        </button>
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto bg-white rounded-xl shadow border border-gray-100 hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Initials</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Activities</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
                  <SkeletonTableRows cols={6} />
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<UserSquare2 size={22} />}
                        title="No facilitators yet"
                        subtitle='Click "+ Add Facilitator" to create one.'
                      />
                    </td>
                  </tr>
                ) : (
              list.map((f) => (
                <tr key={f.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {f.initials}
                      </div>
                      <span className="font-medium text-gray-900">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{f.initials}</td>
                  <td className="px-4 py-3">{f.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        f.status === 'Active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {f.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {f.activityCount} {f.activityCount === 1 ? 'activity' : 'activities'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="text-red-500 text-xs font-semibold hover:underline"
                    >
                      <Trash2 size={14} className="inline mr-1" /> Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow border border-gray-100 !p-4 h-24 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <EmptyState
              icon={<UserSquare2 size={22} />}
              title="No facilitators yet"
              subtitle='Click "+ Add Facilitator" to create one.'
            />
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((f) => (
              <div key={f.id} className="bg-white rounded-xl shadow border border-gray-100 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {f.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{f.name}</div>
                    <div className="text-xs text-gray-400 truncate">{f.email}</div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${
                      f.status === 'Active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {f.status}
                  </span>
                </div>

                <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-500">
                    {f.activityCount} {f.activityCount === 1 ? 'activity' : 'activities'}
                  </span>
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Add Facilitator</h2>
                <p className="text-sm text-gray-500">Create a login account for a new facilitator</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Initials</label>
                <input
                  type="text"
                  value={form.initials}
                  onChange={(e) => setField('initials', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                  maxLength={3}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1"
                />
                <p className="text-[11px] text-gray-400 mt-1">At least 8 characters</p>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-primary text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminFacilitators