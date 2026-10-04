import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import type { Board } from '~/lib/model.gen'
import { nodeTotal, summarize } from '~/lib/budget'
import { BOOKING_KINDS } from '~/lib/catalog'
import { dayLabel, daysBetween, isIsoDate, rangeLabel } from '~/lib/dates'
import type { PlanItem } from '~/lib/export'
import { planByDay } from '~/lib/export'
import { money, num } from '~/lib/money'
import { useBoard } from '~/store/board'

const usePrint = create<{ on: boolean }>(() => ({ on: false }))

/** Prints (or saves as PDF) the board as a light, paper-friendly itinerary. */
export const printItinerary = () => usePrint.setState({ on: true })

/**
 * The printable itinerary. Mounted only while printing, outside the app's
 * fixed full-screen layout so it can run over several pages; the print
 * rules in styles.css hide everything else.
 */
export function PrintView() {
  const on = usePrint((s) => s.on)
  const board = useBoard((s) => s.board)

  useEffect(() => {
    if (!on) return
    const done = () => usePrint.setState({ on: false })
    window.addEventListener('afterprint', done)
    // Print once the itinerary is in the DOM.
    const frame = requestAnimationFrame(() => window.print())
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', done)
    }
  }, [on])

  if (!on || !board) return null
  return createPortal(<Itinerary board={board} />, document.body)
}

function Itinerary({ board }: { board: Board }) {
  const { days, undated } = planByDay(board)
  const sum = summarize(board)
  const m = (v: number) => money(board.cur, v)
  const range = rangeLabel(board.date, board.endDate)
  const people = board.people.slice(0, board.splitN)

  return (
    <article className="print-root">
      <header className="mb-6 border-b border-[#d4d4dc] pb-4">
        <h1 className="text-[26px] leading-tight font-semibold">{board.title || 'Untitled plan'}</h1>
        <p className="mt-1 text-[13px] text-[#55576a]">
          {[range, board.place, `${board.splitN} ${board.splitN === 1 ? 'person' : 'people'}`].filter(Boolean).join(' · ')}
        </p>
      </header>

      {days.map(({ date, items }) => {
        const dayNo = isIsoDate(board.date) ? (daysBetween(board.date, date) ?? 0) + 1 : null
        return (
          <section key={date} className="mb-5">
            <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-semibold">
              {dayLabel(date)}
              {dayNo != null && dayNo >= 1 && <span className="text-[12px] font-normal text-[#6b6d80]">Day {dayNo}</span>}
            </h2>
            <div className="flex flex-col gap-2 border-l-2 border-[#d4d4dc] pl-4">
              {items.map((it) => (
                <PlanEntry key={it.key} item={it} cur={board.cur} />
              ))}
            </div>
          </section>
        )
      })}

      {undated.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[15px] font-semibold">Not dated yet</h2>
          <div className="flex flex-col gap-2 border-l-2 border-[#d4d4dc] pl-4">
            {undated.map((n) => (
              <PlanEntry key={n.id} item={{ key: n.id, node: n, time: '' }} cur={board.cur} />
            ))}
          </div>
        </section>
      )}

      {!days.length && !undated.length && <p className="mb-5 text-[13px] text-[#55576a]">No day plans or bookings yet.</p>}

      <section className="mt-6 border-t border-[#d4d4dc] pt-4">
        <h2 className="mb-2 text-[15px] font-semibold">Costs</h2>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {sum.costed.map((n) => (
              <tr key={n.id} className="border-b border-[#ececf0]">
                <td className="py-1">{n.title || 'Untitled'}</td>
                <td className="py-1 text-right tabular-nums">{m(nodeTotal(n))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-semibold">
            <tr>
              <td className="pt-2">Total{sum.cap ? ` (budget ${m(sum.cap)})` : ''}</td>
              <td className="pt-2 text-right tabular-nums">{m(sum.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-[13px] text-[#55576a]">
          {m(sum.paid)} paid · {m(Math.max(0, sum.total - sum.paid))} still to pay · {m(sum.perPerson)} per person
        </p>
        {sum.transfers.length > 0 && (
          <ul className="mt-2 text-[13px]">
            {sum.transfers.map((t, i) => (
              <li key={i}>
                {people[t.from]?.name ?? '?'} pays {people[t.to]?.name ?? '?'} {m(t.amount)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}

function PlanEntry({ item, cur }: { item: PlanItem; cur: string }) {
  const n = item.node
  if (n.type === 'itinerary') {
    const stops = n.stops.filter((s) => s.place || s.time)
    return (
      <div className="print-entry">
        <div className="text-[14px] font-medium">{n.title || 'Day plan'}</div>
        {stops.length > 0 && (
          <table className="mt-1 w-full border-collapse text-[13px]">
            <tbody>
              {stops.map((s) => (
                <tr key={s.id}>
                  <td className="w-14 py-0.5 align-top font-mono text-[12px] text-[#6b6d80]">{s.time}</td>
                  <td className="py-0.5">{s.place}</td>
                  <td className="py-0.5 text-right tabular-nums text-[#55576a]">{num(s.cost) > 0 ? money(cur, num(s.cost)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }
  const kind = BOOKING_KINDS[n.kind]
  // A return flight goes back the other way.
  const route = (item.end && n.kind === 'Flight' ? [n.to, n.from] : [n.from, n.to]).filter(Boolean).join(' → ')
  return (
    <div className="print-entry text-[13px]">
      <span className="text-[14px] font-medium">
        {item.time && <span className="font-mono text-[12px] text-[#6b6d80]">{item.time} </span>}
        {item.end ? kind.end : kind.start}: {n.title || n.kind}
      </span>
      {(route || n.conf) && (
        <div className="text-[#55576a]">{[route, n.conf && `Confirmation ${n.conf}`].filter(Boolean).join(' · ')}</div>
      )}
    </div>
  )
}
