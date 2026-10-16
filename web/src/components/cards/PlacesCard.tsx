import type { ChangeMode } from '~/store/board'
import { Heart, MapPin } from '@phosphor-icons/react'
import type { Place } from '~/lib/model.gen'
import { PLACE_CATEGORIES } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import { newItem } from '~/lib/templates'
import { addRow, patchRow, removeRow, useBoard, useNode } from '~/store/board'
import { AddRowButton, Field, RemoveButton, cx } from '../ui'

export function PlacesCard({ id }: { id: string }) {
  const n = useNode(id, 'places')
  const me = useBoard((s) => s.me)
  if (!n) return null
  const row = (p: Place, patch: Partial<Place>, mode?: ChangeMode) => patchRow(id, 'items', p.id, patch, mode)

  return (
    <div className="flex flex-col gap-0.5 px-3 pb-3">
      {n.items.map((p) => {
        const on = p.hearts.includes(me)
        const cat = PLACE_CATEGORIES[p.cat] ?? PLACE_CATEGORIES[0]!
        return (
          <div key={p.id} className="flex min-h-10 items-center gap-2">
            <button
              type="button"
              title="Change category"
              onClick={() => row(p, { cat: (p.cat + 1) % PLACE_CATEGORIES.length })}
              className="grid size-[30px] flex-none place-items-center rounded-lg bg-neutral-800 text-neutral-200"
            >
              <NamedIcon name={cat.icon} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <Field value={p.name} onValue={(name, m) => row(p, { name }, m)} placeholder="Place name" className="text-[13px]" />
              <span className="text-[11px] text-neutral-500">{cat.label}</span>
            </div>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => row(p, { hearts: on ? p.hearts.filter((x) => x !== me) : [...p.hearts, me] })}
              className={cx('flex items-center gap-1 rounded-md px-[7px] py-[3px] text-xs', on ? 'bg-accent-800 text-accent-100' : 'text-neutral-500')}
            >
              <Heart key={on ? 'on' : 'off'} weight={on ? 'fill' : 'regular'} className={on ? 'anim-check' : undefined} />
              {p.hearts.length}
            </button>
            <button
              type="button"
              title="Show on map"
              onClick={() => p.name && useBoard.getState().pushToMap(id, p.name, p.name)}
              className="grid size-[26px] flex-none place-items-center rounded-md text-accent-300 hover:bg-accent-900"
            >
              <MapPin />
            </button>
            <RemoveButton onClick={() => removeRow(id, 'items', p.id)} />
          </div>
        )
      })}
      <AddRowButton className="mt-1.5" onClick={() => addRow(id, 'items', newItem.place())}>
        Save a place
      </AddRowButton>
    </div>
  )
}
