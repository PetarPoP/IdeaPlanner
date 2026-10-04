import { CalendarBlank, CheckCircle, ClockCounterClockwise, Lightbulb, List, ShareNetwork, Wallet } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { summarize } from '~/lib/budget'
import { dateLabel } from '~/lib/dates'
import { NamedIcon } from '~/lib/icons'
import { money } from '~/lib/money'
import { isMobileWidth, useBoard } from '~/store/board'
import { Field, PlanPaidBar, cx } from '../ui'

export function TopBar() {
  const { title, icon, date } = useBoard(useShallow((s) => ({ title: s.board!.title, icon: s.board!.icon, date: s.board!.date })))
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const wide = useBoard((s) => s.vw >= 1180)
  const panel = useBoard((s) => s.panel)
  const set = useBoard((s) => s.set)

  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-40 flex items-center gap-2 md:inset-x-3 md:top-3">
      <div className="glass-sm pointer-events-auto flex max-w-max min-w-0 flex-auto items-center gap-2 rounded-xl py-1.5 pr-2.5 pl-1.5">
        <button
          type="button"
          title="Templates"
          onClick={() => set({ dialog: 'templates' })}
          className="grid size-[34px] flex-none place-items-center rounded-lg border border-accent text-accent shadow-glow"
        >
          <Lightbulb size={18} />
        </button>
        <NamedIcon name={icon} className="flex-none text-lg text-neutral-400 max-md:hidden" />
        <Field
          value={title}
          onValue={(v, m) => useBoard.getState().change((b) => ({ ...b, title: v }), m)}
          aria-label="Board title"
          className="w-[110px] min-w-[70px] flex-[1_1_110px] text-[15px] font-medium text-ellipsis md:w-[200px] md:min-w-[100px] md:flex-[1_1_200px]"
        />
        {wide && (
          <span className="tag tag-neutral flex-none gap-1.5 whitespace-nowrap">
            <CalendarBlank />
            {dateLabel(date)}
          </span>
        )}
      </div>
      <div className="flex-1" />
      <BudgetSummaryButton mobile={mobile} />
      <button
        type="button"
        title="Set budget"
        onClick={() => set({ dialog: 'budget' })}
        className="pointer-events-auto flex h-[46px] flex-none items-center gap-1.5 rounded-xl border border-accent bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] px-3.5 text-sm font-medium text-accent hover:bg-accent-900"
      >
        <Wallet size={18} />
        {!mobile && <span>Budget</span>}
      </button>
      {!mobile && (
        <div className="glass-sm pointer-events-auto flex items-center gap-1 rounded-xl p-[5px]">
          <PeopleStack onClick={() => set({ panel: 'people' })} />
          <button type="button" title="Tasks" onClick={() => set({ panel: 'tasks' })} className="btn btn-icon text-neutral-300">
            <CheckCircle size={18} />
          </button>
          <button type="button" title="Activity" onClick={() => set({ panel: 'activity' })} className="btn btn-icon text-neutral-300">
            <ClockCounterClockwise size={18} />
          </button>
        </div>
      )}
      {mobile && (
        <button
          type="button"
          title="Panels"
          onClick={() => set({ panel: panel ? null : 'tasks' })}
          className="glass-sm pointer-events-auto grid size-[46px] flex-none place-items-center rounded-xl"
        >
          <List size={20} />
        </button>
      )}
      <button
        type="button"
        onClick={() => set({ panel: 'people' })}
        className="btn btn-primary pointer-events-auto h-[46px] flex-none rounded-xl bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)]"
      >
        <ShareNetwork size={18} />
        {!mobile && <span>Share</span>}
      </button>
    </div>
  )
}

function BudgetSummaryButton({ mobile }: { mobile: boolean }) {
  const board = useBoard((s) => s.board!)
  const sum = summarize(board)
  const m = (v: number) => money(board.cur, v)
  const pct = (v: number) => (sum.cap ? (v / sum.cap) * 100 : 0)

  return (
    <button
      type="button"
      onClick={() => useBoard.getState().set({ panel: 'budget' })}
      className="glass-sm pointer-events-auto flex flex-none items-center gap-3.5 rounded-xl px-3 py-1.5 hover:shadow-md md:px-3.5"
    >
      {!mobile && (
        <div className="flex flex-col items-start leading-[1.15]">
          <span className="text-[9.5px] tracking-[.08em] text-neutral-500 uppercase">Planned</span>
          <span className="text-[15px] font-medium">{m(sum.total)}</span>
        </div>
      )}
      {!mobile && (
        <div className="flex w-[110px] flex-col gap-1">
          <PlanPaidBar className="h-[5px]" planPct={pct(sum.total)} paidPct={pct(sum.paid)} over={sum.cap > 0 && sum.total > sum.cap} striped />
          <span className="text-left text-[10px] text-neutral-500">
            {sum.cap ? (sum.total > sum.cap ? `${m(sum.total - sum.cap)} over` : `${m(sum.cap - sum.total)} left of ${m(sum.cap)}`) : 'No budget set'}
          </span>
        </div>
      )}
      <div className="flex flex-col items-start leading-[1.15]">
        <span className="text-[9.5px] tracking-[.08em] text-accent uppercase">Per person</span>
        <span className="text-[15px] font-medium text-accent-200">{m(sum.perPerson)}</span>
      </div>
    </button>
  )
}

function PeopleStack({ onClick }: { onClick: () => void }) {
  const people = useBoard((s) => s.board!.people)
  const shown = people.slice(0, 2)
  const rest = people.length - shown.length
  return (
    <button type="button" title="People" onClick={onClick} className="flex items-center rounded-lg py-1 pr-2 pl-1 hover:bg-neutral-900">
      {shown.map((p, i) => (
        <span
          key={i}
          className={cx(
            'grid size-7 place-items-center rounded-full text-[10px] font-medium',
            i === 0 ? 'bg-accent-700 text-accent-100' : '-ml-1.5 bg-neutral-700',
          )}
          style={{ boxShadow: i === 0 ? '0 0 0 2px var(--color-surface),0 0 0 3.5px var(--color-accent)' : '0 0 0 2px var(--color-surface)' }}
        >
          {p.ini}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="-ml-1.5 grid size-7 place-items-center rounded-full bg-neutral-900 text-[10px] text-neutral-400"
          style={{ boxShadow: '0 0 0 2px var(--color-surface),0 0 0 3px var(--color-neutral-800)' }}
        >
          +{rest}
        </span>
      )}
    </button>
  )
}
