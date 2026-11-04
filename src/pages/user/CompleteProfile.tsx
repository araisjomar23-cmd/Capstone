import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import DatePicker from '../../components/DatePicker'
import FloatingLabelInput from '../../components/FloatingLabelInput'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getProvinces, getCities, getBarangays } from '../../features/public/region11Data'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useAuth } from '../../features/auth/AuthContext'
import { AlertCircle } from 'lucide-react'
import { getYouthAgeGroup } from '../../lib/youthAgeGroups'

import { YOUTH_CLASSES, SECTORAL_GROUPS } from '../../features/participants/profileOptions'

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
  const b = new Date(`${birthday}T00:00:00`)
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
  const [searchParams] = useSearchParams()
  const { refreshRole } = useAuth()
  const activityId = searchParams.get('activity')
  const requestedReturnTo = searchParams.get('returnTo')
  const age = form.birthday ? calcAge(form.birthday) : null
  const invalidAge = age !== null && (!Number.isInteger(age) || age < 15 || age > 30)

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
    if (!Number.isInteger(age) || age < 15 || age > 30) {
      return setError('Sorry, you are not eligible to participate. Participation is open only to individuals aged 15–30.')
    }

    if (!form.gender) return setError('Gender identity is required.')
    if (!/^09\d{9}$/.test(form.contact)) {
      return setError('A valid Philippine mobile number is required (09XXXXXXXXX).')
    }
    if (!form.province) return setError('Province is required.')
    if (!form.city) return setError('City / Municipality is required.')
    if (!form.barangay) return setError('Barangay is required.')
    if (!form.youthClass) return setError('Please select a Youth Classification.')
    if (!form.sectoral) return setError('Please select a Sectoral Group.')

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

    await refreshRole()
    const returnTo = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : activityId ? `/?activity=${encodeURIComponent(activityId)}` : '/participant'
    sessionStorage.removeItem('postLoginRedirect')
    navigate(returnTo)
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
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-3">Personal Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FloatingLabelInput label="First Name" value={form.firstName} autoComplete="given-name"
                onChange={(value) => setField('firstName', value)} />
              <FloatingLabelInput label="Middle Name" value={form.middleName} autoComplete="additional-name"
                onChange={(value) => setField('middleName', value)} />
              <FloatingLabelInput label="Last Name" value={form.lastName} autoComplete="family-name"
                onChange={(value) => setField('lastName', value)} />
              <FloatingLabelInput label="Suffix (Jr., III, etc.)" value={form.suffix} autoComplete="honorific-suffix"
                onChange={(value) => setField('suffix', value)} />

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Birthday</label>
                <DatePicker value={form.birthday} onChange={(value) => setField('birthday', value)} className="input" aria-label="Birthday" />
                <div aria-live="polite">
                  {invalidAge ? (
                    <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
                      <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-red-600" />
                      <div>
                        <p className="text-sm font-semibold">Age eligibility requirement</p>
                        <p className="mt-1 text-xs leading-relaxed">Sorry, you are not eligible to participate. Participation is open only to individuals aged 15–30, so you cannot complete your participant profile.</p>
                      </div>
                    </div>
                  ) : <p className="mt-1 text-xs text-gray-500">{age === null
                    ? 'Participants must be 15–30 years old.'
                    : `${age} years old · ${getYouthAgeGroup(age)}`}</p>}
                </div>
              </div>

              <select value={form.gender} onChange={(e) => setField('gender', e.target.value)} className="input self-start md:mt-5">
                <option value="">Select Gender Identity</option>
                <option>Male</option>
                <option>Female</option>
                <option>Lesbian</option>
                <option>Gay</option>
                <option>Bisexual</option>
                <option>Transgender</option>
                <option>Queer</option>
                <option>Intersex</option>
                <option>Asexual</option>
                <option>Others</option>
              </select>

              <input placeholder="Contact Number (09XXXXXXXXX)" value={form.contact}
                onChange={(e) => setField('contact', e.target.value)} className="input" />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-3">Address</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select value={form.province} onChange={(e) => setField('province', e.target.value)} className="input">
                <option value="">Select Province</option>
                {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              <select value={form.city} disabled={!form.province}
                onChange={(e) => setField('city', e.target.value)} className={`input disabled:cursor-not-allowed [&>option]:text-ink ${!form.province ? '!text-gray-400' : ''}`}>
                <option value="">Select City / Municipality</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <select value={form.barangay} disabled={!form.city}
                onChange={(e) => setField('barangay', e.target.value)} className={`input disabled:cursor-not-allowed [&>option]:text-ink ${!form.city ? '!text-gray-400' : ''}`}>
                <option value="">Select Barangay</option>
                {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-3">Youth Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input placeholder="Organization (optional)" value={form.organization}
                onChange={(e) => setField('organization', e.target.value)} className="input" />

              <select value={form.youthClass} onChange={(e) => setField('youthClass', e.target.value)} className="input">
                <option value="">Select Youth Classification</option>
                {YOUTH_CLASSES.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>

              <select required value={form.sectoral} onChange={(e) => setField('sectoral', e.target.value)} className="input md:col-span-2">
                <option value="">Select Sectoral Group</option>
                {SECTORAL_GROUPS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </section>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
            <AlertCircle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold">Please check your profile</p>
              <p className="mt-1 text-sm leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleSaveProfile}
          disabled={saving || age === null || invalidAge}
          className="mt-8 w-full btn-primary py-3 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}
