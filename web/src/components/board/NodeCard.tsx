import { memo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DotsSixVertical, Plus } from '@phosphor-icons/react'
import type { Node } from '~/lib/model.gen'
import { KIND_LABEL, cardColor, stickyPaper } from '~/lib/catalog'
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
import { StickyCard } from '../cards/StickyCard'
import { FrameCard } from '../cards/FrameCard'
import { CommentBadge } from '../cards/Comments'
import { Field, cx } from '../ui'
import { useLive } from '~/store/live'
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
    case 'sticky':
      return <StickyCard id={id} />
    case 'frame':
      return null
  }
}

/** A card's background: its palette colour, else the accent tint, else the surface. */
export const cardBackground = (n: Pick<Node, 'type' | 'color' | 'accent'>) =>
  n.type === 'sticky'
    ? stickyPaper(n.color)
    : n.color
      ? cardColor(n.color).bg
      : n.accent
        ? 'linear-gradient(180deg,var(--color-note-from),var(--color-note-to))'
        : 'var(--color-surface)'

/** The coloured top edge of a coloured card, as an inset shadow to put before its others. */
export const colorEdge = (n: Pick<Node, 'type' | 'color'>) => (n.color && n.type !== 'sticky' ? `inset 0 3px 0 ${cardColor(n.color).border}, ` : '')

/** The header shared by the board and the list view: icon, editable title, comments, kind. */
export function CardHeader({ id, icon, title, type, extra }: { id: string; icon: string; title: string; type: Node['type']; extra?: ReactNode }) {
  return (
    <div className="relative flex items-center gap-2 px-3 pt-2.5 pb-2">
      <NamedIcon name={icon} className="flex-none text-base text-accent" />
      <Field
        value={title}
        onValue={(t, m) => useBoard.getState().updateNode(id, (n) => ({ ...n, title: t }), m)}
        aria-label="Card title"
        className="min-w-0 flex-1 text-sm font-medium"
      />
      <CommentBadge id={id} />
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
      return (
        n && {
          x: n.x,
          y: n.y,
          w: n.w,
          h: n.type === 'frame' ? n.h : 0,
          title: n.title,
          icon: n.icon,
          accent: n.accent,
          color: n.color,
          type: n.type,
        }
      )
    }),
  )
  const selected = useBoard((s) => selectedNodes(s.sel).includes(id))
  const only = useBoard((s) => selectedNodes(s.sel).length === 1)
  const source = useBoard((s) => s.connectFrom === id)
  const tool = useBoard((s) => s.tool)
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const lifted = useOverlay((s) => s.dragging) && selected
  const thread = useBoard((s) => s.thread === id)
  // Someone else on the board has this card selected.
  const peer = useLive((s) => Object.values(s.peers).find((p) => p.sel?.includes(id)))
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

  // Frames sit behind every card; only their label, border and handle take presses.
  if (frame.type === 'frame')
    return (
      <div
        ref={ref}
        data-node-id={id}
        className="anim-fade pointer-events-none absolute"
        style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, zIndex: thread ? 21 : 0 }}
      >
        <FrameCard id={id} selected={selected} />
      </div>
    )
  const sticky = frame.type === 'sticky'

  return (
    <div
      ref={ref}
      data-node-id={id}
      className={cx(
        'anim-card absolute flex flex-col transition-[box-shadow,scale] duration-150',
        sticky ? 'rounded-[6px]' : 'rounded-[14px]',
        tool === 'select' && 'cursor-grab',
        lifted && 'cursor-grabbing',
      )}
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.w,
        zIndex: selected || thread ? 20 : 5,
        scale: lifted ? '1.012' : undefined,
        background: cardBackground(frame),
        boxShadow: (peer ? `0 0 0 2px ${peer.color},` : '') + colorEdge(frame) + (lifted ? 'var(--shadow-card-lift)' : active ? 'var(--shadow-card-active)' : 'var(--shadow-card)'),
      }}
    >
      {!sticky && (
        <CardHeader id={id} icon={frame.icon} title={frame.title} type={frame.type} extra={<DotsSixVertical className="text-neutral-600" />} />
      )}

      <CardBody id={id} type={frame.type} selected={selected && only} />

      {peer && (
        <span className="anim-pop pointer-events-none absolute -top-2.5 left-3 rounded-md px-1.5 py-px text-[10px] font-medium text-bg" style={{ background: peer.color }}>
          {peer.name || 'Guest'}
        </span>
      )}

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
