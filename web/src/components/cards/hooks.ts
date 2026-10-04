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
