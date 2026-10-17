import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

const REMEMBER_FLAG = 'cydo-remember-me'

function shouldRemember(): boolean {
  return localStorage.getItem(REMEMBER_FLAG) === 'true'
}

const conditionalStorage = {
  // FIX 1: Look in both storages. If a session exists anywhere, grab it.
  getItem: (key: string) => {
    const localItem = localStorage.getItem(key)
    if (localItem) return localItem
    return sessionStorage.getItem(key)
  },

  // FIX 2: Write to the target storage, but proactively remove it from the other
  // to prevent duplicate ghost sessions from fighting each other.
  setItem: (key: string, value: string) => {
    if (shouldRemember()) {
      sessionStorage.removeItem(key) // Clean fallback
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key) // Clean fallback
      sessionStorage.setItem(key, value)
    }
  },

  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: conditionalStorage,
    autoRefreshToken: true,
    persistSession: true
  },
})

export function setRememberMe(remember: boolean) {
  if (remember) {
    localStorage.setItem(REMEMBER_FLAG, 'true')
  } else {
    localStorage.setItem(REMEMBER_FLAG, 'false') // Keep it explicit
    
    // FIX 3: Safely wipe any historical Supabase local tokens immediately 
    // when turning remember me off, preventing session conflicts.
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) {
        localStorage.removeItem(key)
      }
    })
  }
}