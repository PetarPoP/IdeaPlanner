import { useLayoutEffect, useRef, useState } from 'react'
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
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const vw = useBoard((s) => s.vw)

  // The highlight slides to the picked view.
  useLayoutEffect(() => {
    const el = tabs.current[VIEWS.findIndex((v) => v.mode === mode)]
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [mode, labels, vw])

  return (
    <div role="tablist" aria-label="View" className={cx('glass-sm pointer-events-auto relative flex rounded-xl p-[3px]', className)}>
      {pill && (
        <span
          aria-hidden
          className="absolute top-[3px] bottom-[3px] rounded-[9px] bg-accent-900 shadow-[inset_0_0_0_1px_var(--color-accent-700)] transition-[left,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {VIEWS.map(({ mode: m, icon: I, label }, i) => (
        <button
          ref={(el) => {
            tabs.current[i] = el
          }}
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          title={`${label} (${i + 1})`}
          onClick={() => setMode(m)}
          className={cx(
            'relative flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2.5 text-[13px] transition-colors duration-200',
            mode === m ? cx('text-accent-200', !pill && 'bg-accent-900 shadow-[inset_0_0_0_1px_var(--color-accent-700)]') : 'text-neutral-400 hover:text-text',
          )}
        >
          <I key={mode === m ? 'on' : 'off'} size={17} weight={mode === m ? 'fill' : 'regular'} className={mode === m ? 'anim-check' : undefined} />
          {labels && <span>{label}</span>}
        </button>
      ))}
    </div>
  )
}
