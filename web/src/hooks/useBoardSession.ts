import { useEffect } from 'react'
import { fromTemplate } from '~/lib/templates'
import { loadBoard, rememberBoard, saveBoard } from '~/lib/storage'
import { useBoard } from '~/store/board'

const SAVE_DELAY_MS = 400

/** Loads the board (or seeds a new one), then saves every change, debounced. */
export function useBoardSession(boardId: string) {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { board, sync } = await loadBoard(boardId).catch(() => ({ board: null, sync: 'local' as const }))
      if (cancelled) return
      const isNew = !board
      const b = board ?? fromTemplate('roadtrip', { id: boardId })
      useBoard.getState().hydrate({ ...b, id: boardId }, sync)
      rememberBoard(boardId)
      if (isNew) void saveBoard(b).then((s) => useBoard.getState().setSync(s))
      // Let the cards render and measure before fitting them on screen.
      setTimeout(() => !cancelled && useBoard.getState().fit(), 120)
    })()
    return () => {
      cancelled = true
    }
  }, [boardId])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending: ReturnType<typeof useBoard.getState>['board'] = null

    const flush = () => {
      clearTimeout(timer)
      if (!pending) return
      const b = pending
      pending = null
      void saveBoard(b)
        .then((s) => useBoard.getState().setSync(s))
        .catch(() => useBoard.getState().setSync('offline'))
    }

    const unsubscribe = useBoard.subscribe((s, prev) => {
      // Only edits to the same board are saved; hydrating a board is not an edit.
      if (!s.board || s.board === prev.board || s.board.id !== prev.board?.id) return
      pending = s.board
      clearTimeout(timer)
      timer = setTimeout(flush, SAVE_DELAY_MS)
    })
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      unsubscribe()
      window.removeEventListener('pagehide', flush)
    }
  }, [])
}

/** Keeps the store's window width current (layout switches at 760px). */
export function useWindowWidth() {
  useEffect(() => {
    const onResize = () => useBoard.getState().set({ vw: window.innerWidth })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
}

const TOOL_KEYS = { v: 'select', h: 'hand', p: 'pen', c: 'connect' } as const

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const s = useBoard.getState()
      const k = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && k === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && k === 'd') {
        e.preventDefault()
        s.duplicateSelection()
        return
      }
      if (mod || e.altKey) return
      if (k === 'delete' || k === 'backspace') s.deleteSelection()
      else if (k === 'escape') s.set({ sel: null, connectFrom: null, tool: 'select', dialog: null, addOpen: false })
      else if (k in TOOL_KEYS) s.setTool(TOOL_KEYS[k as keyof typeof TOOL_KEYS])
      else if (k === 'n') s.addNode('note')
      else if (k === 'f') s.fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
