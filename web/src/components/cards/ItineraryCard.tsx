import type { ChangeMode } from '~/store/board'
import { ArrowSquareOut, CalendarBlank, CarSimple, MapPinLine } from '@phosphor-icons/react'
import type { Stop } from '~/lib/model.gen'
import { nodeTotal } from '~/lib/budget'
import { dirLink } from '~/lib/maps'
import { money } from '~/lib/money'
import { newItem } from '~/lib/templates'
import { addRow, patchNode, patchRow, removeRow, useBoard, useNode } from '~/store/board'
import { AddRowButton, CostField, Field, RemoveButton } from '../ui'
import { useBoardMeta } from './hooks'

export function ItineraryCard({ id }: { id: string }) {
  const n = useNode(id, 'itinerary')
  const { cur } = useBoardMeta()
  if (!n) return null

  const total = nodeTotal(n)
  const named = n.stops.map((s) => s.place).filter(Boolean)
  const row = (s: Stop, patch: Partial<Stop>, mode?: ChangeMode) => patchRow(id, 'stops', s.id, patch, mode)

  return (
    <div className="flex flex-col px-3 pb-3">
      <div className="mb-1.5 flex items-center gap-2">
        <CalendarBlank className="text-accent-300" />
        <Field
          value={n.date}
          onValue={(date, m) => patchNode<'itinerary'>(id, (x) => ({ ...x, date }), m)}
          placeholder="Date"
          className="flex-1 text-xs text-accent-300"
        />
        <span className="text-xs text-neutral-400">{total ? money(cur, total) : ''}</span>
      </div>
      {n.stops.map((s, i) => {
        const prev = n.stops[i - 1]
        return (
          <div key={s.id} className="flex flex-col">
            {prev && (
              <a
                href={dirLink([prev.place, s.place])}
                target="_blank"
                rel="noreferrer"
                className="ml-[9px] flex items-center gap-1.5 border-l-[1.5px] border-dashed border-neutral-700 py-[3px] pl-4 text-[11px] text-neutral-500 no-underline hover:text-accent-300"
              >
                <CarSimple />
                Directions
              </a>
            )}
            <div className="flex min-h-[34px] items-center gap-1.5">
              <span className="grid size-5 flex-none place-items-center rounded-full border-[1.5px] border-accent text-[10px] text-accent-300">{i + 1}</span>
              <Field value={s.time} onValue={(time, m) => row(s, { time }, m)} placeholder="--:--" className="w-10 font-mono text-xs text-neutral-400" />
              <Field value={s.place} onValue={(place, m) => row(s, { place }, m)} placeholder="Place" className="flex-1 text-[13px]" />
              <CostField cur={cur} value={s.cost} onValue={(cost, m) => row(s, { cost }, m)} width={34} placeholder="–" />
              <RemoveButton onClick={() => removeRow(id, 'stops', s.id)} />
            </div>
          </div>
        )
      })}
      <div className="mt-2 flex gap-1.5">
        <AddRowButton className="flex-1" onClick={() => addRow(id, 'stops', newItem.stop())}>
          Add stop
        </AddRowButton>
        <button
          type="button"
          title="Show this day on the map card"
          onClick={() => useBoard.getState().pushToMap(id, named.join(' → '), n.title)}
          className="flex items-center gap-1.5 rounded-lg border border-accent-700 px-2.5 py-[7px] text-xs text-accent-300 hover:bg-accent-900"
        >
          <MapPinLine />
          To map
        </button>
        <a
          href={named.length ? dirLink(named) : 'https://www.google.com/maps'}
          target="_blank"
          rel="noreferrer"
          title="Open day in Google Maps"
          className="grid w-8 place-items-center rounded-lg border border-neutral-800 text-neutral-400 no-underline hover:text-accent-300"
        >
          <ArrowSquareOut />
        </a>
      </div>
    </div>
  )
}
