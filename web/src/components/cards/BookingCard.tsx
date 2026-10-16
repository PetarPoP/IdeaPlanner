import type { ChangeMode } from '~/store/board'
import { CheckCircle, Circle } from '@phosphor-icons/react'
import type { BookingKind } from '~/lib/model.gen'
import { BOOKING_KINDS } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import { patchNode, useBoard, useNode } from '~/store/board'
import { daysBetween } from '~/lib/dates'
import { CostField, DateField, Field, Seg, cx } from '../ui'
import { useBoardMeta } from './hooks'

const KINDS = Object.keys(BOOKING_KINDS) as BookingKind[]

export function BookingCard({ id }: { id: string }) {
  const n = useNode(id, 'booking')
  const { cur, people } = useBoardMeta()
  const mobile = useBoard((s) => s.vw < 760)
  if (!n) return null

  const kind = BOOKING_KINDS[n.kind]
  const stay = daysBetween(n.startDate, n.endDate)
  type B = typeof n
  const set = (patch: Partial<B>, mode?: ChangeMode) => patchNode<'booking'>(id, (x) => ({ ...x, ...patch }), mode)

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3">
      <Seg
        className="self-start"
        value={n.kind}
        onPick={(k) => set({ kind: k, icon: BOOKING_KINDS[k].icon })}
        options={KINDS.map((k) => ({
          value: k,
          title: k,
          label: (
            <>
              <NamedIcon name={BOOKING_KINDS[k].icon} />
              {!mobile && k}
            </>
          ),
        }))}
      />
      <div
        className="flex items-center gap-2.5 rounded-[10px] p-3"
        style={{ background: 'linear-gradient(135deg,var(--color-accent-900),var(--color-bg))', boxShadow: 'inset 0 0 0 1px var(--color-accent-800)' }}
      >
        <Field value={n.from} onValue={(from, m) => set({ from }, m)} placeholder={kind.from} className="w-0 flex-1 text-xl font-medium" />
        <NamedIcon name={kind.icon} className="text-lg text-accent" />
        <Field value={n.to} onValue={(to, m) => set({ to }, m)} placeholder={kind.to} className="w-0 flex-1 text-right text-xl font-medium" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Moment label={kind.start} date={n.startDate} time={n.startTime} onDate={(startDate) => set({ startDate })} onTime={(startTime) => set({ startTime })} />
        <Moment
          label={kind.end}
          date={n.endDate}
          time={n.endTime}
          min={n.startDate}
          onDate={(endDate) => set({ endDate })}
          onTime={(endTime) => set({ endTime })}
        />
      </div>
      {stay != null && stay > 0 && (
        <span className="-mt-1 text-[11px] text-neutral-500">
          {n.kind === 'Stay' ? `${stay} night${stay === 1 ? '' : 's'}` : `${stay + 1} days`}
        </span>
      )}
      <label className="kicker flex items-center gap-2">
        Confirmation
        <Field value={n.conf} onValue={(conf, m) => set({ conf }, m)} placeholder="—" className="flex-1 font-mono text-[13px] tracking-[.06em] text-text normal-case" />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set({ paid: !n.paid })}
          className={cx('flex items-center gap-1.5 rounded-lg px-2.5 py-[5px] text-xs', n.paid ? 'bg-accent-800 text-accent-100' : 'bg-bg text-neutral-400')}
        >
          {n.paid ? <CheckCircle weight="fill" className="anim-check" /> : <Circle />}
          {n.paid ? `Paid by ${people[n.payer]?.name ?? '?'}` : 'Not paid'}
        </button>
        <div className="ml-auto">
          <CostField cur={cur} ownCur={n.cur} onCur={(c) => set({ cur: c })} value={n.cost} onValue={(cost, m) => set({ cost }, m)} width={60} />
        </div>
      </div>
    </div>
  )
}

/** "Check-in" with a date and a time, both typeable. */
function Moment({
  label,
  date,
  time,
  min,
  onDate,
  onTime,
}: {
  label: string
  date: string
  time: string
  min?: string
  onDate: (v: string) => void
  onTime: (v: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="kicker">{label}</span>
      <DateField value={date} min={min || undefined} onValue={onDate} aria-label={`${label} date`} className="w-full" />
      <DateField type="time" value={time} onValue={onTime} aria-label={`${label} time`} className="w-full" />
    </div>
  )
}
