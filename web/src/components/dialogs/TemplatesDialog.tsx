import { X } from '@phosphor-icons/react'
import { NamedIcon } from '~/lib/icons'
import { TEMPLATES } from '~/lib/templates'
import { useBoard } from '~/store/board'
import { Modal } from './Modal'

export function TemplatesDialog() {
  const { set, applyTemplate } = useBoard.getState()
  const close = () => set({ dialog: null })

  return (
    <Modal onClose={close} label="Templates" className="max-w-[820px] gap-4 p-[22px]">
      <div className="flex items-start gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] tracking-[.1em] text-accent uppercase">New board</span>
          <span className="text-[22px] font-medium">What are you planning?</span>
          <span className="text-[13px] text-neutral-400">Replaces this board — Undo brings it back.</span>
        </div>
        <button type="button" aria-label="Close" onClick={close} className="btn btn-icon ml-auto text-neutral-400">
          <X />
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => applyTemplate(t.key, t.name)}
            className="flex flex-col gap-2.5 rounded-xl bg-bg p-4 text-left shadow-sm hover:shadow-[0_0_0_1px_var(--color-accent),0_0_24px_color-mix(in_srgb,var(--color-accent)_20%,transparent)]"
          >
            <span className="flex items-center gap-2.5">
              <span className="grid size-[38px] place-items-center rounded-[10px] bg-accent-900 text-xl text-accent-300">
                <NamedIcon name={t.icon} />
              </span>
              <span className="text-[15px] font-medium">{t.name}</span>
            </span>
            <span className="text-xs leading-[1.45] text-neutral-400">{t.desc}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
