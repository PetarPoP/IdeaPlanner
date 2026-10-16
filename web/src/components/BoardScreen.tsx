import { useEffect } from 'react'
import { useBoardSession, useShortcuts, useWindowWidth } from '~/hooks/useBoardSession'
import { useClipboard } from '~/hooks/useClipboard'
import { useExternalLinks } from '~/hooks/useExternalLinks'
import { useLiveBoard } from '~/hooks/useLiveBoard'
import { useRates } from '~/hooks/useRates'
import { useAccount } from '~/store/account'
import { useBoard } from '~/store/board'
import { AccessGate } from './account/AccessGate'
import { SignInDialog } from './dialogs/SignInDialog'
import { Canvas } from './board/Canvas'
import { Sidebar } from './chrome/Sidebar'
import { SelectionBar, Toolbar, ZoomBar } from './chrome/Toolbar'
import { TopBar } from './chrome/TopBar'
import { BudgetDialog } from './dialogs/BudgetDialog'
import { ExportDialog } from './dialogs/ExportDialog'
import { ShortcutsDialog } from './dialogs/ShortcutsDialog'
import { TemplatesDialog } from './dialogs/TemplatesDialog'
import { SidePanel } from './panel/SidePanel'
import { CostsView } from './views/CostsView'
import { ListView } from './views/ListView'
import { PrintView } from './views/PrintView'
import { TimelineView } from './views/TimelineView'

export function BoardScreen({ boardId }: { boardId: string }) {
  useBoardSession(boardId)
  useWindowWidth()
  useShortcuts()
  useClipboard()
  useExternalLinks()
  useRates()
  const ready = useBoard((s) => s.board?.id === boardId)
  const blocked = useBoard((s) => s.blocked)
  useLiveBoard(boardId, ready)
  useEffect(() => {
    void useAccount.getState().load()
    // Came back from an expired sign-in link: offer to sign in again.
    const q = new URLSearchParams(location.search)
    if (q.get('signin')) {
      useBoard.getState().set({ dialog: 'signin' })
      history.replaceState(null, '', location.pathname)
    }
  }, [])
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
          {dialog === 'export' && <ExportDialog />}
          {dialog === 'signin' && <SignInDialog />}
          <PrintView />
        </>
      ) : blocked ? (
        <AccessGate kind={blocked} />
      ) : (
        <div className="grid h-full place-items-center text-sm text-neutral-500">Loading board…</div>
      )}
    </main>
  )
}
