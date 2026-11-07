import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function RefreshLogButton({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  async function refresh() {
    if (busy.current) return
    busy.current = true
    setRefreshing(true)
    setError('')
    try { await onRefresh() }
    catch { setError('Unable to refresh. Please try again.') }
    finally { busy.current = false; setRefreshing(false) }
  }
  return <div className="text-right">
    <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-busy={refreshing}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-primary text-xs font-semibold hover:bg-primary-light disabled:opacity-70 disabled:cursor-wait">
      <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
      <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
    </button>
    {refreshing && <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/90 text-primary" aria-live="polite">
      <RefreshCw size={28} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      <span className="text-sm font-semibold">Refreshing today’s log…</span>
    </div>}
    {error && <p role="alert" className="text-xs text-red-700 mt-1">{error}</p>}
  </div>
}
