import { useBoardSession, useShortcuts, useWindowWidth } from '~/hooks/useBoardSession'
import { useClipboard } from '~/hooks/useClipboard'
import { useExternalLinks } from '~/hooks/useExternalLinks'
import { useBoard } from '~/store/board'
import { Canvas } from './board/Canvas'
import { Sidebar } from './chrome/Sidebar'
import { SelectionBar, Toolbar, ZoomBar } from './chrome/Toolbar'
import { TopBar } from './chrome/TopBar'
import { BudgetDialog } from './dialogs/BudgetDialog'
import { ShortcutsDialog } from './dialogs/ShortcutsDialog'
import { TemplatesDialog } from './dialogs/TemplatesDialog'
import { SidePanel } from './panel/SidePanel'
import { CostsView } from './views/CostsView'
import { ListView } from './views/ListView'
import { TimelineView } from './views/TimelineView'

export function BoardScreen({ boardId }: { boardId: string }) {
  useBoardSession(boardId)
  useWindowWidth()
  useShortcuts()
  useClipboard()
  useExternalLinks()
  const ready = useBoard((s) => s.board?.id === boardId)
  const dialog = useBoard((s) => s.dialog)
  const mode = useBoard((s) => s.mode)

  return (
    <main
      className="fixed inset-0 overflow-hidden text-text"
      style={{ background: 'radial-gradient(1400px 800px at 70% -20%,#1d2033,var(--color-bg))' }}
    >
      {ready ? (
        <>
          {mode === 'board' ? (
            <>
              <Canvas />
              <SelectionBar />
              <Toolbar />
              <ZoomBar />
            </>
          ) : mode === 'list' ? (
            <ListView />
          ) : mode === 'costs' ? (
            <CostsView />
          ) : (
            <TimelineView />
          )}
          <TopBar />
          <SidePanel />
          <Sidebar />
          {dialog === 'budget' && <BudgetDialog />}
          {(dialog === 'templates' || dialog === 'newBoard') && <TemplatesDialog key={dialog} initial={dialog === 'newBoard' ? 'new' : 'replace'} />}
          {dialog === 'shortcuts' && <ShortcutsDialog />}
        </>
      ) : (
        <div className="grid h-full place-items-center text-sm text-neutral-500">Loading board…</div>
      )}
    </main>
  )
}
