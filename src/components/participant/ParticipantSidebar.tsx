import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  User,
  LogOut,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ParticipantSidebar({ open, onClose }: Props) {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition ${
      isActive
        ? 'bg-green-100 text-green-700 font-semibold'
        : 'text-gray-600 hover:bg-gray-100'
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
        className={`w-64 bg-white border-r shadow-sm flex flex-col shrink-0 h-screen fixed md:sticky top-0 z-50 transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-6 border-b flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-700">PRIME</h1>
            <p className="text-gray-500 text-sm">Participant Portal</p>
          </div>
          <button onClick={onClose} className="md:hidden text-gray-400 hover:text-gray-700 shrink-0">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavLink to="/participant" end className={navClass} onClick={onClose}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>

          <NavLink to="/participant/my-activities" className={navClass} onClick={onClose}>
            <CalendarDays size={20} />
            My Activities
          </NavLink>

          <NavLink to="/participant/profile" className={navClass} onClick={onClose}>
            <User size={20} />
            Profile
          </NavLink>
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 text-red-500 hover:text-red-700"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}