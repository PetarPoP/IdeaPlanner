import type { Icon } from '@phosphor-icons/react'
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowsOut, CalendarDots, Coins, Copy, Cursor, FlowArrow, Hand,
  Info, MapTrifold, Minus, Note, Palette, PencilSimple, Plus, PlusCircle, SquaresFour, Trash, Wallet,
} from '@phosphor-icons/react'
import { Fragment } from 'react'
import type { NodeType } from '~/lib/catalog'
import { KIND_LABEL } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import type { Tool } from '~/store/board'
import { isMobileWidth, useBoard } from '~/store/board'
import { cx } from '../ui'

const TOOLS: ReadonlyArray<{ tool: Tool; icon: Icon; short: string; label: string }> = [
  { tool: 'select', icon: Cursor, short: 'Select', label: 'Select (V)' },
  { tool: 'hand', icon: Hand, short: 'Pan', label: 'Pan (H)' },
  { tool: 'pen', icon: PencilSimple, short: 'Draw', label: 'Draw (P)' },
  { tool: 'connect', icon: FlowArrow, short: 'Connect', label: 'Connect (C)' },
]

const QUICK_ADD: ReadonlyArray<{ type: NodeType; icon: Icon; short: string }> = [
  { type: 'note', icon: Note, short: 'Idea' },
  { type: 'section', icon: Coins, short: 'Costs' },
  { type: 'itinerary', icon: CalendarDots, short: 'Day' },
  { type: 'map', icon: MapTrifold, short: 'Map' },
]

const MORE: ReadonlyArray<{ type: NodeType; icon: string; label: string; desc: string }> = [
  { type: 'booking', icon: 'airplane-tilt', label: 'Booking', desc: 'Flight, stay, car, ticket' },
  { type: 'places', icon: 'push-pin', label: 'Places to visit', desc: 'Saved spots with hearts' },
  { type: 'checklist', icon: 'check-square', label: 'Checklist', desc: 'Tasks with assignees' },
  { type: 'poll', icon: 'chart-bar', label: 'Poll', desc: 'Let the group vote' },
  { type: 'link', icon: 'link', label: 'Link', desc: 'Bookmark a page' },
  { type: 'image', icon: 'image', label: 'Photo', desc: 'Drop an image' },
  { type: 'santa', icon: 'shuffle', label: 'Name draw', desc: 'Secret Santa pairs' },
  { type: 'section', icon: 'coins', label: 'Cost card', desc: 'Items with auto-sum' },
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

export function Toolbar() {
  const tool = useBoard((s) => s.tool)
  const addOpen = useBoard((s) => s.addOpen)
  const dialog = useBoard((s) => s.dialog)
  const hidden = useBoard((s) => isMobileWidth(s.vw) && s.panel != null)
  const { setTool, addNode, set } = useBoard.getState()

  return (
    <>
      {addOpen && (
        <div className="glass absolute bottom-[76px] left-1/2 z-[46] grid w-[min(520px,calc(100%-16px))] -translate-x-1/2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-0.5 rounded-[14px] p-2 md:bottom-[88px] md:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
          {MORE.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => addNode(a.type)}
              className="flex items-center gap-2.5 rounded-[10px] p-2.5 text-left hover:bg-neutral-900"
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
      )}
      <div
        className={cx(
          'glass scrollbar-none absolute bottom-2.5 left-1/2 z-[42] flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-[14px] p-[5px] md:bottom-[18px]',
          hidden && 'hidden',
        )}
      >
        {TOOLS.map((t) => (
          <ToolButton key={t.tool} icon={t.icon} short={t.short} label={t.label} on={tool === t.tool} onClick={() => setTool(t.tool)} />
        ))}
        <Sep />
        {QUICK_ADD.map((q) => (
          <ToolButton key={q.type} icon={q.icon} short={q.short} label={`Add ${q.short.toLowerCase()}`} on={false} onClick={() => addNode(q.type)} />
        ))}
        <ToolButton icon={PlusCircle} short="More" label="More cards" on={addOpen} onClick={() => set({ addOpen: !addOpen })} />
        <Sep />
        <ToolButton icon={Wallet} short="Budget" label="Budget" on={dialog === 'budget'} onClick={() => set({ dialog: 'budget', addOpen: false })} />
        <ToolButton icon={SquaresFour} short="Templates" label="Templates" on={false} onClick={() => set({ dialog: 'templates', addOpen: false })} />
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
      <button type="button" title="Fit to screen" onClick={fit} className="btn btn-icon text-neutral-300">
        <ArrowsOut />
      </button>
    </div>
  )
}

/** Floating actions for the selected card, connection or drawing, plus the tool hint. */
export function SelectionBar() {
  const sel = useBoard((s) => s.sel)
  const tool = useBoard((s) => s.tool)
  const connectFrom = useBoard((s) => s.connectFrom)
  const node = useBoard((s) => (s.sel && 'node' in s.sel ? s.board?.nodes.find((n) => n.id === (s.sel as { node: string }).node) : undefined))
  const { duplicateSelection, deleteSelection, set, setTool, updateNode } = useBoard.getState()

  const hint =
    tool === 'connect'
      ? connectFrom
        ? 'Now tap the card to connect to'
        : 'Tap a card to start a connection'
      : tool === 'pen'
        ? 'Draw on the board'
        : tool === 'hand'
          ? 'Drag anywhere to pan'
          : ''
  const HintIcon = tool === 'connect' ? FlowArrow : tool === 'pen' ? PencilSimple : tool === 'hand' ? Hand : Info

  const label = node ? `${KIND_LABEL[node.type]} · ${node.title}` : sel && 'edge' in sel ? 'Connection' : 'Drawing'
  const ghost = 'btn btn-ghost text-neutral-200'

  return (
    <>
      {sel && tool !== 'connect' && (
        <div className="glass absolute top-16 left-1/2 z-[45] flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl p-1 md:top-[70px]">
          <span className="max-w-40 truncate px-1.5 text-xs text-neutral-400">{label}</span>
          {node && (
            <Fragment>
              <button type="button" onClick={duplicateSelection} className={ghost}>
                <Copy />
                Duplicate
              </button>
              <button type="button" onClick={() => set({ tool: 'connect', connectFrom: node.id })} className={ghost}>
                <FlowArrow />
                Connect
              </button>
              <button type="button" onClick={() => updateNode(node.id, (n) => ({ ...n, accent: !n.accent }))} className={ghost}>
                <Palette />
                Tint
              </button>
            </Fragment>
          )}
          <button type="button" onClick={deleteSelection} className={ghost}>
            <Trash />
            Delete
          </button>
        </div>
      )}
      {hint && (
        <div className="glass absolute top-16 left-1/2 z-[45] flex -translate-x-1/2 items-center gap-2.5 rounded-xl py-1.5 pr-1.5 pl-3.5 text-[13px] whitespace-nowrap md:top-[70px]">
          <HintIcon className="text-accent" />
          <span>{hint}</span>
          <button type="button" onClick={() => setTool('select')} className="btn btn-primary px-2.5 py-1 text-xs">
            Done
          </button>
        </div>
      )}
    </>
  )
}
