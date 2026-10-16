import { useEffect } from 'react'
import { fetchRates, needsRates } from '~/lib/rates'
import { useBoard } from '~/store/board'

/** Keeps exchange rates for costs in other currencies fresh on the board. */
export function useRates() {
  const need = useBoard((s) => !!s.board && s.role !== 'view' && needsRates(s.board))
  useEffect(() => {
    if (!need || !navigator.onLine) return
    let live = true
    const board = useBoard.getState().board!
    void fetchRates(board)
      .then((rates) => {
        if (!live || !rates) return
        useBoard.getState().change((b) => ({ ...b, rates: { ...b.rates, ...rates }, ratesAt: Date.now() }), 'silent')
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [need])
}
