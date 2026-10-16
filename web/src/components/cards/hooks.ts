import { useMemo } from 'react'
import type { Rate } from '~/lib/budget'
import { rateOf } from '~/lib/budget'
import { useShallow } from 'zustand/react/shallow'
import { useBoard } from '~/store/board'

/** Board-level values most cards need. */
export function useBoardMeta() {
  return useBoard(
    useShallow((s) => ({
      cur: s.board?.cur ?? '€',
      splitN: s.board?.splitN ?? 1,
      people: s.board?.people ?? [],
    })),
  )
}

/** Converts a cost's currency into the board's, from the board's saved rates. */
export function useRate(): Rate {
  const cur = useBoard((s) => s.board?.cur ?? '')
  const rates = useBoard((s) => s.board?.rates)
  return useMemo(() => rateOf({ cur, rates: rates ?? {} }), [cur, rates])
}
