import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import ParticipantLayout from '../../layouts/ParticipantLayout'
import { getProvinces, getCities, getBarangays } from '../../features/public/region11Data'
import { User, Pencil, Save, X } from 'lucide-react'

interface ParticipantRow {
  id: number
  email: string
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
  birthday: string | null
  age: number | null
  gender_identity: string | null
  contact: string | null
  barangay: string | null
  city_municipality: string | null
  province: string | null
  organization: string | null
  youth_classification: string | null
  sectoral_group: string | null
}

const YOUTH_CLASSES = ['In-School Youth', 'Out-of-School Youth', 'Working Youth', 'Person with Disability (PWD Youth)']
const SECTORAL_GROUPS = ['Indigenous People', 'LGBTQIA+', 'Solo Parent', 'Youth with Disability', 'None']

function calcAge(birthday: string): number {
  const today = new Date()
  const b = new Date(birthday)
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

export default function ParticipantProfile() {
  const [row, setRow] = useState<ParticipantRow | null>(null)
  const [form, setForm] = useState<ParticipantRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('participants')
      .select('*')
      .eq('user_uuid', user.id)
      .single()

    if (data) {
      setRow(data)
      setForm(data)
    }
    setLoading(false)
  }

  function setField<K extends keyof ParticipantRow>(key: K, value: ParticipantRow[K]) {
    setForm((prev) => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      if (key === 'province') { next.city_municipality = ''; next.barangay = '' }
      if (key === 'city_municipality') { next.barangay = '' }
      return next
    })
  }

  async function handleSave() {
    if (!form) return
    setError('')

    if (!form.first_name.trim()) return setError('First name is required.')
    if (!form.last_name.trim()) return setError('Last name is required.')
    if (form.contact && !/^09\d{9}$/.test(form.contact)) {
      return setError('Contact must be a valid PH mobile number (09XXXXXXXXX).')
    }

    setSaving(true)
    const age = form.birthday ? calcAge(form.birthday) : form.age

    const { error: updateError } = await supabase
      .from('participants')
      .update({
        first_name: form.first_name,
        middle_name: form.middle_name || null,
        last_name: form.last_name,
        suffix: form.suffix || null,
        birthday: form.birthday,
        age,
        gender_identity: form.gender_identity,
        contact: form.contact,
        barangay: form.barangay,
        city_municipality: form.city_municipality,
        province: form.province,
        organization: form.organization || null,
        youth_classification: form.youth_classification,
        sectoral_group: form.sectoral_group,
      })
      .eq('id', form.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setRow(form)
    setEditing(false)
  }

  function handleCancel() {
    setForm(row)
    setError('')
    setEditing(false)
  }

  const provinces = getProvinces()
  const cities = form?.province ? getCities(form.province) : []
  const barangays = form?.province && form?.city_municipality ? getBarangays(form.province, form.city_municipality) : []

  if (loading) {
    return (
      <ParticipantLayout>
        <p className="text-gray-400">Loading profile…</p>
      </ParticipantLayout>
    )
  }

  if (!row || !form) {
    return (
      <ParticipantLayout>
        <p className="text-gray-500">No profile found.</p>
      </ParticipantLayout>
    )
  }

  return (
    <ParticipantLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <User size={26} /> My Profile
          </h1>
          <p className="text-gray-500 text-sm mt-1">{row.email}</p>
        </div>

        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn-primary inline-flex items-center gap-2">
            <Pencil size={15} /> Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleCancel} disabled={saving} className="btn-secondary inline-flex items-center gap-2">
              <X size={15} /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary inline-flex items-center gap-2">
              <Save size={15} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-4">⚠️ {error}</p>}

      <div className="panel p-6 space-y-6">
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Personal Info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="First Name" editing={editing} value={form.first_name} onChange={(v) => setField('first_name', v)} />
            <Field label="Middle Name" editing={editing} value={form.middle_name || ''} onChange={(v) => setField('middle_name', v)} />
            <Field label="Last Name" editing={editing} value={form.last_name} onChange={(v) => setField('last_name', v)} />
            <Field label="Suffix" editing={editing} value={form.suffix || ''} onChange={(v) => setField('suffix', v)} />

            {editing ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Birthday</label>
                <input type="date" className="input" value={form.birthday || ''}
                  onChange={(e) => setField('birthday', e.target.value)} />
              </div>
            ) : (
              <Field label="Birthday" editing={false} value={row.birthday || '—'} onChange={() => {}} />
            )}

            <Field label="Age" editing={false} value={String(form.age ?? '—')} onChange={() => {}} />

            {editing ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Gender Identity</label>
                <select className="input" value={form.gender_identity || ''}
                  onChange={(e) => setField('gender_identity', e.target.value)}>
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
            ) : (
              <Field label="Gender Identity" editing={false} value={row.gender_identity || '—'} onChange={() => {}} />
            )}

            <Field label="Contact Number" editing={editing} value={form.contact || ''} onChange={(v) => setField('contact', v)} placeholder="09XXXXXXXXX" />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Address</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {editing ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Province</label>
                  <select className="input" value={form.province || ''} onChange={(e) => setField('province', e.target.value)}>
                    <option value="">Select Province</option>
                    {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City / Municipality</label>
                  <select className="input" value={form.city_municipality || ''} disabled={!form.province}
                    onChange={(e) => setField('city_municipality', e.target.value)}>
                    <option value="">Select City</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Barangay</label>
                  <select className="input" value={form.barangay || ''} disabled={!form.city_municipality}
                    onChange={(e) => setField('barangay', e.target.value)}>
                    <option value="">Select Barangay</option>
                    {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <>
                <Field label="Province" editing={false} value={row.province || '—'} onChange={() => {}} />
                <Field label="City / Municipality" editing={false} value={row.city_municipality || '—'} onChange={() => {}} />
                <Field label="Barangay" editing={false} value={row.barangay || '—'} onChange={() => {}} />
              </>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Youth Info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Organization" editing={editing} value={form.organization || ''} onChange={(v) => setField('organization', v)} />

            {editing ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Youth Classification</label>
                <select className="input" value={form.youth_classification || ''}
                  onChange={(e) => setField('youth_classification', e.target.value)}>
                  <option value="">Select</option>
                  {YOUTH_CLASSES.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            ) : (
              <Field label="Youth Classification" editing={false} value={row.youth_classification || '—'} onChange={() => {}} />
            )}

            {editing ? (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sectoral Group</label>
                <select className="input" value={form.sectoral_group || ''}
                  onChange={(e) => setField('sectoral_group', e.target.value)}>
                  <option value="">Select</option>
                  {SECTORAL_GROUPS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ) : (
              <Field label="Sectoral Group" editing={false} value={row.sectoral_group || '—'} onChange={() => {}} />
            )}
          </div>
        </section>
      </div>
    </ParticipantLayout>
  )
}

function Field({
  label, value, editing, onChange, placeholder,
}: { label: string; value: string; editing: boolean; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {editing ? (
        <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="text-sm text-gray-800 py-1.5">{value || '—'}</p>
      )}
    </div>
  )
}