import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { usePresence } from '../presence'
import { cx } from '../ui'

/**
 * A panel under its trigger. Closes on Escape or a press outside it (the
 * trigger itself toggles it, so presses on `anchor` don't count).
 */
export function Popover({
  open,
  onClose,
  anchor,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  anchor: React.RefObject<HTMLElement | null>
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchor])
  const { shown, leaving } = usePresence(open, 120)
  if (!shown) return null
  return (
    <div ref={ref} className={cx('glass absolute z-50 rounded-xl p-3', leaving ? 'anim-fade-out pointer-events-none' : 'anim-pop', className)}>
      {children}
    </div>
  )
}
