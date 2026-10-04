import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Minus, Plus, X } from '@phosphor-icons/react'
import { useBoard } from '~/store/board'
import type { ChangeMode } from '~/store/board'
import { cleanAmount } from '~/lib/money'

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

/** Focus/blur hooks that make one focused field a single undo step. */
const editHandlers = {
  onFocus: () => useBoard.getState().beginEdit(),
  onBlur: () => useBoard.getState().endEdit(),
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValue: (v: string, mode: ChangeMode) => void
}

/** A borderless text input bound to the board; typing is one undo step per focus. */
export function Field({ value, onValue, className, ...rest }: FieldProps) {
  return (
    <input
      {...rest}
      {...editHandlers}
      value={value}
      onChange={(e) => onValue(e.target.value, 'typing')}
      className={cx('field', className)}
    />
  )
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValue: (v: string, mode: ChangeMode) => void
}

export function Area({ value, onValue, className, ...rest }: AreaProps) {
  return (
    <textarea
      {...rest}
      {...editHandlers}
      value={value}
      onChange={(e) => onValue(e.target.value, 'typing')}
      className={cx('field w-full resize-none', className)}
    />
  )
}

/** The dashed "€ 120" pill used for amounts on cards. */
export function CostField({
  cur,
  value,
  onValue,
  paid = false,
  width = 44,
  placeholder = '0',
}: {
  cur: string
  value: string
  onValue: (v: string, mode: ChangeMode) => void
  paid?: boolean
  width?: number
  placeholder?: string
}) {
  return (
    <label
      className={cx(
        'flex flex-none items-center gap-0.5 rounded-md px-[7px] py-0.5 text-xs',
        paid
          ? 'bg-accent-800 text-accent-100'
          : value
            ? 'border border-dashed border-neutral-600 text-neutral-200'
            : 'border border-dashed border-neutral-800 text-neutral-600',
      )}
    >
      <span>{cur}</span>
      <Field
        value={value}
        onValue={(v, m) => onValue(cleanAmount(v), m)}
        placeholder={placeholder}
        inputMode="decimal"
        className="text-right text-xs"
        style={{ width }}
      />
    </label>
  )
}

export function AddRowButton({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-800 bg-transparent px-2 py-[7px] text-xs text-neutral-500 hover:border-accent-700 hover:text-accent-300',
        className,
      )}
    >
      <Plus />
      {children}
    </button>
  )
}

export function RemoveButton({ onClick, label = 'Remove' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-[22px] flex-none place-items-center rounded-md text-neutral-700 hover:text-text"
    >
      <X />
    </button>
  )
}

/** A thin progress track; `glow` adds the Nocturne accent glow. */
export function Bar({ pct, className, fill = 'bg-accent', glow }: { pct: number; className?: string; fill?: string; glow?: boolean }) {
  return (
    <div className={cx('overflow-hidden rounded-full bg-neutral-900', className)}>
      <div
        className={cx('h-full', fill)}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, boxShadow: glow ? '0 0 8px var(--color-accent)' : undefined }}
      />
    </div>
  )
}

/** Planned-vs-paid track: striped/tinted plan with the glowing paid part over it. */
export function PlanPaidBar({
  planPct,
  paidPct,
  over,
  striped,
  className,
}: {
  planPct: number
  paidPct: number
  over: boolean
  striped?: boolean
  className?: string
}) {
  const plan = over
    ? 'var(--color-neutral-300)'
    : striped
      ? 'repeating-linear-gradient(135deg,var(--color-accent-800) 0 4px,var(--color-accent-900) 4px 8px)'
      : 'var(--color-accent-800)'
  return (
    <div className={cx('relative overflow-hidden rounded-full bg-neutral-900', className)}>
      <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, planPct)}%`, background: plan }} />
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-accent"
        style={{ width: `${Math.min(100, paidPct)}%`, boxShadow: '0 0 10px var(--color-accent)' }}
      />
    </div>
  )
}

export function Avatar({ ini, className }: { ini: string; className?: string }) {
  return <span className={cx('grid flex-none place-items-center rounded-full text-[10px]', className)}>{ini}</span>
}

export function Seg<T extends string>({
  options,
  value,
  onPick,
  className,
}: {
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>
  value: T
  onPick: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('seg', className)} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} aria-pressed={o.value === value} onClick={() => onPick(o.value)} className="seg-opt">
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, onDec, onInc, label }: { value: number; onDec: () => void; onInc: () => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={onDec} aria-label={`Fewer ${label}`} className="btn btn-icon btn-secondary size-8">
        <Minus />
      </button>
      <span className="min-w-[72px] text-center text-sm">
        {value} {label}
      </span>
      <button type="button" onClick={onInc} aria-label={`More ${label}`} className="btn btn-icon btn-secondary size-8">
        <Plus />
      </button>
    </div>
  )
}
