import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { newBoardId } from '~/lib/ids'
import type { BoardEntry } from '~/lib/storage'
import { listBoards, onBoardsChanged, saveBoard } from '~/lib/storage'
import type { TemplateKey } from '~/lib/templates'
import { fromTemplate } from '~/lib/templates'

/** The boards on this device, kept current as boards are saved, trashed or deleted. */
export function useBoardList(): BoardEntry[] | null {
  const [boards, setBoards] = useState<BoardEntry[] | null>(null)
  useEffect(() => {
    let live = true
    const load = () => void listBoards().then((b) => live && setBoards(b), () => live && setBoards([]))
    load()
    const off = onBoardsChanged(load)
    return () => {
      live = false
      off()
    }
  }, [])
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
