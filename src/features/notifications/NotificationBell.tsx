import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Check, CheckCheck, ClipboardCheck, CalendarDays, MessageSquare, UserPlus, Users, X, LoaderCircle, RefreshCw, AlertCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, notificationDestination, NOTIFICATION_PAGE_SIZE, type PortalNotification } from './notificationService'

const icons = { registration: UserPlus, activity: CalendarDays, assignment: Users, attendance: ClipboardCheck, evaluation: MessageSquare }

export default function NotificationBell() {
  const { userId, role } = useAuth()
  return userId ? <NotificationInbox key={`${userId}:${role}`} userId={userId} role={role} /> : null
}

export function NotificationInbox({ userId, role }: { userId: string; role: string | null }) {
  const [open, setOpen] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [items, setItems] = useState<PortalNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [limit, setLimit] = useState(NOTIFICATION_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const navigate = useNavigate()

  useEffect(() => {
    let disposed = false
    let request = 0
    let debounce: ReturnType<typeof setTimeout> | undefined
    async function refresh() {
      const current = ++request
      try {
        const [count, page] = await Promise.all([
          fetchUnreadCount(userId),
          open ? fetchNotifications(userId, unreadOnly, limit) : Promise.resolve(null),
        ])
        if (disposed || current !== request) return
        setUnreadCount(count)
        if (page) {
          setItems(page.items)
          setHasMore(page.hasMore)
        }
        setError('')
      } catch (err) {
        if (!disposed && current === request) setError(err instanceof Error ? err.message : 'Unable to load notifications.')
      } finally {
        if (!disposed && current === request) setLoading(false)
      }
    }
    function scheduleRefresh() {
      clearTimeout(debounce)
      debounce = setTimeout(() => void refresh(), 200)
    }
    void refresh()
    const channel = supabase.channel(`notifications-${userId}-${panelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, scheduleRefresh)
      .subscribe()
    // Polling also catches updates when Realtime reconnects or is unavailable.
    const poll = window.setInterval(() => { if (!document.hidden) void refresh() }, 30_000)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      disposed = true
      clearTimeout(debounce)
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [userId, open, unreadOnly, limit, revision, panelId])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function retry() {
    setLoading(true)
    setRevision(value => value + 1)
  }

  async function readOne(item: PortalNotification, follow: boolean) {
    if (saving) return
    setSaving(true)
    try {
      if (!item.read_at) {
        await markNotificationRead(userId, item.id)
        setItems(rows => rows.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row))
        setRevision(value => value + 1)
      }
      setError('')
      if (follow) {
        setOpen(false)
        navigate(notificationDestination(role, item.link))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update notification.')
    } finally {
      setSaving(false)
    }
  }

  async function readAll() {
    if (saving || !items.length) return
    setSaving(true)
    try {
      await markAllNotificationsRead(userId, items[0].created_at)
      setError('')
      setRevision(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update notifications.')
    } finally {
      setSaving(false)
    }
  }

  const visibleItems = unreadOnly ? items.filter(item => !item.read_at) : items
  return (
    <div ref={containerRef} className="relative shrink-0">
      <button ref={buttonRef} type="button" aria-label={error ? 'Notifications unavailable. Open to retry.' : `Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="dialog"
        onClick={() => { if (!open) setLoading(true); setOpen(value => !value) }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-primary-light hover:text-primary transition-colors">
        <Bell size={19} aria-hidden="true" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white ring-2 ring-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        {error && unreadCount === 0 && <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />}
      </button>
      <span className="sr-only" aria-live="polite">{unreadCount > 0 ? `${unreadCount} unread notifications` : ''}</span>
      {open && (
        <section id={panelId} role="dialog" aria-labelledby={`${panelId}-title`}
          className="fixed right-3 top-16 z-50 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:absolute sm:right-0 sm:top-full sm:mt-3">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <div><h2 id={`${panelId}-title`} className="text-base font-bold text-gray-900">Notifications</h2><p className="mt-1 text-xs text-gray-500">Your latest activity updates</p></div>
            <button ref={closeRef} type="button" aria-label="Close notifications" onClick={() => { setOpen(false); buttonRef.current?.focus() }} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 pb-3">
            <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
              {[false, true].map(unread => <button key={String(unread)} type="button" aria-pressed={unreadOnly === unread} onClick={() => { if (unread === unreadOnly) return; setUnreadOnly(unread); setLimit(NOTIFICATION_PAGE_SIZE); setLoading(true) }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${unreadOnly === unread ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{unread ? 'Unread' : 'All'}</button>)}
            </div>
            <button type="button" onClick={() => void readAll()} disabled={saving || loading || unreadCount === 0 || items.length === 0} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-40 disabled:cursor-not-allowed"><CheckCheck size={15} /> Mark all read</button>
          </div>
          {error && <div role="alert" className="m-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertCircle size={16} className="shrink-0" /><div><p>{error}</p><button type="button" onClick={retry} className="mt-2 inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={12} /> Retry</button></div></div>}
          <div className="max-h-[min(440px,calc(100dvh-250px))] overflow-y-auto overscroll-contain" aria-busy={loading}>
            {loading ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><LoaderCircle size={18} className="animate-spin" /> Loading notifications…</p>
              : !error && visibleItems.length === 0 ? <div className="px-6 py-10 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary"><BellOff size={23} /></div><p className="text-sm font-semibold text-gray-800">{unreadOnly ? 'You’re all caught up' : 'No notifications yet'}</p><p className="mt-2 text-xs leading-relaxed text-gray-500">{unreadOnly ? 'You have no unread updates.' : 'Registration, activity, and attendance updates will appear here.'}</p></div>
                : <ul className="divide-y divide-gray-100">{visibleItems.map(item => {
                  const Icon = icons[item.kind] ?? Bell
                  return <li key={item.id} className={`flex items-start gap-1 px-2 ${item.read_at ? 'bg-white' : 'bg-primary-light/50'}`}>
                    <button type="button" onClick={() => void readOne(item, true)} disabled={saving} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-4 text-left hover:bg-gray-100/70 disabled:opacity-60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-primary"><Icon size={17} /></span>
                      <span className="min-w-0"><span className={`block text-xs text-gray-900 ${item.read_at ? 'font-medium' : 'font-bold'}`}>{item.title}</span><span className="mt-1 block text-xs leading-relaxed text-gray-600 break-words">{item.message}</span><time dateTime={item.created_at} className="mt-2 block text-[10px] text-gray-500">{new Date(item.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span>
                    </button>
                    {!item.read_at && <button type="button" disabled={saving} onClick={() => void readOne(item, false)} aria-label={`Mark ${item.title} as read`} title="Mark as read" className="mt-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-white disabled:opacity-40"><Check size={16} /></button>}
                  </li>
                })}</ul>}
            {!loading && hasMore && <button type="button" onClick={() => { setLimit(value => value + NOTIFICATION_PAGE_SIZE); setLoading(true) }} className="w-full border-t border-gray-100 px-4 py-3 text-xs font-semibold text-primary hover:bg-gray-50">Load older notifications</button>}
          </div>
        </section>
      )}
    </div>
  )
}
