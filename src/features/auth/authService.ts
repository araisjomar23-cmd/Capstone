import { supabase } from '../../lib/supabase'

export async function loginAdmin(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password })
}

// FIX: Explicitly remove the tracking flag when logging out
export async function logoutAdmin() {
  const result = await supabase.auth.signOut()
  localStorage.removeItem('cydo-remember-me') 
  return result
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getAdminRole(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_uuid', userId)
    .maybeSingle()

  if (error) {
    console.error(error)
    return null
  }

  return data?.role ?? null
}