import { Eye } from '@phosphor-icons/react'
import { useBoard } from '~/store/board'
import { useLive } from '~/store/live'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

/** Who else has the board open, and a "View only" tag when I can't edit. */
export function LiveAvatars() {
  const peers = Object.values(useLive((s) => s.peers))
  const status = useLive((s) => s.status)
  const viewOnly = useBoard((s) => s.role === 'view')
  const shown = peers.slice(0, 3)
  if (!viewOnly && !peers.length) return null
  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      {viewOnly && (
        <span className="anim-pop flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300" title="You can look, but not change this board">
          <Eye />
          View only
        </span>
      )}
      {peers.length > 0 && (
        <span className="flex items-center" title={`${peers.map((p) => p.name || 'Guest').join(', ')} ${peers.length === 1 ? 'is' : 'are'} here now`}>
          {shown.map((p, i) => (
            <span
              key={p.id}
              className="anim-pop grid size-6 place-items-center rounded-full text-[9.5px] font-semibold text-bg"
              style={{ background: p.color, marginLeft: i ? -6 : 0, boxShadow: '0 0 0 2px var(--color-surface)' }}
            >
              {initials(p.name || 'Guest')}
            </span>
          ))}
          {peers.length > shown.length && <span className="ml-1 text-[11px] text-neutral-400">+{peers.length - shown.length}</span>}
          <span className={status === 'live' ? 'ml-1.5 size-1.5 animate-pulse rounded-full bg-[#7fd1b9]' : 'ml-1.5 size-1.5 rounded-full bg-neutral-600'} />
        </span>
      )}
    </div>
  )
}
