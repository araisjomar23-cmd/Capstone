import { useState } from 'react'
import type { ReactNode } from 'react'
import ParticipantSidebar from '../components/participant/ParticipantSidebar'
import { Menu } from 'lucide-react'

interface Props {
  children: ReactNode
}

export default function ParticipantLayout({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-paper flex">
      <ParticipantSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden sticky top-0 z-30 bg-white border-b border-border-warm flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu size={22} />
          </button>
          <div className="text-sm font-bold text-gray-800">PRIME Participant Portal</div>
        </div>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}