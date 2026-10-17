import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Users } from 'lucide-react'
import { logoutAdmin } from '../features/auth/authService'
import { useAuth } from '../features/auth/AuthContext'

const navItems = [
  { to: '/admin/facilitator-portal', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/admin/facilitator-portal/attendance', label: 'Attendance & QR', icon: <ClipboardList size={18} /> },
  { to: '/admin/facilitator-portal/participants', label: 'Participants', icon: <Users size={18} /> },
]

function FacilitatorLayout() {
  const navigate = useNavigate()
  const { email } = useAuth()

  async function handleLogout() {
    await logoutAdmin()
    navigate('/admin/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-br from-primary to-primary-dark">
          <div className="text-sm font-extrabold text-white tracking-tight">City Youth Development Office</div>
          <div className="text-xs text-green-100">Facilitator Portal</div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-white/15 backdrop-blur px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Facilitator Access
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 my-0.5 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive ? 'bg-primary-light text-primary font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`
              }
            >
              <span className="shrink-0">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
              {email ? email.charAt(0).toUpperCase() : 'F'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{email || 'Facilitator'}</div>
              <div className="text-xs text-gray-400">Facilitator</div>
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

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default FacilitatorLayout