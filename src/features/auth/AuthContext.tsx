import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { getAdminRole } from './authService'

interface AuthState {
  loading: boolean
  userId: string | null
  email: string | null
  role: string | null
}

const AuthContext = createContext<AuthState>({
  loading: true,
  userId: null,
  email: null,
  role: null,
})

async function resolveRole(userId: string): Promise<string | null> {
  const staffRole = await getAdminRole(userId)
  if (staffRole) return staffRole

  const { data, error } = await supabase
    .from('participants')
    .select('id')
    .eq('user_uuid', userId)
    .maybeSingle()
    
  if (!error && data) return 'participant'
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, userId: null, email: null, role: null })

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (session?.user) {
        const role = await resolveRole(session.user.id)
        setState({ loading: false, userId: session.user.id, email: session.user.email ?? null, role })
      } else {
        setState({ loading: false, userId: null, email: null, role: null })
      }
    }
    init()

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const role = await resolveRole(session.user.id)
        setState({ loading: false, userId: session.user.id, email: session.user.email ?? null, role })
      } else {
        setState({ loading: false, userId: null, email: null, role: null })
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export async function handleLogout(): Promise<{ success: boolean; error: string | null }> {
  try {
    // 1. Terminate the session in Supabase 
    // This will trigger your storage adapter's `removeItem` and wipe token data from both storage contexts
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Supabase signOut error:', error.message)
      return { success: false, error: error.message }
    }

    // 2. Explicitly reset the remember flag so the storage targets reset to default
    localStorage.removeItem('cydo-remember-me')
    
    // NOTE: We deliberately DO NOT remove 'cydo_remembered_email' here.
    // This ensures that when they go back to the login screen, their email is still filled out.

    return { success: true, error: null }
  } catch (err) {
    console.error('Unexpected error during logout:', err)
    return { success: false, error: 'An unexpected error occurred.' }
  }
}