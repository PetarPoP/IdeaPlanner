import { patchNode, useNode } from '~/store/board'
import { Area } from '../ui'
import { CommentBadge } from './Comments'

/** A sticky note: just big text on coloured paper; the margin drags it. */
export function StickyCard({ id }: { id: string }) {
  const n = useNode(id, 'sticky')
  if (!n) return null

  return (
    <div className="relative px-4 pt-4 pb-6">
      <Area
        value={n.text}
        onValue={(text, m) => patchNode<'sticky'>(id, (x) => ({ ...x, text }), m)}
        rows={5}
        placeholder="Write something…"
        aria-label="Sticky note"
        className="text-[17px] leading-snug font-medium text-neutral-100 placeholder:text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]"
      />
      <CommentBadge id={id} className="absolute right-2 bottom-1.5" />
    </div>
  )
}
