import type { ChangeMode } from '~/store/board'
import { CheckCircle, Circle } from '@phosphor-icons/react'
import type { CostItem } from '~/lib/model.gen'
import { nodePaid, nodeTotal } from '~/lib/budget'
import { money, num } from '~/lib/money'
import { newItem } from '~/lib/templates'
import { addRow, patchRow, removeRow, useBoard, useNode } from '~/store/board'
import { AddRowButton, CostField, Field, PlanPaidBar, RemoveButton } from '../ui'
import { useBoardMeta, useRate } from './hooks'
import { Tween } from '../Tween'

export function SectionCard({ id }: { id: string }) {
  const rate = useRate()
  const n = useNode(id, 'section')
  const { cur, splitN, people } = useBoardMeta()
  if (!n) return null

  const total = nodeTotal(n, rate)
  const paid = nodePaid(n, rate)
  const budget = num(n.budget)
  const base = budget || total || 1
  const over = budget > 0 && total > budget
  const row = (i: CostItem, patch: Partial<CostItem>, mode?: ChangeMode) => patchRow(id, 'items', i.id, patch, mode)

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-medium tracking-[-0.02em]"><Tween value={total} format={(v) => money(cur, v)} /></span>
        <span className="text-[11px] text-neutral-500">
          {budget ? (over ? `over ${money(cur, budget)} budget` : `of ${money(cur, budget)}`) : 'total'}
        </span>
        <span className="ml-auto text-xs text-accent-300">{money(cur, total / splitN)}/pp</span>
      </div>
      <PlanPaidBar className="h-1" planPct={(total / base) * 100} paidPct={(paid / base) * 100} over={over} />
      <div className="mt-0.5 flex flex-col gap-px">
        {n.items.map((i) => (
          <div key={i.id} className="flex min-h-8 items-center gap-1.5">
            <button
              type="button"
              title="Mark paid"
              aria-pressed={i.paid}
              onClick={() => {
                row(i, { paid: !i.paid })
                if (!i.paid) useBoard.getState().log(`marked ${i.text || 'an item'} as paid`)
              }}
              className={`grid size-[22px] flex-none place-items-center text-[17px] ${i.paid ? 'text-accent' : 'text-neutral-600'}`}
            >
              {i.paid ? <CheckCircle weight="fill" className="anim-check" /> : <Circle />}
            </button>
            <Field value={i.text} onValue={(text, m) => row(i, { text }, m)} placeholder="Item" className="flex-1 py-1 text-[13px]" />
            {i.paid && (
              <button
                type="button"
                title="Paid by — tap to change"
                onClick={() => row(i, { payer: (i.payer + 1) % splitN })}
                className="size-[22px] flex-none rounded-full bg-neutral-700 p-0 text-[9px] text-neutral-100"
              >
                {people[i.payer]?.ini ?? '?'}
              </button>
            )}
            <CostField cur={cur} ownCur={i.cur} onCur={(c) => row(i, { cur: c })} value={i.cost} paid={i.paid} onValue={(cost, m) => row(i, { cost }, m)} />
            <RemoveButton onClick={() => removeRow(id, 'items', i.id)} />
          </div>
        ))}
      </div>
      <AddRowButton onClick={() => addRow(id, 'items', newItem.cost())}>Add cost item</AddRowButton>
    </div>
  )
}
