import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfirmation } from '../../components/ConfirmationProvider'
import { useToast } from '../../components/ToastProvider'
import { logoutAdmin } from './authService'

export function useLogout(destination: string) {
  const confirm = useConfirmation()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const pending = useRef(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    if (pending.current) return
    pending.current = true
    try {
      const approved = await confirm({
        title: 'Log out of PRIME?',
        message: 'Are you sure you want to log out of your account?',
        confirmLabel: 'Log out',
        cancelLabel: 'Stay signed in',
      })
      if (!approved) return
      setLoggingOut(true)
      const { error } = await logoutAdmin()
      if (error) throw error
      navigate(destination, { replace: true })
    } catch {
      showToast('Could not log out. Please try again.', 'error')
    } finally {
      pending.current = false
      setLoggingOut(false)
    }
  }

  return { logout, loggingOut }
}
