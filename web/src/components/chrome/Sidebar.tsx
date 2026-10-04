import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowCounterClockwise, CaretDown, Keyboard, Lightbulb, MagnifyingGlass, Plus, Trash, X } from '@phosphor-icons/react'
import { useBoardList, useOpenBoard } from '~/hooks/useBoards'
import { rangeLabel } from '~/lib/dates'
import { NamedIcon } from '~/lib/icons'
import type { BoardEntry } from '~/lib/storage'
import { deleteBoard, restoreBoard, trashBoard } from '~/lib/storage'
import { isMobileWidth, useBoard } from '~/store/board'
import { cx } from '../ui'

/** All boards on this device: mine, shared with me, and the trash. Opened from the top-left button. */
export function Sidebar() {
  const open = useBoard((s) => s.sidebar)
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const set = useBoard((s) => s.set)
  if (!open) return null
  return (
    <>
      <div
        className="anim-fade absolute inset-0 z-[54] bg-[color-mix(in_srgb,var(--color-bg)_45%,transparent)]"
        onPointerDown={() => set({ sidebar: false })}
      />
      <aside
        aria-label="Your boards"
        className={cx(
          'anim-slide-left absolute top-0 bottom-0 left-0 z-[55] flex flex-col gap-4 bg-[color-mix(in_srgb,var(--color-surface)_97%,transparent)] px-3.5 py-4 shadow-lg backdrop-blur-md',
          mobile ? 'w-[86%] max-w-[320px]' : 'w-[290px]',
        )}
      >
        <SidebarBody />
      </aside>
    </>
  )
}

function SidebarBody() {
  const boards = useBoardList()
  const current = useBoard((s) => s.board?.id)
  const { set, toggleDialog } = useBoard.getState()
  const { open } = useOpenBoard()
  const [q, setQ] = useState('')
  const [showTrash, setShowTrash] = useState(false)

  const match = (b: BoardEntry) => !q || b.title.toLowerCase().includes(q.toLowerCase())
  const live = (boards ?? []).filter((b) => !b.trashedAt && match(b))
  const mine = live.filter((b) => !b.shared)
  const shared = live.filter((b) => b.shared)
  const trash = (boards ?? []).filter((b) => b.trashedAt && match(b))

  const go = (id: string) => {
    set({ sidebar: false })
    if (id !== current) void open(id)
  }
  const remove = (id: string) => {
    trashBoard(id)
    // Leaving the trashed board: open the next one, or a fresh one.
    if (id === current) {
      const next = live.find((b) => b.id !== id)
      if (next) void open(next.id)
      else toggleDialog('newBoard')
    }
  }

  return (
    <>
      <div className="flex items-center gap-2.5 px-1.5">
        <span className="grid size-[26px] place-items-center rounded-[7px] border border-accent text-accent shadow-glow">
          <Lightbulb />
        </span>
        <span className="text-[15px] font-medium">Idea Planner</span>
        <button type="button" aria-label="Close" onClick={() => set({ sidebar: false })} className="btn btn-icon ml-auto size-8 text-neutral-400">
          <X />
        </button>
      </div>
      <label className="flex items-center gap-2 rounded-lg bg-bg px-2.5 py-1.5 text-[13px] text-neutral-500 shadow-inset focus-within:shadow-[inset_0_0_0_1px_var(--color-accent)]">
        <MagnifyingGlass />
        <input id="board-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search boards" className="field flex-1 text-text" />
        <span className="text-[11px]">Ctrl K</span>
      </label>
      <button
        type="button"
        onClick={() => {
          set({ sidebar: false })
          toggleDialog('newBoard')
        }}
        className="btn btn-primary justify-start"
      >
        <Plus />
        New board
      </button>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-1">
        <Group label="My boards">
          {boards == null && <span className="px-2.5 text-xs text-neutral-600">Loading…</span>}
          {mine.map((b) => (
            <Row key={b.id} b={b} on={b.id === current} onOpen={() => go(b.id)} actions={<RowAction label="Move to trash" onClick={() => remove(b.id)} icon={<Trash />} />} />
          ))}
          {boards != null && !mine.length && <span className="px-2.5 text-xs text-neutral-600">{q ? 'No matches.' : 'No boards yet.'}</span>}
        </Group>
        {shared.length > 0 && (
          <Group label="Shared with me">
            {shared.map((b) => (
              <Row key={b.id} b={b} on={b.id === current} onOpen={() => go(b.id)} actions={<RowAction label="Remove from this device" onClick={() => remove(b.id)} icon={<Trash />} />} />
            ))}
          </Group>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {trash.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showTrash}
              onClick={() => setShowTrash(!showTrash)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-neutral-300 hover:bg-neutral-900"
            >
              <Trash />
              Trash
              <span className="ml-auto text-[11px] text-neutral-500">{trash.length}</span>
              <CaretDown className={cx('transition-transform', showTrash && 'rotate-180')} />
            </button>
            {showTrash && (
              <div className="anim-fade flex max-h-48 flex-col overflow-auto">
                {trash.map((b) => (
                  <Row
                    key={b.id}
                    b={b}
                    on={false}
                    dim
                    actions={
                      <>
                        <RowAction label="Restore" onClick={() => restoreBoard(b.id)} icon={<ArrowCounterClockwise />} />
                        <RowAction
                          label="Delete forever"
                          onClick={() => {
                            if (window.confirm(`Delete "${b.title || 'Untitled'}" from this device for good?`)) void deleteBoard(b.id)
                          }}
                          icon={<X />}
                        />
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => {
            set({ sidebar: false })
            toggleDialog('shortcuts')
          }}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-neutral-300 hover:bg-neutral-900"
        >
          <Keyboard />
          Keyboard shortcuts
          <span className="ml-auto text-[11px] text-neutral-500">?</span>
        </button>
      </div>
    </>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2.5 pb-1.5 text-[10px] tracking-[.1em] text-neutral-600 uppercase">{label}</div>
      {children}
    </div>
  )
}

function Row({ b, on, dim, onOpen, actions }: { b: BoardEntry; on: boolean; dim?: boolean; onOpen?: () => void; actions: ReactNode }) {
  const when = rangeLabel(b.date, b.endDate)
  return (
    <div
      className={cx(
        'group flex items-center gap-2.5 rounded-lg py-1.5 pr-1 pl-2.5 text-[13px] transition-colors',
        on ? 'bg-accent-900 text-accent-200 shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-neutral-300 hover:bg-neutral-900',
        dim && 'opacity-70',
      )}
    >
      <button type="button" onClick={onOpen} disabled={!onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default">
        <NamedIcon name={b.icon} className="flex-none text-base" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{b.title || 'Untitled'}</span>
          {when && <span className={cx('truncate text-[11px]', on ? 'text-accent-400' : 'text-neutral-500')}>{when}</span>}
        </span>
      </button>
      <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">{actions}</span>
    </div>
  )
}

function RowAction({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-7 place-items-center rounded-md text-neutral-500 hover:text-text">
      {icon}
    </button>
  )
}
