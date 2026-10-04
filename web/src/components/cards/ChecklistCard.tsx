import type { ChangeMode } from '~/store/board'
import { CheckSquare, Square } from '@phosphor-icons/react'
import type { Task } from '~/lib/model.gen'
import { newItem } from '~/lib/templates'
import { addRow, patchRow, removeRow, useNode } from '~/store/board'
import { AddRowButton, Bar, Field, RemoveButton, cx } from '../ui'
import { useBoardMeta } from './hooks'

export function ChecklistCard({ id }: { id: string }) {
  const n = useNode(id, 'checklist')
  const { splitN, people } = useBoardMeta()
  if (!n) return null
  const done = n.items.filter((i) => i.done).length
  const row = (t: Task, patch: Partial<Task>, mode?: ChangeMode) => patchRow(id, 'items', t.id, patch, mode)

  return (
    <div className="flex flex-col gap-1 px-3 pb-3">
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <Bar className="h-[3px] flex-1" pct={n.items.length ? (done / n.items.length) * 100 : 0} />
        {done}/{n.items.length}
      </div>
      {n.items.map((t) => (
        <div key={t.id} className="flex min-h-8 items-center gap-2">
          <button type="button" aria-pressed={t.done} onClick={() => row(t, { done: !t.done })} className="grid place-items-center text-lg text-accent">
            {t.done ? <CheckSquare weight="fill" /> : <Square />}
          </button>
          <Field
            value={t.text}
            onValue={(text, m) => row(t, { text }, m)}
            placeholder="To do"
            className={cx('flex-1 py-1 text-[13px]', t.done && 'text-neutral-500 line-through')}
          />
          <button
            type="button"
            title="Assign — tap to change"
            onClick={() => row(t, { who: t.who == null ? 0 : t.who + 1 >= splitN ? null : t.who + 1 })}
            className={cx(
              'size-6 flex-none rounded-full p-0 text-[9px]',
              t.who != null ? 'bg-neutral-700 text-neutral-100' : 'border border-dashed border-neutral-700 text-neutral-500',
            )}
          >
            {t.who != null ? people[t.who]?.ini : '+'}
          </button>
          <RemoveButton onClick={() => removeRow(id, 'items', t.id)} />
        </div>
      ))}
      <AddRowButton className="mt-1" onClick={() => addRow(id, 'items', newItem.task())}>
        Add task
      </AddRowButton>
    </div>
  )
}
