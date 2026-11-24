import { useEffect, useRef, useState } from 'react'
import { loadTurnstile, turnstileSiteKey, type TurnstileApi } from '../lib/turnstile'

interface Props {
  action: 'login' | 'signup' | 'password-reset' | 'facilitator-signup'
  resetKey: number
  onToken: (token: string | null) => void
}

export default function CaptchaChallenge({ action, resetKey, onToken }: Props) {
  const wrapper = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onToken)
  const [compact, setCompact] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => { callback.current = onToken }, [onToken])

  useEffect(() => {
    const element = wrapper.current
    if (!turnstileSiteKey || !element) return
    const measure = () => setCompact(element.getBoundingClientRect().width < 300)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!turnstileSiteKey || compact === null || !container.current) return
    let disposed = false
    let api: TurnstileApi | undefined
    let widgetId: string | undefined
    callback.current(null)
    setError('')
    setLoading(true)
    const failed = () => {
      if (disposed) return true
      callback.current(null)
      setLoading(false)
      setError('Security verification could not complete. Check your connection and try again.')
      return true
    }
    void loadTurnstile().then(sdk => {
      if (disposed || !container.current) return
      api = sdk
      widgetId = sdk.render(container.current, {
        sitekey: turnstileSiteKey,
        action,
        theme: 'light',
        size: compact ? 'compact' : 'flexible',
        'response-field': false,
        callback: token => { if (!disposed) { setError(''); callback.current(token) } },
        'expired-callback': () => { if (!disposed) callback.current(null) },
        'error-callback': failed,
        'timeout-callback': () => { failed() },
      })
      setLoading(false)
    }).catch(failed)
    return () => { disposed = true; if (widgetId !== undefined) api?.remove(widgetId) }
  }, [action, compact, resetKey, retry])

  if (!turnstileSiteKey) return null
  return <div ref={wrapper} className="min-w-0 w-full space-y-2">
    <p className="text-xs font-medium text-gray-600">Security check</p>
    <div ref={container} aria-label="Security verification" className="flex min-w-0 justify-center" />
    {loading && <p role="status" className="text-xs text-gray-500">Loading security check…</p>}
    {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-1 min-h-11 font-semibold underline">Retry security check</button></div>}
  </div>
}
