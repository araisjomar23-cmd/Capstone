import { useLayoutEffect, useState, type RefObject } from 'react'

// Fixed positioning lets a picker escape a scrolling form without being cut
// off by its footer. Keep it inside the visible modal and viewport instead.
export function usePickerPosition(open: boolean, trigger: RefObject<HTMLElement | null>, popup: RefObject<HTMLElement | null>, alignEnd = false) {
  const [position, setPosition] = useState({ left: 12, top: 12, width: 256, maxHeight: 360 })
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const anchor = trigger.current
      const panel = popup.current
      if (!anchor || !panel) return
      const rect = anchor.getBoundingClientRect()
      const modal = anchor.closest('dialog, [aria-modal="true"]')
      const bounds = modal?.getBoundingClientRect()
      const header = modal?.querySelector('header')?.getBoundingClientRect()
      const footer = modal?.querySelector('footer')?.getBoundingClientRect()
      const leftEdge = Math.max(12, (bounds?.left ?? 0) + 12)
      const rightEdge = Math.min(window.innerWidth - 12, (bounds?.right ?? window.innerWidth) - 12)
      const topEdge = Math.max(12, header?.bottom ?? (bounds?.top ?? 0) + 12)
      const bottomEdge = Math.min(window.innerHeight - 12, footer ? footer.top - 8 : (bounds?.bottom ?? window.innerHeight) - 12)
      const width = Math.min(256, rightEdge - leftEdge)
      const maxHeight = Math.max(80, bottomEdge - topEdge)
      const height = Math.min(panel.scrollHeight + 2, maxHeight)
      const below = bottomEdge - rect.bottom - 6
      const above = rect.top - topEdge - 6
      const desiredTop = below >= height || below >= above ? rect.bottom + 6 : rect.top - height - 6
      const next = {
        left: Math.max(leftEdge, Math.min(alignEnd ? rect.right - width : rect.left, rightEdge - width)),
        top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - height)), width, maxHeight,
      }
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const observer = new ResizeObserver(place)
    if (popup.current) observer.observe(popup.current)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer.disconnect() }
  }, [open, trigger, popup, alignEnd])
  return position
}
