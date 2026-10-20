import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  User,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../features/auth/AuthContext'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ParticipantSidebar({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { email } = useAuth()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `portal-nav-link flex items-center gap-3 mx-2 my-0.5 px-4 py-2.5 text-sm rounded-xl transition-colors ${
      isActive
        ? 'bg-primary-light text-primary font-semibold'
        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
    }`

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`portal-sidebar w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 h-screen fixed md:sticky top-0 z-50 transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="portal-brand p-5 border-b border-white/10 flex items-start justify-between">
          <div>
            <div className="text-sm font-extrabold text-white tracking-tight">City Youth Development Office</div>
            <div className="text-xs text-green-100">Panabo City Government</div>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-white/15 backdrop-blur px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              PRIME Participant Portal
            </div>
          </div>
          <button onClick={onClose} className="md:hidden text-white/80 hover:text-white shrink-0">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <div className="mb-4">
            <div className="px-5 text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5 mt-3">My PRIME</div>
          <NavLink to="/participant" end className={navClass} onClick={onClose}>
            <LayoutDashboard size={18} />
            Dashboard
          </NavLink>

          <NavLink to="/participant/my-activities" className={navClass} onClick={onClose}>
            <CalendarDays size={18} />
            My Activities
          </NavLink>

          <NavLink to="/participant/evaluations" className={navClass} onClick={onClose}>
            <ClipboardList size={18} />
            My Evaluations
          </NavLink>

          <NavLink to="/participant/profile" className={navClass} onClick={onClose}>
            <User size={18} />
            Profile
          </NavLink>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
              {email ? email.charAt(0).toUpperCase() : 'P'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{email || 'Participant'}</div>
              <div className="text-xs text-gray-400">Participant</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-xs font-medium text-red-500 border border-red-200 rounded-lg py-2 hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}
