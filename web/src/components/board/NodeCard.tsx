import { memo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DotsSixVertical, Plus } from '@phosphor-icons/react'
import type { Node } from '~/lib/model.gen'
import { KIND_LABEL } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import { isMobileWidth, selectedNodes, useBoard } from '~/store/board'
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
import { EmailCard } from '../cards/EmailCard'
import { SectionCard } from '../cards/SectionCard'
import { Field, cx } from '../ui'
import { useOverlay } from './interaction'

export function CardBody({ id, type, selected }: { id: string; type: Node['type']; selected: boolean }): ReactNode {
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
    case 'email':
      return <EmailCard id={id} />
  }
}

/** The header shared by the board and the list view: icon, editable title, kind. */
export function CardHeader({ id, icon, title, type, extra }: { id: string; icon: string; title: string; type: Node['type']; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
      <NamedIcon name={icon} className="flex-none text-base text-accent" />
      <Field
        value={title}
        onValue={(t, m) => useBoard.getState().updateNode(id, (n) => ({ ...n, title: t }), m)}
        aria-label="Card title"
        className="min-w-0 flex-1 text-sm font-medium"
      />
      <span className="text-[9.5px] tracking-[.08em] text-neutral-600 uppercase">{KIND_LABEL[type]}</span>
      {extra}
    </div>
  )
}

/** One card on the board. The canvas handles its pointer input (select, drag, connect). */
export const NodeCard = memo(function NodeCard({ id }: { id: string }) {
  const frame = useBoard(
    useShallow((s) => {
      const n = s.board?.nodes.find((x) => x.id === id)
      return n && { x: n.x, y: n.y, w: n.w, title: n.title, icon: n.icon, accent: n.accent, type: n.type }
    }),
  )
  const selected = useBoard((s) => selectedNodes(s.sel).includes(id))
  const only = useBoard((s) => selectedNodes(s.sel).length === 1)
  const source = useBoard((s) => s.connectFrom === id)
  const tool = useBoard((s) => s.tool)
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const lifted = useOverlay((s) => s.dragging) && selected
  const ref = useRef<HTMLDivElement>(null)

  // Edges, the selection box and "fit" need real card heights.
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
  const active = selected || source

  return (
    <div
      ref={ref}
      data-node-id={id}
      className={cx(
        'anim-card absolute flex flex-col rounded-[14px] transition-[box-shadow,scale] duration-150',
        tool === 'select' && 'cursor-grab',
        lifted && 'cursor-grabbing',
      )}
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.w,
        zIndex: selected ? 20 : 5,
        scale: lifted ? '1.012' : undefined,
        background: frame.accent ? 'linear-gradient(180deg,var(--color-note-from),var(--color-note-to))' : 'var(--color-surface)',
        boxShadow: lifted ? 'var(--shadow-card-lift)' : active ? 'var(--shadow-card-active)' : 'var(--shadow-card)',
      }}
    >
      <CardHeader id={id} icon={frame.icon} title={frame.title} type={frame.type} extra={<DotsSixVertical className="text-neutral-600" />} />

      <CardBody id={id} type={frame.type} selected={selected && only} />

      <div
        data-port={id}
        title="Drag to connect"
        className="absolute top-1/2 -right-3 -mt-3 grid size-6 cursor-crosshair touch-none place-items-center rounded-full border-[1.5px] bg-bg text-accent-300 transition-opacity"
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
