import type { ChangeMode } from '~/store/board'
import { CheckCircle, Circle } from '@phosphor-icons/react'
import type { BookingKind } from '~/lib/model.gen'
import { BOOKING_KINDS } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import { patchNode, useBoard, useNode } from '~/store/board'
import { CostField, Field, Seg, cx } from '../ui'
import { useBoardMeta } from './hooks'

const KINDS = Object.keys(BOOKING_KINDS) as BookingKind[]

export function BookingCard({ id }: { id: string }) {
  const n = useNode(id, 'booking')
  const { cur, people } = useBoardMeta()
  const mobile = useBoard((s) => s.vw < 760)
  if (!n) return null

  const kind = BOOKING_KINDS[n.kind]
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
        <label className="kicker flex flex-col gap-0.5">
          When
          <Field value={n.when} onValue={(when, m) => set({ when }, m)} placeholder="Date · time" className="text-[13px] tracking-normal text-text normal-case" />
        </label>
        <label className="kicker flex flex-col gap-0.5">
          Confirmation
          <Field value={n.conf} onValue={(conf, m) => set({ conf }, m)} placeholder="—" className="font-mono text-[13px] tracking-[.06em] text-text normal-case" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set({ paid: !n.paid })}
          className={cx('flex items-center gap-1.5 rounded-lg px-2.5 py-[5px] text-xs', n.paid ? 'bg-accent-800 text-accent-100' : 'bg-bg text-neutral-400')}
        >
          {n.paid ? <CheckCircle weight="fill" /> : <Circle />}
          {n.paid ? `Paid by ${people[n.payer]?.name ?? '?'}` : 'Not paid'}
        </button>
        <div className="ml-auto">
          <CostField cur={cur} value={n.cost} onValue={(cost, m) => set({ cost }, m)} width={60} />
        </div>
      </div>
    </div>
  )
}
