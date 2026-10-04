import type { Icon } from '@phosphor-icons/react'
import { CalendarDots, Coins, Rows, SquaresFour } from '@phosphor-icons/react'
import type { ViewMode } from '~/store/board'
import { useBoard } from '~/store/board'
import { cx } from '../ui'

export const VIEWS: ReadonlyArray<{ mode: ViewMode; icon: Icon; label: string }> = [
  { mode: 'board', icon: SquaresFour, label: 'Board' },
  { mode: 'list', icon: Rows, label: 'Cards' },
  { mode: 'costs', icon: Coins, label: 'Costs' },
  { mode: 'timeline', icon: CalendarDots, label: 'Timeline' },
]

/** Board / Cards / Costs / Timeline: the same board seen four ways (keys 1–4). */
export function ViewSwitcher({ labels, className }: { labels: boolean; className?: string }) {
  const mode = useBoard((s) => s.mode)
  const setMode = useBoard((s) => s.setMode)
  return (
    <div role="tablist" aria-label="View" className={cx('glass-sm pointer-events-auto relative flex rounded-xl p-[3px]', className)}>
      {VIEWS.map(({ mode: m, icon: I, label }, i) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          title={`${label} (${i + 1})`}
          onClick={() => setMode(m)}
          className={cx(
            'relative flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2.5 text-[13px] transition-colors duration-200',
            mode === m ? 'bg-accent-900 text-accent-200 shadow-[inset_0_0_0_1px_var(--color-accent-700)]' : 'text-neutral-400 hover:text-text',
          )}
        >
          <I size={17} weight={mode === m ? 'fill' : 'regular'} />
          {labels && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}
