import { useState, useRef, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import cydoLogo from '../../assets/CYDO LOGO.jpg'
import { usePageTitle } from '../../hooks/usePageTitle'
import { AlertCircle, ArrowLeft, Check, CalendarCheck2, Users, Wallet, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import CaptchaChallenge from '../../components/CaptchaChallenge'
import { useCaptcha } from '../../hooks/useCaptcha'
import { authenticationError, captchaRequiredMessage } from '../../lib/turnstile'

const MIN_PASSWORD_LENGTH = 6

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
  describedBy?: string
}

function Field({ id, label, type, value, onChange, autoComplete, disabled, showToggle, hint, error, describedBy }: FieldProps) {
  const [visible, setVisible] = useState(false)
  const inputType = showToggle ? (visible ? 'text' : 'password') : type

  return (
    <div>
      <div className="floating-label-field floating-label-with-icon">
        {showToggle ? <Lock size={16} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" /> : <Mail size={16} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />}
        <input
          id={id}
          name={id}
          type={inputType}
          placeholder=" "
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error || undefined}
          aria-describedby={[hint ? `${id}-hint` : '', describedBy].filter(Boolean).join(' ') || undefined}
          className={`w-full border bg-gray-50 rounded-xl pl-10 py-3 text-sm ${showToggle ? 'pr-10' : 'pr-4'} transition-colors
            focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white
            disabled:bg-gray-50 disabled:cursor-not-allowed
            ${error ? 'border-red-400' : 'border-gray-200'}`}
        />
        <label htmlFor={id}>{label}</label>
        {showToggle && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            disabled={disabled}
            aria-pressed={visible}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && <p id={`${id}-hint`} className={`mt-1.5 text-xs ${error ? 'text-red-600' : 'text-gray-500'}`}>{hint}</p>}
    </div>
  )
}

export default function ParticipantSignup() {
  // ParticipantSignup.tsx
  usePageTitle('Sign Up')
  const [copyrightYear] = useState(() => new Date().getFullYear())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '', confirmPassword: '' })
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activityId = searchParams.get('activity')
  const requestedReturnTo = searchParams.get('returnTo')
  const captcha = useCaptcha()
  const submitLock = useRef(false)

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  function updateField(field: 'email' | 'password' | 'confirmPassword', value: string) {
    if (field === 'email') setEmail(value)
    else if (field === 'password') setPassword(value)
    else setConfirmPassword(value)
    setFieldErrors(fields => ({ ...fields, [field]: '', ...(field === 'password' ? { confirmPassword: '' } : {}) }))
    setError('')
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (submitLock.current) return
    setError('')

    const emailInput = formRef.current?.elements.namedItem('email') as HTMLInputElement | null
    const errors = {
      email: !email.trim() ? 'Enter your email address to continue.'
        : emailInput?.validity.typeMismatch ? 'Enter a valid email address, such as name@example.com.' : '',
      password: !password ? 'Create a password to continue.'
        : password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.` : '',
      confirmPassword: !confirmPassword ? 'Re-enter your password to confirm it.'
        : password !== confirmPassword ? 'Your passwords do not match. Re-enter the same password.' : '',
    }
    setFieldErrors(errors)
    const firstInvalid = (Object.keys(errors) as (keyof typeof errors)[]).find(field => errors[field])
    if (firstInvalid) {
      setError(errors[firstInvalid])
      const input = formRef.current?.elements.namedItem(firstInvalid) as HTMLInputElement | null
      input?.focus()
      return
    }

    const captchaToken = captcha.getToken()
    if (captcha.enabled && !captchaToken) { setError(captchaRequiredMessage); return }
    submitLock.current = true
    setLoading(true)
    try {
      const { data, error: signupError } = await supabase.auth.signUp({ email: email.trim(), password, ...(captchaToken ? { options: { captchaToken } } : {}) })

      if (signupError) {
        setError(authenticationError(signupError, /email.*(invalid|format)|invalid.*email/i.test(signupError.message)
          ? 'Enter a valid email address, such as name@example.com.'
          : signupError.message))
        return
      }

      if (data.session) {
        const profileParams = new URLSearchParams()
        if (requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')) {
          profileParams.set('returnTo', requestedReturnTo)
        } else if (activityId) {
          profileParams.set('activity', activityId)
        }
        const profileQuery = profileParams.size ? `?${profileParams.toString()}` : ''
        navigate(`/participant/complete-profile${profileQuery}`)
      }
    } catch {
      setError('Could not connect. Check your internet connection and try again.')
    } finally {
      captcha.reset()
      submitLock.current = false
      setLoading(false)
    }
  }

  return (
    <main className="brand-login min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 55%, var(--color-teal) 100%)' }}>
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        <aside className="brand-login-panel hidden md:flex flex-col items-center justify-center text-center p-10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none" aria-hidden="true"
            style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-24 h-24 rounded-2xl bg-white/95 shadow-lg flex items-center justify-center mb-6 p-3">
              <img src={cydoLogo} alt="CYDO logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-1">PCYDO PRIME</h2>
            <p className="text-sm font-medium tracking-wide uppercase text-brand-gold mb-8">MEAL System Portal</p>
            <div className="space-y-3 text-left">
              {[
                { icon: CalendarCheck2, label: 'Discover Youth Programs' },
                { icon: Users, label: 'Stay Connected to Your Community' },
                { icon: Wallet, label: 'Transparent Program Reporting' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full border border-brand-gold/60 flex items-center justify-center shrink-0"><Check size={12} className="text-brand-gold" /></span>
                  <span className="text-sm text-white/85 flex items-center gap-2"><Icon size={14} className="text-white/50" />{label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/50 mt-8 leading-relaxed">City Youth Development Office · Panabo City</p>
          </div>
        </aside>
        <section className="flex flex-col justify-center px-8 py-10 sm:px-12" aria-labelledby="signup-title">
          <Link to="/" aria-label="Back to home" title="Back to home" className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><ArrowLeft size={26} aria-hidden="true" /></Link>
          <h1 id="signup-title" className="text-3xl font-extrabold text-gray-900 mb-1">Create Account</h1>
          <p className="text-sm text-gray-500 mb-8">Sign up to join youth activities and track your evaluations.</p>

        <form ref={formRef} className="space-y-5" onSubmit={handleSignup} noValidate aria-busy={loading}>
          <Field
            id="email"
            label="Email Address"
            type="email"
            value={email}
            onChange={value => updateField('email', value)}
            autoComplete="email"
            disabled={loading}
            error={!!fieldErrors.email}
            hint={fieldErrors.email || undefined}
            describedBy={error ? 'signup-error' : undefined}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={value => updateField('password', value)}
            autoComplete="new-password"
            disabled={loading}
            showToggle
            error={!!fieldErrors.password || passwordTooShort}
            hint={fieldErrors.password || `Use at least ${MIN_PASSWORD_LENGTH} characters.`}
            describedBy={error ? 'signup-error' : undefined}
          />

          <Field
            id="confirmPassword"
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={value => updateField('confirmPassword', value)}
            autoComplete="new-password"
            disabled={loading}
            showToggle
            error={!!fieldErrors.confirmPassword || passwordsMismatch}
            hint={fieldErrors.confirmPassword || (passwordsMismatch ? 'Your passwords do not match yet.' : undefined)}
            describedBy={error ? 'signup-error' : undefined}
          />

          {confirmPassword.length > 0 && !passwordsMismatch && !passwordTooShort && (
            <p className="flex items-center gap-1.5 text-xs text-brand-green" role="status"><Check size={15} /> Passwords match</p>
          )}

          <CaptchaChallenge action="signup" resetKey={captcha.resetKey} onToken={captcha.onToken} />

          {error && (
            <div id="signup-error" role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
              <AlertCircle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-semibold">Please check your details</p>
                <p className="mt-1 text-sm leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !captcha.ready}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Spinner />}
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/admin/login" className="text-primary font-semibold hover:underline">
            Log in
          </Link>
        </p>
        <p className="text-center text-xs text-gray-400 mt-6 pt-6 border-t border-gray-100">© {copyrightYear} PCYDO PRIME MEAL System. All rights reserved.</p>
        </section>
      </div>
    </main>
  )
}
