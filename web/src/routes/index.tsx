import { createFileRoute, redirect } from '@tanstack/react-router'
import { newBoardId } from '~/lib/ids'
import { lastBoardId } from '~/lib/storage'

export const Route = createFileRoute('/')({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: '/b/$boardId', params: { boardId: lastBoardId() ?? newBoardId() }, replace: true })
  },
})
