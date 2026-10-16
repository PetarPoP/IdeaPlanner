import { useEffect, useRef, useState } from 'react'

const DURATION_MS = 450
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A number that counts to its new value instead of jumping (totals, budgets). */
export function Tween({ value, format }: { value: number; format: (v: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const current = useRef(value)
  useEffect(() => {
    if (reduced() || current.current === value) {
      current.current = value
      setShown(value)
      return
    }
    from.current = current.current
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      const eased = 1 - (1 - t) ** 3
      current.current = from.current + (value - from.current) * eased
      setShown(current.current)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(shown)}</>
}
