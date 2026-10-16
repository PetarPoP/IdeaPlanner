import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatCircle, Copy, Crosshair, MagnifyingGlass, Plus, Trash } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import type { Node } from '~/lib/model.gen'
import type { NodeType } from '~/lib/catalog'
import { KIND_LABEL } from '~/lib/catalog'
import { useBoard } from '~/store/board'
import { CardBody, CardHeader, cardBackground, colorEdge } from '../board/NodeCard'
import { CardMenu } from '../chrome/Toolbar'
import { Popover } from '../chrome/Popover'
import { cx } from '../ui'
import { PageView } from './PageView'

/** Reading order on the board: rows from the top, then left to right. */
const byPosition = (a: Pick<Node, 'x' | 'y'>, b: Pick<Node, 'x' | 'y'>) => Math.round(a.y / 200) - Math.round(b.y / 200) || a.x - b.x

/** Every card as a column of editable cards, filterable by kind and text. */
export function ListView() {
  const cards = useBoard(
    useShallow((s) =>
      (s.board?.nodes ?? [])
        // Frames are areas on the board, not content.
        .filter((n) => n.type !== 'frame')
        .map((n) => ({ id: n.id, x: n.x, y: n.y, type: n.type }))
        .sort(byPosition)
        .map((n) => `${n.id}:${n.type}`),
    ),
  )
  const [kind, setKind] = useState<NodeType | 'all'>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const list = cards.map((c) => {
    const [id, type] = c.split(':') as [string, NodeType]
    return { id, type }
  })
  const kinds = [...new Set(list.map((c) => c.type))]
  const matches = useMatches(q)
  const shown = list.filter((c) => (kind === 'all' || c.type === kind) && matches(c.id))

  useEffect(() => {
    if (!justAdded) return
    document.querySelector(`[data-list-id="${justAdded}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [justAdded])

  const add = (type: NodeType) => {
    const s = useBoard.getState()
    const nodes = s.board?.nodes ?? []
    // New cards go under everything, so they land last in the list too.
    const x = nodes.length ? Math.min(...nodes.map((n) => n.x)) : 0
    const y = nodes.length ? Math.max(...nodes.map((n) => n.y + (s.sizes[n.id]?.h ?? 300))) + 60 : 0
    const id = s.addNode(type, { x: x + 140, y: y + 80 })
    setAdding(false)
    setKind('all')
    setQ('')
    setJustAdded(id)
  }

  return (
    <PageView
      actions={
        <div className="relative">
          <button ref={addRef} type="button" aria-pressed={adding} onClick={() => setAdding(!adding)} className="btn btn-primary">
            <Plus />
            Add card
          </button>
          <Popover open={adding} onClose={() => setAdding(false)} anchor={addRef} className="top-11 right-0 w-[min(560px,calc(100vw-24px))] p-0">
            <CardMenu bare onPick={add} />
          </Popover>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[180px] items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-[13px] text-neutral-500 shadow-sm focus-within:shadow-[0_0_0_1px_var(--color-accent)] max-md:flex-1">
          <MagnifyingGlass />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards" className="field flex-1 text-text" />
        </label>
        <div className="scrollbar-none flex gap-1 overflow-x-auto">
          {(['all', ...kinds] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cx(
                'rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors',
                kind === k ? 'bg-accent-800 text-accent-100' : 'bg-surface text-neutral-400 shadow-sm hover:text-text',
              )}
            >
              {k === 'all' ? `All · ${list.length}` : `${KIND_LABEL[k]} · ${list.filter((c) => c.type === k).length}`}
            </button>
          ))}
        </div>
      </div>
      <div className="stagger columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {shown.map((c) => (
          <ListCard key={c.id} id={c.id} fresh={c.id === justAdded} />
        ))}
      </div>
      {!shown.length && <div className="py-10 text-center text-sm text-neutral-500">{list.length ? 'No cards match.' : 'No cards yet. Add one above.'}</div>}
    </PageView>
  )
}

/** Text search over a card's title and visible text. */
function useMatches(q: string) {
  const nodes = useBoard((s) => s.board?.nodes)
  return useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return () => true
    const text = new Map((nodes ?? []).map((n) => [n.id, JSON.stringify({ ...n, id: '', icon: '', src: '' }).toLowerCase()]))
    return (id: string) => text.get(id)?.includes(needle) ?? false
  }, [nodes, q])
}

function ListCard({ id, fresh }: { id: string; fresh: boolean }) {
  const frame = useBoard(
    useShallow((s) => {
      const n = s.board?.nodes.find((x) => x.id === id)
      return n && { title: n.title, icon: n.icon, accent: n.accent, color: n.color, type: n.type }
    }),
  )
  const thread = useBoard((s) => s.thread === id)
  if (!frame) return null
  const s = useBoard.getState
  const action = 'grid size-7 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-text'
  return (
    <div
      data-list-id={id}
      className="anim-card lift group relative mb-4 flex break-inside-avoid flex-col rounded-[14px]"
      style={{
        background: cardBackground(frame),
        boxShadow: colorEdge(frame) + (fresh ? 'var(--shadow-card-active)' : 'var(--shadow-card)'),
        zIndex: thread ? 10 : undefined,
      }}
    >
      <CardHeader
        id={id}
        icon={frame.icon}
        title={frame.title}
        type={frame.type}
        extra={
          <span className="flex opacity-60 transition-opacity group-hover:opacity-100 max-md:opacity-100">
            <button type="button" title="Comment" onClick={() => s().set({ thread: id })} className={action}>
              <ChatCircle />
            </button>
            <button type="button" title="Show on the board" onClick={() => s().focusNode(id)} className={action}>
              <Crosshair />
            </button>
            <button
              type="button"
              title="Duplicate"
              onClick={() => {
                s().set({ sel: { nodes: [id] } })
                s().duplicateSelection()
              }}
              className={action}
            >
              <Copy />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => {
                s().set({ sel: { nodes: [id] } })
                s().deleteSelection()
              }}
              className={action}
            >
              <Trash />
            </button>
          </span>
        }
      />
      <CardBody id={id} type={frame.type} selected />
    </div>
  )
}
