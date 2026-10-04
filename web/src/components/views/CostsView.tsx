import { useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle, Circle, Crosshair, Export, PencilSimple } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import type { CostItem, Stop } from '~/lib/model.gen'
import type { CostedNode } from '~/lib/budget'
import { nodePaid, nodeTotal, summarize } from '~/lib/budget'
import { BOOKING_KINDS, KIND_LABEL } from '~/lib/catalog'
import { dayLabel } from '~/lib/dates'
import { NamedIcon } from '~/lib/icons'
import { money, num } from '~/lib/money'
import { newItem } from '~/lib/templates'
import type { ChangeMode } from '~/store/board'
import { addRow, patchNode, patchRow, useBoard } from '~/store/board'
import { Balances, SplitBox } from '../panel/SidePanel'
import { AddRowButton, Bar, CostField, Field, Seg, cx } from '../ui'
import { PageView } from './PageView'

type Filter = 'all' | 'unpaid' | 'paid'

/** Every cost on the board in one table, with the split and settle-up beside it. */
export function CostsView() {
  const board = useBoard((s) => s.board!)
  const [filter, setFilter] = useState<Filter>('all')
  const sum = summarize(board)
  const max = Math.max(1, ...sum.costed.map(nodeTotal))

  return (
    <PageView
      actions={
        <>
          <button type="button" title="Export (Ctrl+E)" onClick={() => useBoard.getState().toggleDialog('export')} className="btn btn-secondary">
            <Export />
            Export
          </button>
          <button type="button" onClick={() => useBoard.getState().toggleDialog('budget')} className="btn btn-secondary">
            <PencilSimple />
            Edit budget
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium">Costs by card</span>
            <Seg
              className="ml-auto"
              value={filter}
              onPick={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'unpaid', label: 'To pay' },
                { value: 'paid', label: 'Paid' },
              ]}
            />
          </div>
          {sum.costed.map((n) => (
            <CostCard key={n.id} n={n} max={max} filter={filter} />
          ))}
          {!sum.costed.length && (
            <div className="rounded-xl bg-surface p-6 text-center text-sm text-neutral-500 shadow-sm">
              Add a cost card, a day plan or a booking to start tracking money.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm lg:sticky lg:top-0">
          <SplitBox />
          <Balances />
        </div>
      </div>
    </PageView>
  )
}

function CostCard({ n, max, filter }: { n: CostedNode; max: number; filter: Filter }) {
  const { cur, splitN, people } = useBoard(useShallow((s) => ({ cur: s.board!.cur, splitN: s.board!.splitN, people: s.board!.people })))
  const total = nodeTotal(n)
  const paid = nodePaid(n)
  const budget = n.type === 'section' ? num(n.budget) : 0
  const m = (v: number) => money(cur, v)
  const show = (isPaid: boolean) => filter === 'all' || (filter === 'paid') === isPaid

  return (
    <div className="anim-card flex flex-col gap-2 rounded-xl bg-surface p-3.5 shadow-sm">
      <div className="flex items-center gap-2">
        <NamedIcon name={n.icon} className="text-[17px] text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title || 'Untitled'}</span>
        <span className="text-[9.5px] tracking-[.08em] whitespace-nowrap text-neutral-600 uppercase max-sm:hidden">
          {n.type === 'itinerary' && n.date ? dayLabel(n.date) : KIND_LABEL[n.type]}
        </span>
        <button
          type="button"
          title="Show on the board"
          onClick={() => useBoard.getState().focusNode(n.id)}
          className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-900 hover:text-text"
        >
          <Crosshair />
        </button>
        <span className="ml-auto flex flex-none items-baseline gap-2">
          <span className="text-lg font-medium tracking-[-0.02em]">{m(total)}</span>
          <span className="text-xs text-accent-300">{m(total / Math.max(1, splitN))}/pp</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Bar className="h-1 flex-1" pct={(total / (budget || max)) * 100} fill={budget && total > budget ? 'bg-neutral-300' : 'bg-accent'} />
        <span className="text-[11px] whitespace-nowrap text-neutral-500">
          {m(paid)} paid{budget ? ` · budget ${m(budget)}` : ''}
        </span>
      </div>
      <div className="flex flex-col">
        {n.type === 'section' &&
          n.items.map(
            (i) =>
              show(i.paid) && (
                <Line
                  key={i.id}
                  paid={i.paid}
                  onPaid={() => patchRow<CostItem>(n.id, 'items', i.id, { paid: !i.paid })}
                  payer={i.payer}
                  onPayer={(payer) => patchRow<CostItem>(n.id, 'items', i.id, { payer })}
                  people={people.slice(0, splitN)}
                  cost={i.cost}
                  onCost={(cost, mode) => patchRow<CostItem>(n.id, 'items', i.id, { cost }, mode)}
                  cur={cur}
                >
                  <Field
                    value={i.text}
                    onValue={(text, mode) => patchRow<CostItem>(n.id, 'items', i.id, { text }, mode)}
                    placeholder="Item"
                    className="flex-1 text-[13px]"
                  />
                </Line>
              ),
          )}
        {n.type === 'itinerary' &&
          filter !== 'paid' &&
          n.stops.map((st) => (
            <Line key={st.id} cur={cur} cost={st.cost} onCost={(cost, mode) => patchRow<Stop>(n.id, 'stops', st.id, { cost }, mode)}>
              <span className="w-11 flex-none font-mono text-xs text-neutral-500">{st.time || '·'}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{st.place || 'Stop'}</span>
            </Line>
          ))}
        {n.type === 'booking' && show(n.paid) && (
          <Line
            paid={n.paid}
            onPaid={() => patchNode<'booking'>(n.id, (x) => ({ ...x, paid: !x.paid }))}
            payer={n.payer}
            onPayer={(payer) => patchNode<'booking'>(n.id, (x) => ({ ...x, payer }))}
            people={people.slice(0, splitN)}
            cost={n.cost}
            onCost={(cost, mode) => patchNode<'booking'>(n.id, (x) => ({ ...x, cost }), mode)}
            cur={cur}
          >
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {BOOKING_KINDS[n.kind].start} {[n.from, n.to].filter(Boolean).join(' → ')}
              {n.startDate && <span className="text-neutral-500"> · {dayLabel(n.startDate)}</span>}
            </span>
          </Line>
        )}
      </div>
      {n.type === 'section' && filter !== 'paid' && (
        <AddRowButton className="self-start" onClick={() => addRow(n.id, 'items', newItem.cost())}>
          Add item
        </AddRowButton>
      )}
    </div>
  )
}

function Line({
  children,
  paid,
  onPaid,
  payer,
  onPayer,
  people,
  cost,
  onCost,
  cur,
}: {
  children: ReactNode
  paid?: boolean
  onPaid?: () => void
  payer?: number
  onPayer?: (p: number) => void
  people?: Array<{ name: string }>
  cost: string
  onCost: (v: string, mode: ChangeMode) => void
  cur: string
}) {
  return (
    <div className="rule-fade flex min-h-9 items-center gap-2 py-1">
      {onPaid ? (
        <button
          type="button"
          title={paid ? 'Paid' : 'Mark paid'}
          aria-pressed={paid}
          onClick={onPaid}
          className={cx('grid size-[22px] flex-none place-items-center text-[17px]', paid ? 'text-accent' : 'text-neutral-600')}
        >
          {paid ? <CheckCircle weight="fill" /> : <Circle />}
        </button>
      ) : (
        <span className="size-[22px] flex-none" />
      )}
      {children}
      {paid && onPayer && people && (
        <select
          value={payer}
          onChange={(e) => onPayer(Number(e.target.value))}
          aria-label="Paid by"
          className="rounded-md bg-bg px-1.5 py-0.5 text-[11px] text-neutral-300"
        >
          {people.map((p, i) => (
            <option key={i} value={i}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <CostField cur={cur} value={cost} paid={paid} onValue={onCost} width={56} placeholder="–" />
    </div>
  )
}
