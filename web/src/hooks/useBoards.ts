import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { newBoardId } from '~/lib/ids'
import type { BoardEntry } from '~/lib/storage'
import { listBoards, onBoardsChanged, saveBoard } from '~/lib/storage'
import type { TemplateKey } from '~/lib/templates'
import { fromTemplate } from '~/lib/templates'
import { myBoards, useAccount } from '~/store/account'

/**
 * The boards on this device plus, when signed in, the ones on my account,
 * kept current as boards are saved, trashed or deleted.
 */
export function useBoardList(): BoardEntry[] | null {
  const [boards, setBoards] = useState<BoardEntry[] | null>(null)
  const userId = useAccount((s) => s.user?.id)
  useEffect(() => {
    let live = true
    const load = async () => {
      const device = await listBoards().catch(() => [])
      const account = userId ? await myBoards().catch(() => []) : []
      const known = new Set(device.map((b) => b.id))
      // Boards from my account this device hasn't opened yet.
      const extra: BoardEntry[] = account.filter((b) => !known.has(b.id)).map(({ role, ...b }) => ({ ...b, shared: role !== 'admin' }))
      if (live) setBoards([...device, ...extra].sort((a, b) => b.updatedAt - a.updatedAt))
    }
    void load()
    const off = onBoardsChanged(() => void load())
    return () => {
      live = false
      off()
    }
  }, [userId])
  return boards
}

/** Opens a board, or makes a new one from a template and opens it. */
export function useOpenBoard() {
  const navigate = useNavigate()
  const open = useCallback((id: string) => navigate({ to: '/b/$boardId', params: { boardId: id } }), [navigate])
  const create = useCallback(
    async (key: TemplateKey) => {
      const board = fromTemplate(key, { id: newBoardId() })
      await saveBoard(board).catch(() => undefined)
      await open(board.id)
    },
    [open],
  )
  return { open, create }
}
