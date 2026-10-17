import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logoutAdmin } from '../features/auth/authService'
import { useAuth } from '../features/auth/AuthContext'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Pin,
  Wallet,
  UserSquare2,
  FileText,
  BarChart3,
  Menu,
  X,
} from 'lucide-react'

const navItems = [
  {
    section: 'Monitoring',
    items: [
      { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
      { to: '/admin/participants', label: 'Participants', icon: <Users size={18} /> },
      { to: '/admin/attendance', label: 'Attendance & QR', icon: <ClipboardList size={18} /> },
    ],
  },
  {
    section: 'Management',
    items: [
      { to: '/admin/activities', label: 'Activities', icon: <Pin size={18} /> },
      { to: '/admin/budget', label: 'Budget Monitor', icon: <Wallet size={18} /> },
    ],
  },
  {
    section: 'Team',
    items: [{ to: '/admin/facilitators', label: 'Facilitators', icon: <UserSquare2 size={18} /> }],
  },
  {
    section: 'Evaluation & Learning',
    items: [
      { to: '/admin/evaluations', label: 'Evaluations', icon: <FileText size={18} /> },
      { to: '/admin/reports', label: 'Reports & DSS', icon: <BarChart3 size={18} /> },
    ],
  },
]

function AdminLayout() {
  const navigate = useNavigate()
  const { email, role } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    await logoutAdmin()
    navigate('/admin/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 h-screen fixed md:sticky top-0 z-50 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-5 border-b border-gray-100 bg-gradient-to-br from-primary to-primary-dark flex items-start justify-between">
          <div>
            <div className="text-sm font-extrabold text-white tracking-tight">City Youth Development Office</div>
            <div className="text-xs text-green-100">Panabo City Government</div>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-white/15 backdrop-blur px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              MEAL System Admin
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-white/80 hover:text-white shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map((group) => (
            <div key={group.section} className="mb-4">
              <div className="px-5 text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5 mt-3">
                {group.section}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                  `flex items-center gap-3 mx-2 my-0.5 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-light text-primary font-semibold'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`
                }
                >
                  <span className="shrink-0">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
              {email ? email.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{email || 'Admin'}</div>
              <div className="text-xs text-gray-400 capitalize">{role || 'admin'}</div>
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

      <div className="flex-1 flex flex-col min-w-0">

        <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu size={22} />
          </button>
          <div className="text-sm font-bold text-gray-800">City Youth Development Office</div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout