import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Clock3 } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  'aria-label': string
}

export default function TimePicker({ value, onChange, className = 'input', 'aria-label': label }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('09:00')
  const [mode, setMode] = useState<'hour' | 'minute'>('hour')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const hour = Number(draft.slice(0, 2))
  const minute = draft.slice(3, 5)
  const period = hour >= 12 ? 'PM' : 'AM'

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function setHour(next: number) {
    setDraft(`${String(next).padStart(2, '0')}:${minute}`)
  }

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  const dialValue = mode === 'hour' ? hour % 12 || 12 : Number(minute)
  const angle = (mode === 'hour' ? hour % 12 / 12 : Number(minute) / 60) * Math.PI * 2
  const handX = 120 + Math.sin(angle) * 84
  const handY = 120 - Math.cos(angle) * 84

  function selectOnDial(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left - rect.width / 2
    const y = event.clientY - rect.top - rect.height / 2
    const turns = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1
    if (mode === 'hour') setHour(Math.round(turns * 12) % 12 + (period === 'PM' ? 12 : 0))
    else setDraft(draft.slice(0, 3) + String(Math.round(turns * 60) % 60).padStart(2, '0'))
  }

  const choiceClass = (selected: boolean) => `min-h-10 rounded-lg text-sm font-semibold transition-colors ${selected ? 'bg-primary text-white' : 'text-gray-600 hover:bg-primary-light hover:text-primary'}`

  return (
    <div ref={root} className="relative w-full min-w-0" onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button ref={trigger} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        className={`${className} flex w-full items-center justify-between gap-2 text-left`}
        onClick={() => { setDraft(value ? value.slice(0, 5) : '09:00'); setMode('hour'); setOpen(!open) }}>
        <span className={value ? 'text-ink' : 'text-gray-400'}>{value
          ? `${String(Number(value.slice(0, 2)) % 12 || 12).padStart(2, '0')}:${value.slice(3, 5)} ${Number(value.slice(0, 2)) >= 12 ? 'PM' : 'AM'}`
          : 'Select time'}</span>
        <Clock3 size={17} className="shrink-0 text-gray-500" aria-hidden="true" />
      </button>
      {open && (
        <div id={id} role="dialog" aria-label={`Choose ${label.toLowerCase()}`} className={`absolute top-[calc(100%+8px)] z-[100] w-[min(18rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)] ${label.toLowerCase().startsWith('end') ? 'right-0' : 'left-0'} rounded-2xl border border-gray-100 bg-white p-3 shadow-xl shadow-gray-900/10`}>
          <p className="mb-3 text-xs font-semibold text-gray-500">{label}</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-1" role="group" aria-label="Time period">
            {['AM', 'PM'].map((item) => <button key={item} type="button" aria-pressed={period === item} className={choiceClass(period === item)} onClick={() => setHour(hour % 12 + (item === 'PM' ? 12 : 0))}>{item}</button>)}
          </div>
          <div className="my-3 flex items-center justify-center gap-1" role="group" aria-label="Choose hours or minutes">
            <button type="button" aria-label="Choose hour" aria-pressed={mode === 'hour'} className={choiceClass(mode === 'hour') + ' px-3 text-2xl'} onClick={() => setMode('hour')}>{String(hour % 12 || 12).padStart(2, '0')}</button>
            <span className="text-xl text-gray-400">:</span>
            <button type="button" aria-label="Choose minute" aria-pressed={mode === 'minute'} className={choiceClass(mode === 'minute') + ' px-3 text-2xl'} onClick={() => setMode('minute')}>{minute}</button>
          </div>
          <p className="text-center text-xs text-gray-500">{mode === 'hour' ? 'Choose the hour' : 'Choose the minute'}</p>
          <svg viewBox="0 0 240 240" className="mx-auto mt-2 block w-full touch-none select-none rounded-full bg-gray-50 focus-visible:outline-primary" role="slider" tabIndex={0}
            aria-label={mode === 'hour' ? 'Hour' : 'Minute'} aria-valuemin={mode === 'hour' ? 1 : 0} aria-valuemax={mode === 'hour' ? 12 : 59} aria-valuenow={dialValue}
            onPointerDown={(event) => { event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); selectOnDial(event) }}
            onPointerMove={(event) => { if (event.buttons === 1) selectOnDial(event) }}
            onPointerUp={(event) => { selectOnDial(event); if (mode === 'hour') setMode('minute') }}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
              if (step) {
                event.preventDefault()
                if (mode === 'hour') setHour((hour % 12 + step + 12) % 12 + (period === 'PM' ? 12 : 0))
                else setDraft(draft.slice(0, 3) + String((Number(minute) + step + 60) % 60).padStart(2, '0'))
              }
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMode(mode === 'hour' ? 'minute' : 'hour') }
            }}>
            <line x1="120" y1="120" x2={handX} y2={handY} stroke="var(--color-primary)" strokeWidth="2" />
            <circle cx="120" cy="120" r="4" fill="var(--color-primary)" />
            <circle cx={handX} cy={handY} r="19" fill="var(--color-primary)" />
            {Array.from({ length: 12 }, (_, i) => {
              const number = mode === 'hour' ? i || 12 : i * 5
              const selected = dialValue === number
              return <text key={i} x={120 + Math.sin(i * Math.PI / 6) * 84} y={120 - Math.cos(i * Math.PI / 6) * 84} textAnchor="middle" dominantBaseline="central" fill={selected ? 'white' : 'var(--color-ink)'} fontSize="15" fontWeight="600" pointerEvents="none">{mode === 'minute' ? String(number).padStart(2, '0') : number}</text>
            })}
            {mode === 'minute' && Number(minute) % 5 !== 0 && <circle cx={handX} cy={handY} r="3" fill="white" />}
          </svg>
          <button type="button" className="btn-primary mt-3 w-full" onClick={() => { onChange(draft); close() }}>Set time</button>
        </div>
      )}
    </div>
  )
}
