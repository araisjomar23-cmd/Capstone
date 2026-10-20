import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  'aria-label'?: string
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1
    ? date
    : null
}

function toISODate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function DatePicker({ value, onChange, className = 'input', placeholder = 'Select a date', 'aria-label': ariaLabel }: DatePickerProps) {
  const selectedDate = parseDate(value)
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = selectedDate || new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const today = toISODate(new Date())
  const days = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), -firstDay.getDay() + 1)
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
  }, [visibleMonth])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function showPicker() {
    const date = selectedDate || new Date()
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    setOpen((current) => !current)
  }

  function shiftMonth(amount: number) {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + amount, 1))
  }

  function selectDate(date: Date) {
    onChange(toISODate(date))
    setOpen(false)
  }

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        type="button"
        onClick={showPicker}
        aria-label={ariaLabel || 'Choose date'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${className} flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-900/10`}
      >
        <span className={value ? 'text-ink' : 'text-gray-400'}>
          {selectedDate
            ? new Intl.DateTimeFormat('en-PH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(selectedDate)
            : placeholder}
        </span>
        <CalendarDays size={17} className="shrink-0 text-gray-500" aria-hidden="true" />
      </button>

      {open && (
        <div role="dialog" aria-label="Choose a date" className="absolute left-0 top-[calc(100%+8px)] z-[100] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl shadow-gray-900/10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Choose date</p>
              <h3 className="mt-0.5 text-base font-bold text-gray-900">
                {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(visibleMonth)}
              </h3>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="grid size-9 place-items-center rounded-xl text-gray-600 hover:bg-gray-100">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="grid size-9 place-items-center rounded-xl text-gray-600 hover:bg-gray-100">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-7 text-center">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <span key={day} className="py-2 text-[11px] font-semibold uppercase text-gray-400">{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((date) => {
              const iso = toISODate(date)
              const inMonth = date.getMonth() === visibleMonth.getMonth()
              const isSelected = iso === value
              const isToday = iso === today
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectDate(date)}
                  aria-label={new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(date)}
                  aria-pressed={isSelected}
                  className={`mx-auto grid size-9 place-items-center rounded-xl text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary font-semibold text-white shadow-sm'
                      : isToday
                        ? 'bg-emerald-50 font-semibold text-primary ring-1 ring-inset ring-emerald-200'
                        : inMonth
                          ? 'text-gray-700 hover:bg-emerald-50 hover:text-primary'
                          : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">
              Clear date
            </button>
            <button type="button" onClick={() => selectDate(new Date())} className="rounded-lg bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DatePicker
