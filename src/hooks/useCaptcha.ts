import { useRef, useState } from 'react'
import { turnstileSiteKey } from '../lib/turnstile'

export function useCaptcha() {
  const tokenRef = useRef<string | undefined>(undefined)
  const [verified, setVerified] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const enabled = Boolean(turnstileSiteKey)
  function onToken(token: string | null) {
    tokenRef.current = token || undefined
    setVerified(Boolean(token))
  }
  return {
    enabled,
    ready: !enabled || verified,
    resetKey,
    onToken,
    getToken: () => tokenRef.current,
    reset() { onToken(null); setResetKey(value => value + 1) },
  }
}
