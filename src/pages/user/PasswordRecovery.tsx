import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePageTitle } from '../../hooks/usePageTitle'
import logo from '../../assets/CYDO LOGO.jpg'

export default function PasswordRecovery({ mode }: { mode: 'request' | 'reset' }) {
  // Separate route instances keep form and success state from leaking between modes.
  return <RecoveryForm key={mode} mode={mode} />
}

function RecoveryForm({ mode }: { mode: 'request' | 'reset' }) {
  const resetting = mode === 'reset'
  usePageTitle(resetting ? 'Reset Password' : 'Forgot Password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const [sessionState, setSessionState] = useState<'checking' | 'ready' | 'invalid'>(resetting ? 'checking' : 'ready')

  useEffect(() => {
    if (!resetting) return
    let disposed = false
    // getSession waits for Supabase to consume and validate the email callback.
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!disposed) setSessionState(!error && data.session ? 'ready' : 'invalid')
    }).catch(() => {
      if (!disposed) setSessionState('invalid')
    })
    return () => { disposed = true }
  }, [resetting])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || sessionState !== 'ready') return
    setError('')
    if (resetting && password.length < 6) {
      setError('Your password must contain at least 6 characters.')
      return
    }
    if (resetting && password !== confirmation) {
      setError('The passwords do not match. Please enter them again.')
      return
    }
    setBusy(true)
    try {
      if (resetting) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) {
          if (error.status === 401 || error.status === 403 || error.code === 'session_not_found') {
            setSessionState('invalid')
            return
          }
          setError(error.message)
          return
        }
        setPassword('')
        setConfirmation('')
        // End the recovery session before returning to the normal login flow.
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) {
          setComplete(true)
          setError('Your password was changed, but we could not sign you out. Please sign out before logging in again.')
          return
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: new URL('/reset-password', window.location.origin).href,
        })
        if (error) {
          setError(error.status === 429
            ? 'Too many requests. Please wait a few minutes before trying again.'
            : 'We could not send the reset email. Please try again in a few minutes.')
          return
        }
      }
      setComplete(true)
    } catch {
      setError('Could not connect. Check your internet connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const invalid = sessionState === 'invalid'
  const title = complete ? (resetting ? 'Password updated' : 'Check your inbox')
    : invalid ? 'Request a new reset link' : resetting ? 'Set a new password' : 'Forgot your password?'

  return (
    <main className="brand-login min-h-screen flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-9 shadow-2xl" aria-labelledby="recovery-title">
        <Link to="/admin/login" className="inline-flex items-center gap-2 text-primary text-sm font-semibold min-h-11 mb-5"><ArrowLeft size={17} /> Back to sign in</Link>
        <img src={logo} alt="PCYDO logo" className="h-16 w-auto object-contain mb-5" />
        <div className="rounded-xl bg-primary-light text-primary w-11 h-11 flex items-center justify-center mb-4">{complete ? <CheckCircle2 /> : resetting ? <KeyRound /> : <Mail />}</div>
        <h1 id="recovery-title" className="text-2xl font-extrabold text-gray-900 mb-3">{title}</h1>
        {sessionState === 'checking' ? <p role="status" className="text-sm text-gray-600">Checking your reset link…</p>
          : invalid ? <>
            <p role="alert" className="text-sm text-gray-600 leading-relaxed">This reset link is invalid or has expired. Request a new email and open the latest link to continue.</p>
            <Link to="/forgot-password" className="btn-primary inline-flex justify-center w-full mt-6">Request a new link</Link>
          </> : complete ? <div role="status">
            <p className="text-sm text-gray-600 leading-relaxed">{resetting
              ? 'Your new password is ready. Sign in with it to access your account.'
              : 'If an account exists for this email address, you’ll receive a password reset link. Check your inbox and spam folder, then open the latest email.'}</p>
            {resetting ? <Link to="/admin/login" className="btn-primary inline-flex justify-center w-full mt-6">Sign in</Link>
              : <button type="button" className="text-primary font-semibold text-sm mt-6 min-h-11" onClick={() => { setComplete(false); setError('') }}>Try another email or resend</button>}
          </div> : <>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">{resetting ? 'Choose a password with at least 6 characters.' : 'Enter your account email and we’ll send you a link to reset your password.'}</p>
            <form onSubmit={submit} className="space-y-4">
              {resetting ? <>
                <div>
                  <div className="floating-label-field">
                    <input id="new-password" type={visible ? 'text' : 'password'} placeholder=" " className="input pr-12" required minLength={6} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
                    <label htmlFor="new-password">New password</label>
                    <button type="button" className="absolute right-1 top-0 min-h-11 min-w-11 flex items-center justify-center text-gray-500" aria-label={visible ? 'Hide passwords' : 'Show passwords'} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                <div className="floating-label-field">
                  <input id="confirm-password" type={visible ? 'text' : 'password'} placeholder=" " className="input" required minLength={6} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
                  <label htmlFor="confirm-password">Confirm new password</label>
                </div>
              </> : <div className="floating-label-field">
                <input id="recovery-email" type="email" placeholder=" " autoComplete="email" className="input" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
                <label htmlFor="recovery-email">Email address</label>
              </div>}
              {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl p-3">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary w-full min-h-11">{busy ? (resetting ? 'Updating password…' : 'Sending reset link…') : resetting ? 'Update password' : 'Send reset link'}</button>
            </form>
          </>}
        {complete && error && <p role="alert" className="text-sm text-red-700 mt-4">{error}</p>}
        <p className="text-xs text-gray-400 mt-7 border-t border-gray-100 pt-5">PCYDO PRIME MEAL System</p>
      </section>
    </main>
  )
}
