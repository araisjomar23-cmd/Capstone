export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || ''

export interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string
    action: string
    theme: 'light'
    size: 'compact' | 'flexible'
    'response-field': boolean
    callback: (token: string) => void
    'expired-callback': () => void
    'error-callback': () => boolean
    'timeout-callback': () => void
  }): string
  remove(widgetId: string): void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const scriptId = 'prime-turnstile-script'
let pending: Promise<TurnstileApi> | null = null

// One official SDK load is shared by all SPA forms. Failed loads can be retried.
export function loadTurnstile(): Promise<TurnstileApi> {
  if (pending) return pending
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    let script: HTMLScriptElement | undefined
    let settled = false
    const fail = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      script?.remove()
      reject(new Error('The security check could not load.'))
    }
    const timeout = window.setTimeout(fail, 20000)
    const loaded = () => {
      const api = window.turnstile
      if (!api || typeof api.render !== 'function') { fail(); return }
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(api)
    }
    // The script load event is the readiness signal for async explicit rendering.
    // turnstile.ready() is reserved for synchronously loaded SDK scripts.
    if (window.turnstile?.render) { loaded(); return }
    script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onerror = fail
    script.onload = loaded
    document.head.appendChild(script)
  }).catch(error => { pending = null; throw error })
  return pending
}

export const captchaRequiredMessage = 'Please complete the security check before continuing.'

export function authenticationError(error: { code?: string; status?: number; message?: string }, fallback: string): string {
  if (error.code === 'captcha_failed' || /captcha|turnstile/i.test(error.message || '')) {
    return 'The security check expired or could not be verified. Please complete it again.'
  }
  if (error.status === 429) return 'Too many requests. Please wait a few minutes before trying again.'
  return fallback
}
