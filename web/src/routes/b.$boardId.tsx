import { createFileRoute, redirect } from '@tanstack/react-router'
import { BoardScreen } from '~/components/BoardScreen'
import { newBoardId } from '~/lib/ids'

// Mirrors `ideaplanner_core::is_valid_id`.
const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/

export const Route = createFileRoute('/b/$boardId')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!VALID_ID.test(params.boardId)) throw redirect({ to: '/b/$boardId', params: { boardId: newBoardId() }, replace: true })
  },
  component: BoardRoute,
})

function BoardRoute() {
  const { boardId } = Route.useParams()
  return <BoardScreen key={boardId} boardId={boardId} />
}
