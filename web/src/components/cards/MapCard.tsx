import { useMemo, useState } from 'react'
import { ArrowSquareOut, GoogleLogo, MapTrifold, Question } from '@phosphor-icons/react'
import { parseMapInput } from '~/lib/maps'
import { patchNode, useNode } from '~/store/board'
import { Field } from '../ui'

const DARK_MAP = 'invert(.92) hue-rotate(180deg) saturate(.55) brightness(.95) contrast(.9)'

export function MapCard({ id, selected }: { id: string; selected: boolean }) {
  const n = useNode(id, 'map')
  const [help, setHelp] = useState(false)
  const input = n?.input ?? ''
  const m = useMemo(() => parseMapInput(input), [input])
  if (!n) return null

  // The map only takes pointer input once its card is selected, so dragging
  // across the board never gets swallowed by the iframe.
  const locked = !selected

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      <div className="relative h-[300px] overflow-hidden rounded-[10px] bg-bg shadow-inset">
        {m.src ? (
          <iframe
            title={n.title}
            src={m.src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 size-full border-0"
            style={{ pointerEvents: locked ? 'none' : 'auto', filter: DARK_MAP }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-pretty text-neutral-400">
            <MapTrifold size={32} className="text-accent" />
            {m.msg}
          </div>
        )}
        {m.src && locked && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-2">
            <span className="tag tag-neutral">Tap card to use map</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 rounded-lg bg-bg px-2 py-1.5 shadow-inset">
        <GoogleLogo className="text-neutral-500" />
        <Field
          value={n.input}
          onValue={(v, mode) => patchNode<'map'>(id, (x) => ({ ...x, input: v }), mode)}
          placeholder="Paste a Google Maps link, embed code, or A → B → C"
          className="flex-1 py-0.5 text-xs text-neutral-200"
        />
      </div>
      {m.stops.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.stops.map((s, i) => (
            <span key={`${i}-${s}`} className="tag tag-neutral gap-1.5">
              <span className="text-accent-300">{String.fromCharCode(65 + i)}</span>
              {s}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <a className="btn btn-secondary text-xs" href={m.open} target="_blank" rel="noreferrer">
          <ArrowSquareOut />
          Open in Google Maps
        </a>
        <button type="button" onClick={() => setHelp(!help)} className="btn btn-ghost text-xs" aria-expanded={help}>
          <Question />
          How to add my route
        </button>
      </div>
      {help && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-bg px-3 py-2.5 text-xs leading-normal text-neutral-300">
          <span>
            <span className="text-accent-300">1</span> In Google Maps, plan your route with all stops.
          </span>
          <span>
            <span className="text-accent-300">2</span> Copy the full URL from the address bar (google.com/maps/dir/…) — or Share → Embed a map → Copy HTML.
          </span>
          <span>
            <span className="text-accent-300">3</span> Paste it above. Short maps.app.goo.gl links can’t be embedded.
          </span>
          <span className="text-neutral-500">Or just type stops: Lisbon → Sintra → Lagos</span>
        </div>
      )}
    </div>
  )
}
