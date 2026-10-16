import { createContext, useContext, useEffect, useState } from 'react'

/** How long things take to leave; matches the `anim-*-out` utilities. */
export const LEAVE_MS = 170

/**
 * Keeps the last shown value mounted for a moment after it goes away, so it
 * can play its leaving animation. `leaving` is true during that moment.
 */
export function usePresence<T>(value: T | null | undefined | false, ms = LEAVE_MS): { shown: T | null; leaving: boolean } {
  const [shown, setShown] = useState<T | null>(value || null)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (value) {
      setShown(value)
      setLeaving(false)
      return
    }
    setLeaving(true)
    const t = setTimeout(() => {
      setShown(null)
      setLeaving(false)
    }, ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return { shown: value || shown, leaving: !value && leaving }
}

/** Set by whoever keeps a closing dialog on screen; dialogs read it to animate out. */
export const Leaving = createContext(false)
export const useLeaving = () => useContext(Leaving)
