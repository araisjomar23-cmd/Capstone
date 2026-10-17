import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { loginAdmin, getAdminRole } from '../../features/auth/authService'
import { Mail, Lock, Eye, EyeOff, CalendarCheck2, Users, Wallet, Check } from 'lucide-react'
import logo from '../../assets/CYDO LOGO.jpg'
import { usePageTitle } from '../../hooks/usePageTitle'
import { supabase } from '../../lib/supabase' // Removed persistRememberMe import
import { useAuth } from '../../features/auth/AuthContext'

const FEATURES = [
  { icon: CalendarCheck2, label: 'Discover Youth Programs' },
  { icon: Users, label: 'Stay Connected to Your Community' },
  { icon: Wallet, label: 'Transparent Program Reporting' },
]

function AdminLogin() {
  usePageTitle('Login')
  const navigate = useNavigate()
  const { loading: authLoading, role } = useAuth()
  
  // FIX 1: Read the remembered email on initial component load
  const [email, setEmail] = useState(() => {
    return localStorage.getItem('cydo_remembered_email') || ''
  })
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  // FIX 2: Default state true if an email was already remembered
  const [rememberMe, setRememberMe] = useState(() => {
    return !!localStorage.getItem('cydo_remembered_email')
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (role === 'superadmin') {
      navigate('/admin', { replace: true })
    } else if (role === 'facilitator') {
      navigate('/admin/facilitator-portal', { replace: true })
    } else if (role === 'participant') {
      const pendingRedirect = sessionStorage.getItem('postLoginRedirect')
      sessionStorage.removeItem('postLoginRedirect')
      navigate(pendingRedirect || '/participant', { replace: true })
    }
  }, [authLoading, role, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)

    // FIX 3: Safe execution block for authentication
    const { data, error: loginError } = await loginAdmin(email.trim(), password)

    if (loginError) {
      setLoading(false)
      setError('Invalid email or password.')
      return
    }

    const userId = data.user?.id
    if (!userId) {
      setLoading(false)
      setError('Could not identify user. Please try again.')
      return
    }

    // FIX 4: Only alter persistence storage *after* successful authentication
    if (rememberMe) {
      localStorage.setItem('cydo_remembered_email', email.trim())
    } else {
      localStorage.removeItem('cydo_remembered_email')
      // If remember me is false, set Supabase session persistence to 'session' if configured in your client
    }

    const role = await getAdminRole(userId)

    if (role === 'superadmin') {
      setLoading(false)
      navigate('/admin')
      return
    }

    if (role === 'facilitator') {
      setLoading(false)
      navigate('/admin/facilitator-portal')
      return
    }

    const { data: participant } = await supabase
      .from('participants')
      .select('id')
      .eq('user_uuid', userId)
      .maybeSingle()

    const pendingRedirect = sessionStorage.getItem('postLoginRedirect')
    sessionStorage.removeItem('postLoginRedirect')

    setLoading(false)

    if (participant) {
      navigate(pendingRedirect || '/participant')
    } else {
      navigate('/participant/complete-profile')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, var(--color-primary-dark, #12432c) 0%, var(--color-primary, #1a5c3a) 55%, #2e7d5a 100%)',
      }}
    >
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left branding panel */}
        <div
          className="hidden md:flex flex-col items-center justify-center text-center p-10 relative overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, var(--color-primary, #1a5c3a) 0%, #164a30 60%, #0f3a24 100%)',
          }}
        >
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-24 h-24 rounded-2xl bg-white/95 shadow-lg flex items-center justify-center mb-6 p-3">
              <img src={logo} alt="CYDO logo" className="w-full h-full object-contain" />
            </div>

            <h2 className="text-2xl font-extrabold text-white mb-1">CYDO PRIME</h2>
            <p className="text-sm font-medium tracking-wide uppercase text-accent mb-8">
              MEAL System Portal
            </p>

            <div className="space-y-3 text-left">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full border border-accent/60 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-accent" />
                  </span>
                  <span className="text-sm text-white/85 flex items-center gap-2">
                    <Icon size={14} className="text-white/50" />
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs text-white/50 mt-8 leading-relaxed">
              City Youth Development Office · Panabo City
            </p>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex flex-col justify-center px-8 py-10 sm:px-12">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-1">Welcome Back</h1>
          <p className="text-sm text-gray-500 mb-8">Sign in to your account</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition-colors"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex items-center gap-2 text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                />
                Remember me
              </label>
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => setError('Please contact your system administrator to reset your password.')}
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-xl py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            New youth participant?{' '}
            <Link to="/signup" className="text-primary font-semibold hover:underline">
              Create an account
            </Link>
          </p>

          <p className="text-center text-xs text-gray-400 mt-6 pt-6 border-t border-gray-100">
            © {new Date().getFullYear()} CYDO PRIME MEAL System. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AdminLogin