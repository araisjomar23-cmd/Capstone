import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import cydoLogo from '../../assets/CYDO LOGO.jpg'
import { usePageTitle } from '../../hooks/usePageTitle'

const MIN_PASSWORD_LENGTH = 6

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a10.4 10.4 0 0 0 5.39-1.61" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

interface FieldProps {
  id: string
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  disabled?: boolean
  showToggle?: boolean
  hint?: string
  error?: boolean
}

function Field({ id, label, type, value, onChange, autoComplete, disabled, showToggle, hint, error }: FieldProps) {
  const [visible, setVisible] = useState(false)
  const inputType = showToggle ? (visible ? 'text' : 'password') : type

  return (
    <div>
      <label htmlFor={id} className="block mb-1.5 text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error || undefined}
          className={`w-full border rounded-lg px-3 py-2.5 pr-${showToggle ? '10' : '3'} transition-colors
            focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
            disabled:bg-gray-50 disabled:cursor-not-allowed
            ${error ? 'border-red-400' : 'border-gray-300'}`}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          >
            <EyeIcon open={visible} />
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export default function ParticipantSignup() {
  // ParticipantSignup.tsx
  usePageTitle('Sign Up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activityId = searchParams.get('activity')

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    setLoading(true)
    const { data, error: signupError } = await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (signupError) {
      setError(signupError.message)
      return
    }

    if (data.session) {
      const activityQuery = activityId ? `?activity=${encodeURIComponent(activityId)}` : ''
      navigate(`/participant/complete-profile${activityQuery}`)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
        <img
          src={cydoLogo}
          alt="CYDO logo"
          className="mx-auto mb-4 h-16 w-auto object-contain"
        />
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-1">
          Create Participant Account
        </h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          Sign up to register for activities and track your evaluations.
        </p>

        <form className="space-y-4" onSubmit={handleSignup} noValidate>
          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            disabled={loading}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            disabled={loading}
            showToggle
            error={passwordTooShort}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />

          <Field
            id="confirmPassword"
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            disabled={loading}
            showToggle
            error={passwordsMismatch}
          />

          {error && (
            <p role="alert" aria-live="polite" className="flex items-start gap-1.5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white font-medium py-2.5 rounded-lg
              transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Spinner />}
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-6">
          Already have an account?{' '}
          <Link to="/admin/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
