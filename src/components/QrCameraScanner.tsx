import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, CameraOff } from 'lucide-react'

function cameraErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/permission|notallowed|denied/i.test(message)) return 'Camera permission was denied. Allow camera access in your browser settings, or enter the reference code manually.'
  if (/notfound|no camera|device.*not found/i.test(message)) return 'No camera was found on this device. Enter the reference code manually.'
  if (!window.isSecureContext) return 'Camera access requires HTTPS, or localhost during development. Enter the reference code manually.'
  return 'Could not start the camera. Check browser permissions and enter the reference code manually if needed.'
}

export default function QrCameraScanner({ onScan, disabled = false }: { onScan: (value: string) => void; disabled?: boolean }) {
  const generatedId = useId()
  const elementId = `qr-reader-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!active || disabled) return
    let cancelled = false
    let scanner: Html5Qrcode | null = null

    async function startScanner() {
      if (!window.isSecureContext) {
        setError('Camera access requires HTTPS, or localhost during development. Enter the reference code manually.')
        return
      }
      try {
        const cameras = await Html5Qrcode.getCameras()
        if (cancelled) return
        if (cameras.length === 0) {
          setError('No camera was found on this device. Enter the reference code manually.')
          return
        }
        scanner = new Html5Qrcode(elementId, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false })
        const preferredCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label)) || cameras[0]
        await scanner.start(preferredCamera.id, { fps: 10, qrbox: { width: 240, height: 240 } }, (decodedText) => {
          if (cancelled) return
          onScanRef.current(decodedText)
          setActive(false)
        }, () => undefined)
        if (cancelled && scanner.isScanning) await scanner.stop()
      } catch (cause) {
        if (!cancelled) setError(cameraErrorMessage(cause))
      }
    }

    setError('')
    void startScanner()
    return () => {
      cancelled = true
      if (scanner?.isScanning) void scanner.stop().then(() => scanner?.clear()).catch(() => undefined)
    }
  }, [active, disabled, elementId])

  return <div className="mt-3">
    <button type="button" onClick={() => setActive((value) => !value)} disabled={disabled} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-primary disabled:opacity-50">
      {active ? <CameraOff size={16} /> : <Camera size={16} />}{active ? 'Stop camera' : 'Scan QR with camera'}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {active && <div id={elementId} className="mt-3 max-h-72 w-full overflow-hidden rounded-lg bg-black" aria-label="Camera QR scanner" />}
  </div>
}
