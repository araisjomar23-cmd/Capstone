import { Navigate, useLocation } from 'react-router-dom' // 1. Added useLocation hook
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/AuthContext'

interface Props {
  children: ReactNode
  allowedRoles?: string[]
  loginPath?: string
}

function ProtectedRoute({ children, allowedRoles, loginPath = '/admin/login' }: Props) {
  const { loading, userId, role } = useAuth()
  const location = useLocation() 

  if (loading) return <div className="p-8 text-gray-500">Checking session…</div>

  if (!userId) {

    sessionStorage.setItem('postLoginRedirect', location.pathname)
    return <Navigate to={loginPath} replace />
  }

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return <Navigate to={loginPath} replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
