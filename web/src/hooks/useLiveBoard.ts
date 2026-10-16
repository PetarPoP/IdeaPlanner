import { useEffect } from 'react'
import type { Board } from '~/lib/model.gen'
import { LiveSession, colorFor } from '~/lib/live'
import { applyPatch, diff, isEmptyPatch } from '~/lib/patch'
import { serverApi } from '~/lib/storage'
import { useAccount } from '~/store/account'
import { selectedNodes, useBoard } from '~/store/board'
import { setPeer, useLive } from '~/store/live'

const SEND_DELAY_MS = 60

/** The open live connection, so saving knows the server already has the edits. */
export const live: { session: LiveSession | null } = { session: null }

/** Joins the board's live room when the server has one: sends my edits as patches, applies everyone else's. */
export function useLiveBoard(boardId: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let stopped = false
    let session: LiveSession | null = null
    // The board as the server has it, as far as I know.
    let synced: Board | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const offs: Array<() => void> = []

    const send = () => {
      clearTimeout(timer)
      const board = useBoard.getState().board
      if (!session?.open || !synced || !board || board.id !== boardId) return
      const p = diff(synced, board)
      if (isEmptyPatch(p)) return
      if (session.patch(p)) synced = board
    }

    const hello = () => {
      const { user } = useAccount.getState()
      const { board, me } = useBoard.getState()
      const name = user?.name || board?.people[me]?.name || 'Guest'
      return { name, color: colorFor(user?.id ?? name) }
    }

    void serverApi().then((api) => {
      if (stopped || !api?.live) return
      session = new LiveSession(api.base, boardId, hello, {
        welcome(board, role, peers) {
          const s = useBoard.getState()
          useLive.setState({ peers: Object.fromEntries(peers.map((p) => [p.id, p])) })
          synced = board
          // Take the server's copy; my own unsent edits were saved with a PUT already.
          if (s.board) {
            s.applyRemote(diff(s.board, board))
            s.set({ role })
          }
          session?.selection(selectedNodes(s.sel))
        },
        patch(p) {
          if (!synced) return
          synced = applyPatch(synced, p)
          useBoard.getState().applyRemote(p)
        },
        reset(board) {
          const s = useBoard.getState()
          synced = board
          if (s.board) s.applyRemote(diff(s.board, board))
        },
        peer: setPeer,
        status: (status) => useLive.setState(status === 'live' ? { status } : { status, peers: {} }),
      })
      live.session = session

      offs.push(
        useBoard.subscribe((s, prev) => {
          if (s.board !== prev.board && s.board?.id === boardId) {
            clearTimeout(timer)
            timer = setTimeout(send, SEND_DELAY_MS)
          }
          if (s.sel !== prev.sel) session?.selection(selectedNodes(s.sel))
        }),
      )
      // My pointer on the board, in board units (the canvas fills the window).
      const onMove = (e: PointerEvent) => {
        const { view, mode } = useBoard.getState()
        if (mode === 'board') session?.cursor((e.clientX - view.x) / view.z, (e.clientY - view.y) / view.z)
      }
      window.addEventListener('pointermove', onMove)
      offs.push(() => window.removeEventListener('pointermove', onMove))
    })

    return () => {
      stopped = true
      send()
      clearTimeout(timer)
      offs.forEach((f) => f())
      session?.close()
      if (live.session === session) live.session = null
      useLive.setState({ status: 'off', peers: {} })
    }
  }, [boardId, ready])
}

