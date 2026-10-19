import { Link, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/AuthContext'

interface Props {
  children: ReactNode
  allowedRoles?: string[]
  loginPath?: string
  roleMismatchMessage?: string
}

function ProtectedRoute({ children, allowedRoles, loginPath = '/admin/login', roleMismatchMessage }: Props) {
  const { loading, userId, role } = useAuth()
  const location = useLocation() 

  if (loading) return <div className="p-8 text-gray-500">Checking session…</div>

  if (!userId) {

    const returnTo = `${location.pathname}${location.search}${location.hash}`
    sessionStorage.setItem('postLoginRedirect', returnTo)
    return <Navigate to={`${loginPath}?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    if (roleMismatchMessage) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
          <p className="text-lg font-semibold text-gray-800">{roleMismatchMessage}</p>
          <Link to="/" className="text-primary font-medium hover:underline">Back to activities</Link>
        </main>
      )
    }
    return <Navigate to={loginPath} replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
