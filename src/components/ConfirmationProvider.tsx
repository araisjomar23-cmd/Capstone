import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, CircleHelp } from 'lucide-react'

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
}

type ConfirmationContextValue = (options: ConfirmOptions) => Promise<boolean>

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null)

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const resolver = useRef<((confirmed: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve
    setRequest(options)
  }), [])

  const finish = useCallback((confirmed: boolean) => {
    const resolve = resolver.current
    resolver.current = null
    dialog.current?.close()
    setRequest(null)
    resolve?.(confirmed)
  }, [])

  useEffect(() => {
    if (!request) return
    // A modal dialog also sits above forms opened with showModal().
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [request])

  const danger = request?.tone === 'danger'

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {request && (
        <dialog
          ref={dialog}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirmation-title"
          aria-describedby="confirmation-message"
          onCancel={(event) => { event.preventDefault(); finish(false) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false) }
          }}
          className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto border-0 bg-transparent p-0 backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
        >
          <div
            className="flex min-h-full items-center justify-center p-4"
            onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false) }}
          >
            <section
              className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl animate-[slideIn_0.15s_ease-out]"
            >
              <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${danger ? 'bg-red-50 text-red-600' : 'bg-primary-light text-primary'}`}>
                {danger ? <AlertTriangle size={21} /> : <CircleHelp size={21} />}
              </div>
              <h2 id="confirmation-title" className="text-lg font-bold text-gray-900">{request.title}</h2>
              <p id="confirmation-message" className="mt-2 text-sm leading-6 text-gray-600">{request.message}</p>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => finish(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {request.cancelLabel || 'Cancel'}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => finish(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'}`}
                >
                  {request.confirmLabel || 'Confirm'}
                </button>
              </div>
            </section>
          </div>
        </dialog>
      )}
    </ConfirmationContext.Provider>
  )
}

export function useConfirmation() {
  const context = useContext(ConfirmationContext)
  if (!context) throw new Error('useConfirmation must be used inside ConfirmationProvider')
  return context
}
