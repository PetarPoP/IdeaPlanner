import { memo, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DotsSixVertical, Plus } from '@phosphor-icons/react'
import type { Node } from '~/lib/model.gen'
import { KIND_LABEL } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import { isMobileWidth, useBoard } from '~/store/board'
import { BookingCard } from '../cards/BookingCard'
import { ChecklistCard } from '../cards/ChecklistCard'
import { ImageCard } from '../cards/ImageCard'
import { ItineraryCard } from '../cards/ItineraryCard'
import { LinkCard } from '../cards/LinkCard'
import { MapCard } from '../cards/MapCard'
import { NoteCard } from '../cards/NoteCard'
import { PlacesCard } from '../cards/PlacesCard'
import { PollCard } from '../cards/PollCard'
import { SantaCard } from '../cards/SantaCard'
import { SectionCard } from '../cards/SectionCard'
import { Field } from '../ui'
import { gesture } from './interaction'

function Body({ id, type, selected }: { id: string; type: Node['type']; selected: boolean }): ReactNode {
  switch (type) {
    case 'section':
      return <SectionCard id={id} />
    case 'itinerary':
      return <ItineraryCard id={id} />
    case 'map':
      return <MapCard id={id} selected={selected} />
    case 'booking':
      return <BookingCard id={id} />
    case 'places':
      return <PlacesCard id={id} />
    case 'note':
      return <NoteCard id={id} />
    case 'checklist':
      return <ChecklistCard id={id} />
    case 'poll':
      return <PollCard id={id} />
    case 'link':
      return <LinkCard id={id} />
    case 'image':
      return <ImageCard id={id} />
    case 'santa':
      return <SantaCard id={id} />
  }
}

/** One card on the board: frame, draggable header, body and connection port. */
export const NodeCard = memo(function NodeCard({ id, startPan }: { id: string; startPan: (e: ReactPointerEvent) => void }) {
  const frame = useBoard(
    useShallow((s) => {
      const n = s.board?.nodes.find((x) => x.id === id)
      return n && { x: n.x, y: n.y, w: n.w, title: n.title, icon: n.icon, accent: n.accent, type: n.type }
    }),
  )
  const selected = useBoard((s) => s.sel != null && 'node' in s.sel && s.sel.node === id)
  const source = useBoard((s) => s.connectFrom === id)
  const tool = useBoard((s) => s.tool)
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const ref = useRef<HTMLDivElement>(null)

  // Edges and "fit" need real card heights.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => useBoard.getState().setSize(id, el.offsetWidth, el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [id])

  if (!frame) return null
  const store = useBoard.getState

  const onDown = (e: ReactPointerEvent) => {
    if (tool === 'hand') return startPan(e)
    e.stopPropagation()
    const s = store()
    if (tool === 'connect') {
      if (!s.connectFrom) s.set({ connectFrom: id, sel: { node: id } })
      else if (s.connectFrom !== id) {
        s.addEdge(s.connectFrom, id)
        s.set({ connectFrom: null })
      }
      return
    }
    if (!selected) s.set({ sel: { node: id }, addOpen: false })
  }

  const onHeaderDown = (e: ReactPointerEvent) => {
    if (tool === 'connect' || tool === 'hand') return
    e.stopPropagation()
    if (!selected) store().set({ sel: { node: id }, addOpen: false })
    gesture.drag = { type: 'node', id, sx: e.clientX, sy: e.clientY, ox: frame.x, oy: frame.y, moved: false }
  }

  const active = selected || source
  return (
    <div
      ref={ref}
      data-node-id={id}
      onPointerDown={onDown}
      className="absolute flex flex-col rounded-[14px] transition-shadow duration-150"
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.w,
        zIndex: selected ? 20 : 5,
        background: frame.accent ? 'linear-gradient(180deg,var(--color-note-from),var(--color-note-to))' : 'var(--color-surface)',
        boxShadow: active ? 'var(--shadow-card-active)' : 'var(--shadow-card)',
      }}
    >
      <div onPointerDown={onHeaderDown} className="flex cursor-grab touch-none items-center gap-2 px-3 pt-2.5 pb-2 select-none">
        <NamedIcon name={frame.icon} className="text-base text-accent" />
        <Field
          value={frame.title}
          onValue={(title, m) => store().updateNode(id, (n) => ({ ...n, title }), m)}
          onPointerDown={(e) => {
            e.stopPropagation()
            if (!selected) store().set({ sel: { node: id } })
          }}
          aria-label="Card title"
          className="flex-1 cursor-text text-sm font-medium"
        />
        <span className="text-[9.5px] tracking-[.08em] text-neutral-600 uppercase">{KIND_LABEL[frame.type]}</span>
        <DotsSixVertical className="text-neutral-600" />
      </div>

      <Body id={id} type={frame.type} selected={selected} />

      <div
        title="Drag to connect"
        onPointerDown={(e) => {
          e.stopPropagation()
          gesture.drag = { type: 'port', id, sx: e.clientX, sy: e.clientY, moved: false }
        }}
        className="absolute top-1/2 -right-3 -mt-3 grid size-6 cursor-crosshair touch-none place-items-center rounded-full border-[1.5px] bg-bg text-accent-300"
        style={{
          borderColor: selected ? 'var(--color-accent)' : 'var(--color-accent-700)',
          opacity: selected || mobile || tool === 'connect' ? 1 : 0.45,
        }}
      >
        <Plus size={11} />
      </div>
    </div>
  )
})
