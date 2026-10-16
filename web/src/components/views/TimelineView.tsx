import { Crosshair, Export, Plus } from '@phosphor-icons/react'
import type { Node } from '~/lib/model.gen'
import { BOOKING_KINDS } from '~/lib/catalog'
import { addDays, dayLabel, daysBetween, isIsoDate, toIso } from '~/lib/dates'
import { NamedIcon } from '~/lib/icons'
import { money, num } from '~/lib/money'
import { patchNode, useBoard } from '~/store/board'
import { DateField, cx } from '../ui'
import { WeatherChip } from '../WeatherChip'
import { PageView } from './PageView'

type Itinerary = Extract<Node, { type: 'itinerary' }>
type Booking = Extract<Node, { type: 'booking' }>

interface Item {
  key: string
  node: Itinerary | Booking
  time: string
  /** For bookings: the start or the end of it. */
  end?: boolean
}

/** Longest trip shown day by day, empty days included. */
const MAX_FILLED_DAYS = 45

/** Day plans and bookings laid out by date, with what still needs a date at the end. */
export function TimelineView() {
  const board = useBoard((s) => s.board!)
  const byDate = new Map<string, Item[]>()
  const unscheduled: Array<Itinerary | Booking> = []
  const put = (date: string, item: Item) => byDate.set(date, [...(byDate.get(date) ?? []), item])

  for (const n of board.nodes) {
    if (n.type === 'itinerary') {
      if (isIsoDate(n.date)) put(n.date, { key: n.id, node: n, time: n.stops.find((s) => s.time)?.time ?? '' })
      else unscheduled.push(n)
    } else if (n.type === 'booking') {
      if (!isIsoDate(n.startDate)) unscheduled.push(n)
      else {
        put(n.startDate, { key: `${n.id}:s`, node: n, time: n.startTime })
        if (isIsoDate(n.endDate) && n.endDate !== n.startDate) put(n.endDate, { key: `${n.id}:e`, node: n, time: n.endTime, end: true })
      }
    }
  }

  // Every day of the trip, plus any dated item outside it.
  const days = new Set(byDate.keys())
  const span = daysBetween(board.date, board.endDate)
  if (isIsoDate(board.date)) {
    days.add(board.date)
    if (span != null && span > 0 && span <= MAX_FILLED_DAYS) for (let i = 1; i <= span; i++) days.add(addDays(board.date, i))
  }
  const sorted = [...days].sort()
  const today = toIso(new Date())

  const addDay = () => {
    const s = useBoard.getState()
    const last = sorted[sorted.length - 1]
    const empty = sorted.find((d) => !byDate.get(d)?.some((i) => i.node.type === 'itinerary'))
    const date = empty ?? (last ? addDays(last, 1) : board.date || today)
    const day = (daysBetween(board.date, date) ?? 0) + 1
    const nodes = s.board?.nodes ?? []
    const x = nodes.length ? Math.max(...nodes.map((n) => n.x + n.w)) + 40 : 0
    const id = s.addNode('itinerary', { x: x + 150, y: 80 })
    patchNode<'itinerary'>(id, (n) => ({ ...n, date, title: isIsoDate(board.date) ? `Day ${day}` : dayLabel(date) }), 'silent')
    s.setMode('timeline')
  }

  return (
    <PageView
      actions={
        <>
          <button type="button" title="Export (Ctrl+E)" onClick={() => useBoard.getState().toggleDialog('export')} className="btn btn-secondary">
            <Export />
            Export
          </button>
          <button type="button" onClick={addDay} className="btn btn-primary">
            <Plus />
            Add day
          </button>
        </>
      }
    >
      {!sorted.length && !unscheduled.length && (
        <div className="rounded-xl bg-surface p-6 text-center text-sm text-neutral-500 shadow-sm">
          Set the board's dates in the top bar, then add day plans and bookings to see them here.
        </div>
      )}
      <ol className="relative flex flex-col gap-1">
        {sorted.map((date, i) => {
          const items = (byDate.get(date) ?? []).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
          const dayNo = isIsoDate(board.date) ? (daysBetween(board.date, date) ?? 0) + 1 : null
          const inTrip = dayNo != null && dayNo >= 1 && (span == null || span < 0 || dayNo <= span + 1)
          const stop = items.flatMap((it) => (it.node.type === 'itinerary' ? it.node.stops : [])).find((s) => s.place.trim())
          return (
            <li key={date} className="anim-card grid grid-cols-[76px_1fr] gap-3 md:grid-cols-[120px_1fr] md:gap-5" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <div className="relative flex flex-col items-end pt-3 text-right">
                <span className={cx('text-[13px] font-medium', date === today ? 'text-accent-200' : 'text-text')}>{dayLabel(date)}</span>
                <span className="text-[11px] text-neutral-500">
                  {date === today ? 'Today' : inTrip ? `Day ${dayNo}` : date.slice(0, 4)}
                </span>
                <WeatherChip place={stop?.place ?? board.place} date={date} near={board.place} className="mt-0.5" />
              </div>
              <div className="relative border-l border-neutral-800 pb-4 pl-4 md:pl-5">
                <span
                  className={cx(
                    'absolute top-[18px] -left-[5px] size-[9px] rounded-full',
                    items.length ? 'bg-accent shadow-[0_0_8px_var(--color-accent)]' : 'bg-neutral-700',
                  )}
                />
                {items.length ? (
                  <div className="flex flex-col gap-2">
                    {items.map((it) => (
                      <TimelineItem key={it.key} item={it} cur={board.cur} />
                    ))}
                  </div>
                ) : (
                  <div className="pt-2.5 text-xs text-neutral-600">Nothing planned</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {unscheduled.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="kicker">Needs a date</span>
          {unscheduled.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface px-3.5 py-2.5 shadow-sm">
              <NamedIcon name={n.icon} className="text-accent" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{n.title || 'Untitled'}</span>
              <DateField
                value=""
                min={board.date || undefined}
                aria-label={`Date for ${n.title}`}
                onValue={(date) =>
                  n.type === 'itinerary'
                    ? patchNode<'itinerary'>(n.id, (x) => ({ ...x, date }))
                    : patchNode<'booking'>(n.id, (x) => ({ ...x, startDate: date }))
                }
              />
            </div>
          ))}
        </div>
      )}
    </PageView>
  )
}

function TimelineItem({ item, cur }: { item: Item; cur: string }) {
  const n = item.node
  const focus = () => useBoard.getState().focusNode(n.id)
  const go = (
    <button
      type="button"
      title="Show on the board"
      onClick={focus}
      className="grid size-7 flex-none place-items-center rounded-md text-neutral-500 hover:bg-neutral-900 hover:text-text"
    >
      <Crosshair />
    </button>
  )

  if (n.type === 'itinerary') {
    const total = n.stops.reduce((a, s) => a + num(s.cost), 0)
    return (
      <div className="flex flex-col gap-1.5 rounded-xl bg-surface p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <NamedIcon name={n.icon} className="text-accent" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title || 'Day plan'}</span>
          {total > 0 && <span className="text-xs text-neutral-400">{money(cur, total)}</span>}
          {go}
        </div>
        {n.stops
          .filter((s) => s.place || s.time)
          .map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 text-[13px]">
              <span className="w-11 flex-none font-mono text-xs text-neutral-500">{s.time || '·'}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-200">{s.place}</span>
              {num(s.cost) > 0 && <span className="text-xs text-neutral-500">{money(cur, num(s.cost))}</span>}
            </div>
          ))}
      </div>
    )
  }

  const kind = BOOKING_KINDS[n.kind]
  // A return flight goes back the other way.
  const route = (item.end && n.kind === 'Flight' ? [n.to, n.from] : [n.from, n.to]).filter(Boolean).join(' → ')
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 shadow-sm" style={{ background: 'linear-gradient(135deg,var(--color-accent-900),var(--color-surface))' }}>
      <NamedIcon name={kind.icon} className="text-lg text-accent-300" />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium">
          {item.end ? kind.end : kind.start}
          {item.time && <span className="font-mono text-xs text-neutral-400"> · {item.time}</span>}
        </span>
        <span className="truncate text-xs text-neutral-400">
          {n.title}
          {route && ` · ${route}`}
        </span>
      </div>
      {!item.end && num(n.cost) > 0 && <span className="text-xs text-neutral-300">{money(cur, num(n.cost))}</span>}
      {go}
    </div>
  )
}
