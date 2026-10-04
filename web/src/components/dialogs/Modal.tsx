import type { ReactNode } from 'react'
import { cx } from '../ui'

export function Modal({ onClose, label, className, children }: { onClose: () => void; label: string; className?: string; children: ReactNode }) {
  return (
    <div
      onPointerDown={onClose}
      className="anim-fade absolute inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--color-neutral-900)_60%,transparent)] p-3"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onPointerDown={(e) => e.stopPropagation()}
        className={cx('anim-modal flex max-h-[calc(100%-24px)] w-full flex-col overflow-auto rounded-[14px] bg-surface shadow-lg', className)}
      >
        {children}
      </div>
    </div>
  )
}
