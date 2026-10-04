import { useBoardSession, useShortcuts, useWindowWidth } from '~/hooks/useBoardSession'
import { useExternalLinks } from '~/hooks/useExternalLinks'
import { useBoard } from '~/store/board'
import { Canvas } from './board/Canvas'
import { SelectionBar, Toolbar, ZoomBar } from './chrome/Toolbar'
import { TopBar } from './chrome/TopBar'
import { BudgetDialog } from './dialogs/BudgetDialog'
import { TemplatesDialog } from './dialogs/TemplatesDialog'
import { SidePanel } from './panel/SidePanel'

export function BoardScreen({ boardId }: { boardId: string }) {
  useBoardSession(boardId)
  useWindowWidth()
  useShortcuts()
  useExternalLinks()
  const ready = useBoard((s) => s.board?.id === boardId)
  const dialog = useBoard((s) => s.dialog)

  return (
    <main
      className="fixed inset-0 overflow-hidden text-text"
      style={{ background: 'radial-gradient(1400px 800px at 70% -20%,#1d2033,var(--color-bg))' }}
    >
      {ready ? (
        <>
          <Canvas />
          <TopBar />
          <SelectionBar />
          <Toolbar />
          <ZoomBar />
          <SidePanel />
          {dialog === 'budget' && <BudgetDialog />}
          {dialog === 'templates' && <TemplatesDialog />}
        </>
      ) : (
        <div className="grid h-full place-items-center text-sm text-neutral-500">Loading board…</div>
      )}
    </main>
  )
}
