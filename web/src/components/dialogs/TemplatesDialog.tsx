import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { useOpenBoard } from '~/hooks/useBoards'
import { NamedIcon } from '~/lib/icons'
import type { TemplateKey } from '~/lib/templates'
import { TEMPLATES } from '~/lib/templates'
import { useBoard } from '~/store/board'
import { Seg } from '../ui'
import { Modal } from './Modal'

/** Pick a template for a new board, or to restart this one. */
export function TemplatesDialog({ initial }: { initial: 'new' | 'replace' }) {
  const { set, applyTemplate } = useBoard.getState()
  const { create } = useOpenBoard()
  const [mode, setMode] = useState(initial)
  const [busy, setBusy] = useState(false)
  const close = () => set({ dialog: null })

  const pick = async (key: TemplateKey, name: string) => {
    if (mode === 'replace') return applyTemplate(key, name)
    setBusy(true)
    await create(key)
    set({ dialog: null })
  }

  return (
    <Modal onClose={close} label="Templates" className="max-w-[820px] gap-4 p-[22px]">
      <div className="flex flex-wrap items-start gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] tracking-[.1em] text-accent uppercase">{mode === 'new' ? 'New board' : 'Templates'}</span>
          <span className="text-[22px] font-medium">What are you planning?</span>
          <span className="text-[13px] text-neutral-400">
            {mode === 'new' ? 'Starts a separate board; this one stays in your boards.' : 'Replaces this board. Undo brings it back.'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Seg
            value={mode}
            onPick={setMode}
            options={[
              { value: 'new', label: 'New board' },
              { value: 'replace', label: 'Replace this one' },
            ]}
          />
          <button type="button" aria-label="Close" onClick={close} className="btn btn-icon text-neutral-400">
            <X />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
        {TEMPLATES.map((t, i) => (
          <button
            key={t.key}
            type="button"
            disabled={busy}
            onClick={() => void pick(t.key, t.name)}
            style={{ animationDelay: `${i * 30}ms` }}
            className="anim-card flex flex-col gap-2.5 rounded-xl bg-bg p-4 text-left shadow-sm transition-shadow hover:shadow-[0_0_0_1px_var(--color-accent),0_0_24px_color-mix(in_srgb,var(--color-accent)_20%,transparent)] disabled:opacity-60"
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
