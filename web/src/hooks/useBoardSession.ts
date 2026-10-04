import { useEffect } from 'react'
import { fromTemplate } from '~/lib/templates'
import { loadBoard, rememberBoard, saveBoard } from '~/lib/storage'
import { gesture } from '~/components/board/interaction'
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

const TOOL_KEYS = { s: 'select', v: 'select', p: 'hand', h: 'hand', d: 'pen', e: 'erase', c: 'connect' } as const
const VIEW_KEYS = { 1: 'board', 2: 'list', 3: 'costs', 4: 'timeline' } as const
const ARROWS: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useBoard.getState()
      const k = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey
      if (mod && k === 'k') {
        e.preventDefault()
        s.set({ sidebar: true })
        requestAnimationFrame(() => document.getElementById('board-search')?.focus())
        return
      }
      if (isTyping(e.target)) {
        if (k === 'escape') (e.target as HTMLElement).blur()
        return
      }
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
      if (mod && k === 'a' && s.mode === 'board') {
        e.preventDefault()
        s.selectAll()
        return
      }
      if (mod || e.altKey) return

      if (k === ' ' && s.mode === 'board') {
        // Hold space and drag to pan.
        e.preventDefault()
        if (!gesture.space) {
          gesture.space = true
          document.body.classList.add('space-pan')
        }
        return
      }
      if (k in ARROWS && s.sel && 'nodes' in s.sel) {
        e.preventDefault()
        const [dx, dy] = ARROWS[k]!
        const step = e.shiftKey ? 100 : 20
        s.nudge(dx * step, dy * step)
        return
      }
      if (k === 'delete' || k === 'backspace') s.deleteSelection()
      else if (k === 'escape') {
        if (s.dialog) s.set({ dialog: null })
        else if (s.addOpen) s.set({ addOpen: false })
        else if (s.sidebar) s.set({ sidebar: false })
        else if (s.tool !== 'select' || s.connectFrom) s.setTool('select')
        else if (s.sel) s.set({ sel: null })
        else if (s.panel) s.set({ panel: null })
      } else if (k === '?') s.toggleDialog('shortcuts')
      else if (k in VIEW_KEYS) s.setMode(VIEW_KEYS[k as unknown as keyof typeof VIEW_KEYS])
      else if (k in TOOL_KEYS) {
        const tool = TOOL_KEYS[k as keyof typeof TOOL_KEYS]
        s.setTool(s.tool === tool && tool !== 'select' ? 'select' : tool)
      } else if (k === 'n') s.addNode('note')
      else if (k === 'f') s.fit()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        gesture.space = false
        document.body.classList.remove('space-pan')
      }
    }
    const onBlur = () => {
      gesture.space = false
      document.body.classList.remove('space-pan')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
