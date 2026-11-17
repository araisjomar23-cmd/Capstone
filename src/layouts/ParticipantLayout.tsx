import { useState } from 'react'
import type { ReactNode } from 'react'
import ParticipantSidebar from '../components/participant/ParticipantSidebar'
import { Menu } from 'lucide-react'
import NotificationBell from '../features/notifications/NotificationBell'

interface Props {
  children: ReactNode
}

export default function ParticipantLayout({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ParticipantSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="portal-topbar sticky top-0 z-30 border-b flex items-center gap-3 px-4 py-3 md:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-600 hover:text-gray-900"
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <div className="flex-1 min-w-0 text-sm font-bold text-gray-800 truncate">Participant Portal</div>
          <NotificationBell />
        </div>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
