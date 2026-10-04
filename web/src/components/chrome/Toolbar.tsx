import type { Icon } from '@phosphor-icons/react'
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowsOut, CalendarDots, Coins, Copy, Cursor, Eraser, FlowArrow, Hand,
  Info, Keyboard, MapTrifold, Minus, Note, Palette, PencilSimple, Plus, PlusCircle, Scissors, SquaresFour, Trash, Wallet,
} from '@phosphor-icons/react'
import { Fragment } from 'react'
import type { NodeType } from '~/lib/catalog'
import { CARD_MENU, KIND_LABEL } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import type { Tool } from '~/store/board'
import { PEN_COLORS, isMobileWidth, selectedNodes, useBoard } from '~/store/board'
import { copyToClipboard } from '~/hooks/useClipboard'
import { cx } from '../ui'

const TOOLS: ReadonlyArray<{ tool: Tool; icon: Icon; short: string; label: string }> = [
  { tool: 'select', icon: Cursor, short: 'Select', label: 'Select (S)' },
  { tool: 'hand', icon: Hand, short: 'Pan', label: 'Pan (P) · or hold Space, or drag with the middle button' },
  { tool: 'pen', icon: PencilSimple, short: 'Draw', label: 'Draw (D)' },
  { tool: 'erase', icon: Eraser, short: 'Erase', label: 'Erase drawings (E)' },
  { tool: 'connect', icon: FlowArrow, short: 'Connect', label: 'Connect (C)' },
]

const QUICK_ADD: ReadonlyArray<{ type: NodeType; icon: Icon; short: string }> = [
  { type: 'note', icon: Note, short: 'Idea' },
  { type: 'section', icon: Coins, short: 'Costs' },
  { type: 'itinerary', icon: CalendarDots, short: 'Day' },
  { type: 'map', icon: MapTrifold, short: 'Map' },
]

function ToolButton({ icon: I, short, label, on, onClick }: { icon: Icon; short: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'flex h-[50px] w-[50px] flex-none flex-col items-center justify-center gap-px rounded-[10px] p-0 md:w-[54px]',
        on ? 'bg-accent-900 text-accent-200 shadow-[inset_0_0_0_1px_var(--color-accent-700)]' : 'text-neutral-300 hover:text-text',
      )}
    >
      <I size={19} />
      <span className="text-[9.5px]">{short}</span>
    </button>
  )
}

const Sep = () => <span className="mx-0.5 my-2 w-px flex-none self-stretch bg-neutral-800" />

/** Every card type, for the toolbar's "More" and the list view's "Add card". */
export function CardMenu({ className, bare, onPick }: { className?: string; bare?: boolean; onPick: (type: NodeType) => void }) {
  return (
    <div
      className={cx(
        !bare && 'glass anim-pop',
        'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-0.5 rounded-[14px] p-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
        className,
      )}
    >
      {CARD_MENU.map((a) => (
        <button
          key={a.type}
          type="button"
          onClick={() => onPick(a.type)}
          className="flex items-center gap-2.5 rounded-[10px] p-2.5 text-left transition-colors hover:bg-neutral-900"
        >
          <span className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-accent-900 text-lg text-accent-300">
            <NamedIcon name={a.icon} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] font-medium">{a.label}</span>
            <span className="text-[11px] text-neutral-500">{a.desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function Toolbar() {
  const tool = useBoard((s) => s.tool)
  const addOpen = useBoard((s) => s.addOpen)
  const dialog = useBoard((s) => s.dialog)
  const hidden = useBoard((s) => isMobileWidth(s.vw) && s.panel != null)
  const { setTool, addNode, set, toggleDialog } = useBoard.getState()

  return (
    <>
      {addOpen && (
        <CardMenu
          className="absolute bottom-[76px] left-1/2 z-[46] w-[min(640px,calc(100%-16px))] -translate-x-1/2 md:bottom-[88px]"
          onPick={(t) => addNode(t)}
        />
      )}
      <div
        className={cx(
          'glass scrollbar-none absolute bottom-2.5 left-1/2 z-[42] flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-[14px] p-[5px] md:bottom-[18px]',
          hidden && 'hidden',
        )}
      >
        {TOOLS.map((t) => (
          <ToolButton key={t.tool} icon={t.icon} short={t.short} label={t.label} on={tool === t.tool} onClick={() => setTool(tool === t.tool && t.tool !== 'select' ? 'select' : t.tool)} />
        ))}
        <Sep />
        {QUICK_ADD.map((q) => (
          <ToolButton key={q.type} icon={q.icon} short={q.short} label={`Add ${q.short.toLowerCase()}`} on={false} onClick={() => addNode(q.type)} />
        ))}
        <ToolButton icon={PlusCircle} short="More" label="All cards" on={addOpen} onClick={() => set({ addOpen: !addOpen })} />
        <Sep />
        <ToolButton icon={Wallet} short="Budget" label="Budget" on={dialog === 'budget'} onClick={() => toggleDialog('budget')} />
        <ToolButton icon={SquaresFour} short="Templates" label="Templates" on={dialog === 'templates'} onClick={() => toggleDialog('templates')} />
      </div>
    </>
  )
}

export function ZoomBar() {
  const z = useBoard((s) => s.view.z)
  const canUndo = useBoard((s) => s.past.length > 0)
  const canRedo = useBoard((s) => s.future.length > 0)
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const hidden = useBoard((s) => isMobileWidth(s.vw) && s.panel != null)
  const { undo, redo, zoomBy, fit } = useBoard.getState()

  return (
    <div
      className={cx(
        'glass absolute right-2 bottom-[78px] z-[41] flex flex-col items-center gap-0.5 rounded-xl p-1 md:right-[18px] md:bottom-[18px] md:flex-row',
        hidden && 'hidden',
      )}
    >
      <button type="button" title="Undo (⌘Z)" onClick={undo} disabled={!canUndo} className="btn btn-icon text-neutral-300 disabled:opacity-35">
        <ArrowCounterClockwise />
      </button>
      <button type="button" title="Redo (⇧⌘Z)" onClick={redo} disabled={!canRedo} className="btn btn-icon text-neutral-300 disabled:opacity-35">
        <ArrowClockwise />
      </button>
      {!mobile && (
        <>
          <span className="h-5 w-px bg-neutral-800" />
          <button type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.2)} className="btn btn-icon text-neutral-300">
            <Minus />
          </button>
          <button type="button" title="Reset zoom" onClick={() => zoomBy(1 / z)} className="min-w-12 text-xs text-neutral-300">
            {Math.round(z * 100)}%
          </button>
          <button type="button" title="Zoom in" onClick={() => zoomBy(1.2)} className="btn btn-icon text-neutral-300">
            <Plus />
          </button>
        </>
      )}
      <button type="button" title="Fit to screen (F)" onClick={fit} className="btn btn-icon text-neutral-300">
        <ArrowsOut />
      </button>
      {!mobile && (
        <button
          type="button"
          title="Keyboard shortcuts (?)"
          onClick={() => useBoard.getState().toggleDialog('shortcuts')}
          className="btn btn-icon text-neutral-300"
        >
          <Keyboard />
        </button>
      )}
    </div>
  )
}

/** Floating actions for the selected cards, connection or drawing, plus the tool hint. */
export function SelectionBar() {
  const sel = useBoard((s) => s.sel)
  const tool = useBoard((s) => s.tool)
  const penColor = useBoard((s) => s.penColor)
  const connectFrom = useBoard((s) => s.connectFrom)
  const count = useBoard((s) => selectedNodes(s.sel).length)
  const node = useBoard((s) => {
    const ids = selectedNodes(s.sel)
    return ids.length === 1 ? s.board?.nodes.find((n) => n.id === ids[0]) : undefined
  })
  const { duplicateSelection, deleteSelection, set, setTool, updateNode, change } = useBoard.getState()

  const hint =
    tool === 'connect'
      ? connectFrom
        ? 'Now tap the card to connect to'
        : 'Tap a card to start a connection'
      : tool === 'pen'
        ? 'Draw anywhere, even over cards'
        : tool === 'erase'
          ? 'Drag over drawings to erase them'
          : tool === 'hand'
            ? 'Drag anywhere to pan'
            : ''
  const HintIcon = tool === 'connect' ? FlowArrow : tool === 'pen' ? PencilSimple : tool === 'erase' ? Eraser : tool === 'hand' ? Hand : Info

  const label = node
    ? `${KIND_LABEL[node.type]} · ${node.title}`
    : count > 1
      ? `${count} cards`
      : sel && 'edge' in sel
        ? 'Connection'
        : 'Drawing'
  const ghost = 'btn btn-ghost text-neutral-200'
  const tintAll = () => {
    const ids = new Set(selectedNodes(sel))
    const board = useBoard.getState().board
    const on = !board?.nodes.filter((n) => ids.has(n.id)).every((n) => n.accent)
    change((b) => ({ ...b, nodes: b.nodes.map((n) => (ids.has(n.id) ? { ...n, accent: on } : n)) }))
  }

  return (
    <>
      {sel && !hint && (
        <div className="glass anim-drop absolute top-[112px] left-1/2 z-[45] flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl p-1 md:top-[70px]">
          <span className="max-w-40 truncate px-1.5 text-xs text-neutral-400">{label}</span>
          {count > 0 && (
            <Fragment>
              <button type="button" title="Duplicate (Ctrl+D)" onClick={duplicateSelection} className={ghost}>
                <Copy />
                Duplicate
              </button>
              {count > 1 && (
                <button type="button" title="Cut (Ctrl+X)" onClick={() => void copyToClipboard(true)} className={ghost}>
                  <Scissors />
                  Cut
                </button>
              )}
              {node && (
                <button type="button" onClick={() => set({ tool: 'connect', connectFrom: node.id })} className={ghost}>
                  <FlowArrow />
                  Connect
                </button>
              )}
              <button
                type="button"
                onClick={() => (node ? updateNode(node.id, (n) => ({ ...n, accent: !n.accent })) : tintAll())}
                className={ghost}
              >
                <Palette />
                Tint
              </button>
            </Fragment>
          )}
          <button type="button" title="Delete (Del)" onClick={deleteSelection} className={ghost}>
            <Trash />
            Delete
          </button>
        </div>
      )}
      {hint && (
        <div className="glass anim-drop absolute top-[112px] left-1/2 z-[45] flex -translate-x-1/2 items-center gap-2.5 rounded-xl py-1.5 pr-1.5 pl-3.5 text-[13px] whitespace-nowrap md:top-[70px]">
          <HintIcon className="text-accent" />
          <span className="max-md:hidden">{hint}</span>
          {tool === 'pen' && (
            <span className="flex items-center gap-1" role="group" aria-label="Pen colour">
              {PEN_COLORS.map((c) => (
                <button
                  key={c || 'accent'}
                  type="button"
                  aria-label={c ? `Colour ${c}` : 'Accent colour'}
                  aria-pressed={penColor === c}
                  onClick={() => set({ penColor: c })}
                  className="grid size-6 place-items-center rounded-full"
                  style={{ boxShadow: penColor === c ? '0 0 0 1.5px var(--color-accent)' : undefined }}
                >
                  <span className="size-3.5 rounded-full" style={{ background: c || 'var(--color-accent-300)' }} />
                </button>
              ))}
            </span>
          )}
          <button type="button" onClick={() => setTool('select')} className="btn btn-primary px-2.5 py-1 text-xs">
            Done
          </button>
        </div>
      )}
    </>
  )
}
