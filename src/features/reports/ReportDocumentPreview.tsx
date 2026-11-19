import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { FileText, Maximize2, ZoomIn } from 'lucide-react'

// Keep the document's print proportions while fitting its preview to the screen.
export default function ReportDocumentPreview({ children, contentRef }: { children: ReactNode; contentRef: RefObject<HTMLDivElement | null> }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [actualSize, setActualSize] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 794, height: 1123 })
  useLayoutEffect(() => {
    const container = viewport.current
    const content = contentRef.current
    if (!container || !content) return
    const measure = () => {
      const next = { width: container.clientWidth, height: content.offsetHeight }
      setDimensions(previous => previous.width === next.width && previous.height === next.height ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container); observer.observe(content); measure()
    return () => observer.disconnect()
  }, [contentRef])
  const scale = actualSize ? 1 : Math.min(1, dimensions.width / 794)

  return <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
      <span className="flex items-center gap-2 text-xs font-semibold text-gray-700"><FileText size={15} />Document preview <span className="font-normal text-gray-400">· A4</span></span>
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1" aria-label="Document preview size">
        <button type="button" aria-pressed={!actualSize} onClick={() => setActualSize(false)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${!actualSize ? 'bg-primary-light text-primary' : 'text-gray-500 hover:bg-gray-50'}`}><Maximize2 size={14} />Fit page</button>
        <button type="button" aria-pressed={actualSize} onClick={() => setActualSize(true)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${actualSize ? 'bg-primary-light text-primary' : 'text-gray-500 hover:bg-gray-50'}`}><ZoomIn size={14} />Actual size</button>
      </div>
    </div>
    <div className="min-w-0 bg-slate-100 p-2 sm:p-4">
      <div ref={viewport} role="region" aria-label="Post-report document preview" tabIndex={0} className="w-full overflow-x-auto overflow-y-hidden rounded-sm">
        <div className="mx-auto" style={{ width: 794 * scale, height: dimensions.height * scale }}>
          <div ref={contentRef} className="bg-white shadow-sm" style={{ boxSizing: 'border-box', width: 794, padding: 68, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-500">{actualSize ? 'Scroll horizontally to read the full page.' : 'Preview fits your screen. Choose Actual size for a closer look.'} Print and PDF retain the full document size.</p>
    </div>
  </div>
}
