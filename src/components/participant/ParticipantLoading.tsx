import type { ReactNode } from 'react'
import './ParticipantLoading.css'

type LoadingView = 'catalog' | 'registrations' | 'evaluations' | 'profile' | 'detail' | 'session'
const labels: Record<LoadingView, string> = {
  catalog: 'Finding activities for you…', registrations: 'Loading your activities…',
  evaluations: 'Loading your evaluations…', profile: 'Loading your profile…',
  detail: 'Loading activity details…', session: 'Opening your participant portal…',
}
function Block({ className = '' }: { className?: string }) {
  return <div className={`participant-placeholder ${className}`} />
}
function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">{children}</div>
}
export default function ParticipantLoading({ view }: { view: LoadingView }) {
  return <div role="status" aria-label={labels[view]} className="participant-loading">
    <p className="mb-5 flex items-center gap-2.5 text-sm font-medium text-primary"><span className="participant-loading-dot" aria-hidden="true" />{labels[view]}</p>
    <div aria-hidden="true">
      {view === 'catalog' ? <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="rounded-2xl border border-gray-200 bg-white overflow-hidden"><Block className="!rounded-none h-[140px]" /><div className="p-5"><Block className="h-3 w-24 mb-4" /><Block className="h-5 w-4/5 mb-3" /><Block className="h-4 w-3/5 mb-3" /><Block className="h-4 w-2/3 mb-5" /><Block className="h-3 w-full mb-2" /><Block className="h-3 w-4/5 mb-7" /><Block className="h-2 w-full mb-4" /><Block className="h-11 w-full" /></div></div>)}</div>
      : view === 'profile' ? <><div className="flex justify-between gap-5 mb-6"><Block className="h-8 w-40" /><Block className="h-11 w-28" /></div><Panel>{['Personal information', 'Address', 'Youth information'].map(section => <div key={section} className="mb-8 last:mb-0"><Block className="h-3 w-36 mb-6" /><div className="grid sm:grid-cols-2 gap-6">{Array.from({ length: section === 'Personal information' ? 8 : 4 }, (_, i) => <div key={i}><Block className="h-3 w-24 mb-3" /><Block className="h-5 w-2/3" /></div>)}</div></div>)}</Panel></>
      : view === 'detail' ? <><Block className="h-4 w-36 mb-6" /><div className="rounded-2xl bg-white border border-gray-200 overflow-hidden"><Block className="h-28 !rounded-none" /><div className="p-6"><Block className="h-3 w-28 mb-4" /><Block className="h-8 w-4/5 mb-5" /><Block className="h-5 w-2/3 mb-6" /><div className="grid sm:grid-cols-2 gap-4 mb-6"><Block className="h-24" /><Block className="h-24" /></div>{Array.from({ length: 5 }, (_, i) => <Block key={i} className={`h-4 mb-3 ${i === 4 ? 'w-3/5' : 'w-full'}`} />)}<Block className="h-11 mt-7" /></div></div></>
      : view === 'session' ? <Panel><Block className="h-7 w-48 mb-6" /><Block className="h-4 w-full mb-3" /><Block className="h-4 w-2/3" /></Panel>
      : <div className="space-y-4">{Array.from({ length: 3 }, (_, i) => <Panel key={i}><div className="flex flex-col sm:flex-row gap-5 sm:items-center sm:justify-between"><div className="flex-1"><Block className="h-5 w-4/5 mb-4" /><Block className="h-4 w-48 max-w-full mb-3" /><Block className="h-4 w-3/5 mb-3" /><Block className="h-3 w-2/5" /></div><Block className="h-11 w-40" /></div></Panel>)}</div>}
    </div>
  </div>
}
