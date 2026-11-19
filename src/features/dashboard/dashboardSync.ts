export type DashboardConnection = 'connecting' | 'live' | 'reconnecting' | 'offline'

export const DASHBOARD_LIVE_TABLES = ['programs', 'legacy_activities', 'registrations', 'attendance_log', 'budget_entries', 'evaluations', 'participants'] as const

interface DashboardSyncOptions {
  load: () => Promise<void>
  onError: (error: unknown) => void
  onConnection: (connection: DashboardConnection) => void
  subscribe: (onChange: () => void, onStatus: (status: string) => void) => () => void
  browser?: Window
  page?: Document
}

/** One active read, one pending catch-up, and periodic recovery for missed events. */
export function startDashboardSync({ load, onError, onConnection, subscribe, browser = window, page = document }: DashboardSyncOptions) {
  let stopped = false
  let running = false
  let pending = false
  let debounce: number | undefined
  let connected = false
  let unsubscribe: (() => void) | undefined
  let closedRetry: number | undefined

  const available = () => browser.navigator.onLine !== false
  const visible = () => page.visibilityState !== 'hidden'
  const connection = (value: DashboardConnection) => { if (!stopped) onConnection(value) }

  async function refresh() {
    if (stopped) return
    if (!available()) { connection('offline'); return }
    if (running) { pending = true; return }
    if (debounce !== undefined) { browser.clearTimeout(debounce); debounce = undefined }
    running = true
    try { await load() }
    catch (error) { if (!stopped) onError(error) }
    finally {
      running = false
      if (pending && !stopped) { pending = false; schedule() }
    }
  }

  function schedule() {
    if (stopped || !visible() || !available()) return
    if (running) { pending = true; return }
    if (debounce !== undefined) return
    debounce = browser.setTimeout(() => { debounce = undefined; void refresh() }, 250)
  }

  function connect() {
    if (stopped) return
    if (closedRetry !== undefined) { browser.clearTimeout(closedRetry); closedRetry = undefined }
    // Invalidate callbacks from a removed channel before replacing it.
    const remove = unsubscribe
    unsubscribe = undefined
    generation++
    remove?.()
    const current = generation
    try {
      unsubscribe = subscribe(() => { if (current === generation) schedule() }, status => {
        if (stopped || current !== generation) return
        connected = status === 'SUBSCRIBED'
        connection(!available() ? 'offline' : connected ? 'live' : 'reconnecting')
        if (connected) schedule() // Catch changes between the first read and subscription.
        // Supabase retries channel errors/timeouts. A fully CLOSED channel needs replacement.
        if (status === 'CLOSED' && closedRetry === undefined) {
          closedRetry = browser.setTimeout(() => { closedRetry = undefined; if (available()) connect() }, 5_000)
        }
      })
    } catch {
      connection(available() ? 'reconnecting' : 'offline')
      // The periodic recovery path also retries subscription setup.
    }
  }
  let generation = 0

  function catchUp() {
    if (stopped || !visible() || !available()) return
    if (!connected && !unsubscribe) connect()
    schedule()
  }
  function online() {
    connection(connected ? 'live' : 'reconnecting')
    if (!connected) connect()
    catchUp()
  }
  function offline() { connected = false; connection('offline') }

  connection(available() ? 'connecting' : 'offline')
  void refresh()
  if (available()) connect()
  // Poll even while connected: activity lifecycle changes and missed events still refresh.
  const poll = browser.setInterval(catchUp, 30_000)
  browser.addEventListener('online', online)
  browser.addEventListener('offline', offline)
  browser.addEventListener('focus', catchUp)
  page.addEventListener('visibilitychange', catchUp)

  return {
    refresh,
    stop() {
      stopped = true
      generation++
      browser.clearInterval(poll)
      if (debounce !== undefined) browser.clearTimeout(debounce)
      if (closedRetry !== undefined) browser.clearTimeout(closedRetry)
      browser.removeEventListener('online', online)
      browser.removeEventListener('offline', offline)
      browser.removeEventListener('focus', catchUp)
      page.removeEventListener('visibilitychange', catchUp)
      unsubscribe?.()
    },
  }
}
