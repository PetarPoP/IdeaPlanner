import { useBoard } from '~/store/board'
import { useLive } from '~/store/live'

/** Other people's pointers on the board, drawn in board space at a constant size. */
export function RemoteCursors() {
  const peers = useLive((s) => s.peers)
  const z = useBoard((s) => s.view.z)
  return (
    <>
      {Object.values(peers)
        .filter((p) => p.x != null && p.y != null)
        .map((p) => (
          <div
            key={p.id}
            className="anim-fade pointer-events-none absolute z-[70] transition-[left,top] duration-100 ease-linear"
            style={{ left: p.x!, top: p.y!, transform: `scale(${1 / z})`, transformOrigin: '0 0' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow" aria-hidden>
              <path d="M2 1.5 15.5 8 9 9.6 6.4 16Z" fill={p.color} stroke="var(--color-bg)" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span
              className="absolute top-4 left-3 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-bg shadow"
              style={{ background: p.color }}
            >
              {p.name || 'Guest'}
            </span>
          </div>
        ))}
    </>
  )
}
