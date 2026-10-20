import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../../components/DatePicker'
import { useNavigate } from 'react-router-dom'
import { getProvinces, getCities, getBarangays } from '../../features/public/region11Data'
import { usePageTitle } from '../../hooks/usePageTitle'

const YOUTH_CLASSES = ['In-School Youth', 'Out-of-School Youth', 'Working Youth', 'Person with Disability (PWD Youth)']
const SECTORAL_GROUPS = ['Indigenous People', 'LGBTQIA+', 'Solo Parent', 'Youth with Disability', 'None']

interface FormState {
  firstName: string
  middleName: string
  lastName: string
  suffix: string
  birthday: string
  gender: string
  contact: string
  province: string
  city: string
  barangay: string
  organization: string
  youthClass: string
  sectoral: string
}

const emptyForm: FormState = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  birthday: '',
  gender: '',
  contact: '',
  province: '',
  city: '',
  barangay: '',
  organization: '',
  youthClass: '',
  sectoral: '',
}

function calcAge(birthday: string): number {
  const today = new Date()
  const b = new Date(birthday)
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

export default function CompleteProfile() {
  // CompleteProfile.tsx
  usePageTitle('Complete Profile')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const provinces = getProvinces()
  const cities = form.province ? getCities(form.province) : []
  const barangays = form.province && form.city ? getBarangays(form.province, form.city) : []

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'province') { next.city = ''; next.barangay = '' }
      if (key === 'city') { next.barangay = '' }
      return next
    })
  }

  async function handleSaveProfile() {
    setError('')

    if (!form.firstName.trim()) return setError('First name is required.')
    if (!form.lastName.trim()) return setError('Last name is required.')
    if (!form.birthday) return setError('Birthday is required.')

    const age = calcAge(form.birthday)
    if (age < 15 || age > 30) {
      return setError('PRIME serves youth aged 15–30. Please double-check your birthday.')
    }

    if (!form.gender) return setError('Gender identity is required.')
    if (!/^09\d{9}$/.test(form.contact)) {
      return setError('A valid Philippine mobile number is required (09XXXXXXXXX).')
    }
    if (!form.province) return setError('Province is required.')
    if (!form.city) return setError('City / Municipality is required.')
    if (!form.barangay) return setError('Barangay is required.')
    if (!form.youthClass) return setError('Please select a Youth Classification.')

    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      setError('No logged in user found.')
      return
    }

    const { error: insertError } = await supabase.from('participants').upsert({
      user_uuid: user.id,
      email: user.email,
      first_name: form.firstName,
      middle_name: form.middleName || null,
      last_name: form.lastName,
      suffix: form.suffix || null,
      birthday: form.birthday,
      age,
      gender_identity: form.gender,
      contact: form.contact,
      barangay: form.barangay,
      city_municipality: form.city,
      province: form.province,
      organization: form.organization || null,
      youth_classification: form.youthClass,
      sectoral_group: form.sectoral || null,
    }, { onConflict: 'user_uuid' })

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    navigate('/participant')
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-2xl panel p-8">
        <h1 className="text-3xl font-bold mb-2">Complete Your Profile</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Please complete your basic information before registering for activities.
        </p>

        <div className="space-y-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Personal Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input placeholder="First Name" value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)} className="input" />
              <input placeholder="Middle Name" value={form.middleName}
                onChange={(e) => setField('middleName', e.target.value)} className="input" />
              <input placeholder="Last Name" value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)} className="input" />
              <input placeholder="Suffix (Jr., III, etc.)" value={form.suffix}
                onChange={(e) => setField('suffix', e.target.value)} className="input" />

              <div>
                <label className="block text-xs text-gray-500 mb-1">Birthday</label>
                <DatePicker value={form.birthday} onChange={(value) => setField('birthday', value)} className="input" aria-label="Birthday" />
              </div>

              <select value={form.gender} onChange={(e) => setField('gender', e.target.value)} className="input self-end">
                <option value="">Select Gender Identity</option>
                <option>Male</option>
                <option>Female</option>
              </select>

              <input placeholder="Contact Number (09XXXXXXXXX)" value={form.contact}
                onChange={(e) => setField('contact', e.target.value)} className="input" />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Address</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select value={form.province} onChange={(e) => setField('province', e.target.value)} className="input">
                <option value="">Select Province</option>
                {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              <select value={form.city} disabled={!form.province}
                onChange={(e) => setField('city', e.target.value)} className="input">
                <option value="">Select City / Municipality</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <select value={form.barangay} disabled={!form.city}
                onChange={(e) => setField('barangay', e.target.value)} className="input">
                <option value="">Select Barangay</option>
                {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Youth Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input placeholder="Organization (optional)" value={form.organization}
                onChange={(e) => setField('organization', e.target.value)} className="input" />

              <select value={form.youthClass} onChange={(e) => setField('youthClass', e.target.value)} className="input">
                <option value="">Select Youth Classification</option>
                {YOUTH_CLASSES.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>

              <select value={form.sectoral} onChange={(e) => setField('sectoral', e.target.value)} className="input md:col-span-2">
                <option value="">Select Sectoral Group (optional)</option>
                {SECTORAL_GROUPS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </section>
        </div>

        {error && <p className="text-sm text-red-500 mt-6">⚠️ {error}</p>}

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="mt-8 w-full btn-primary py-3 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}
