import type { ReactNode } from 'react'
import { CalendarBlank, MapPin, Users } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { summarize } from '~/lib/budget'
import { countdown, rangeLabel } from '~/lib/dates'
import { NamedIcon } from '~/lib/icons'
import { money } from '~/lib/money'
import { useBoard } from '~/store/board'
import { Field, PlanPaidBar, cx } from '../ui'
import { Tween } from '../Tween'

/** The scrolling page behind the List, Costs and Timeline views: board header, totals, then the view. */
export function PageView({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-auto pt-[112px] pb-10 md:pt-[78px]">
      <div className="anim-page mx-auto flex max-w-[1240px] flex-col gap-5 px-3 md:px-7">
        <BoardHeader actions={actions} />
        <Totals />
        {children}
      </div>
    </div>
  )
}

function BoardHeader({ actions }: { actions?: ReactNode }) {
  const b = useBoard(
    useShallow((s) => ({
      title: s.board!.title,
      icon: s.board!.icon,
      date: s.board!.date,
      endDate: s.board!.endDate,
      place: s.board!.place,
      splitN: s.board!.splitN,
    })),
  )
  const range = rangeLabel(b.date, b.endDate)
  const until = countdown(b.date, b.endDate)
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 md:gap-x-5">
      <div className="grid size-[52px] flex-none place-items-center rounded-xl bg-surface text-[26px] text-accent shadow-sm">
        <NamedIcon name={b.icon} />
      </div>
      <div className="flex min-w-[200px] flex-1 basis-0 flex-col gap-1">
        <Field
          value={b.title}
          onValue={(v, m) => useBoard.getState().change((x) => ({ ...x, title: v }), m)}
          aria-label="Board title"
          className="w-full text-[26px] leading-tight font-medium md:text-[32px]"
        />
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-neutral-400">
          <span className="flex items-center gap-1.5">
            <CalendarBlank />
            {range ? `${range}${until ? ` · ${until}` : ''}` : 'No dates yet'}
          </span>
          {b.place && (
            <span className="flex items-center gap-1.5">
              <MapPin />
              {b.place}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Users />
            {b.splitN} {b.splitN === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Budget used, estimated total, spent and per person, as in the design's grand-total bar. */
export function Totals() {
  const board = useBoard((s) => s.board!)
  const sum = summarize(board)
  const m = (v: number) => money(board.cur, v)
  const pct = (v: number) => (sum.cap ? (v / sum.cap) * 100 : 0)
  const over = sum.cap > 0 && sum.total > sum.cap
  const items = sum.costed.reduce(
    (a, n) => a + (n.type === 'section' ? n.items.filter((i) => i.cost).length : n.type === 'itinerary' ? n.stops.filter((s) => s.cost).length : 1),
    0,
  )
  const cell = 'flex flex-col gap-1 px-5 py-4'
  return (
    <div
      className="grid grid-cols-2 overflow-hidden rounded-xl shadow-sm md:grid-cols-[1.6fr_1fr_1fr_1fr]"
      style={{ background: 'linear-gradient(180deg,#262838,var(--color-surface))' }}
    >
      <div className={cx(cell, 'col-span-2 gap-2.5 md:col-span-1')}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="kicker text-[11px]">Budget used</span>
          <span className="text-xs text-neutral-400">{sum.cap ? `${m(sum.paid)} of ${m(sum.cap)} cap` : 'No budget set'}</span>
        </div>
        <PlanPaidBar className="h-2" planPct={pct(sum.total)} paidPct={pct(sum.paid)} over={over} striped />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-accent" />
            Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-accent-800" />
            Planned
          </span>
          {sum.cap > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-neutral-900 shadow-inset" />
              {over ? `${m(sum.total - sum.cap)} over` : `Headroom ${m(sum.cap - sum.total)}`}
            </span>
          )}
        </div>
      </div>
      <div className={cx(cell, 'shadow-[inset_1px_0_0_#3f424d] max-md:shadow-[inset_0_1px_0_#3f424d]')}>
        <span className="kicker text-[11px]">Estimated total</span>
        <span className="text-[22px] font-medium tracking-[-0.02em] md:text-[26px]"><Tween value={sum.total} format={m} /></span>
        <span className="text-xs text-neutral-500">
          {sum.costed.length} cards · {items} costed items
        </span>
      </div>
      <div className={cx(cell, 'shadow-[inset_1px_0_0_#3f424d] max-md:shadow-[inset_1px_1px_0_#3f424d]')}>
        <span className="kicker text-[11px]">Spent</span>
        <span className="text-[22px] font-medium tracking-[-0.02em] md:text-[26px]"><Tween value={sum.paid} format={m} /></span>
        <span className="text-xs text-neutral-500">{m(Math.max(0, sum.total - sum.paid))} still to pay</span>
      </div>
      <div className={cx(cell, 'col-span-2 shadow-[inset_1px_0_0_#3f424d] max-md:shadow-[inset_0_1px_0_#3f424d] md:col-span-1')}>
        <span className="kicker text-[11px] text-accent">Per person</span>
        <span className="text-[22px] font-medium tracking-[-0.02em] text-accent-200 md:text-[26px]"><Tween value={sum.perPerson} format={m} /></span>
        <span className="text-xs text-neutral-500">split evenly · {board.splitN} people</span>
      </div>
    </div>
  )
}
