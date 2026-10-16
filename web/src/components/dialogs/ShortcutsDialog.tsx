import { X } from '@phosphor-icons/react'
import { useBoard } from '~/store/board'
import { Modal } from './Modal'

const GROUPS: ReadonlyArray<{ title: string; keys: ReadonlyArray<[string, string]> }> = [
  {
    title: 'Tools',
    keys: [
      ['S', 'Select'],
      ['P', 'Pan (also H)'],
      ['D', 'Draw'],
      ['E', 'Erase drawings'],
      ['C', 'Connect cards'],
      ['Space + drag', 'Pan with any tool'],
      ['Middle button drag', 'Pan'],
    ],
  },
  {
    title: 'Cards',
    keys: [
      ['Drag on the board', 'Select several cards'],
      ['Shift + click', 'Add to the selection'],
      ['Ctrl A', 'Select all'],
      ['Ctrl C / X / V', 'Copy, cut, paste'],
      ['Ctrl D', 'Duplicate'],
      ['Arrows', 'Nudge (Shift: further)'],
      ['Delete', 'Delete'],
      ['N', 'New idea'],
    ],
  },
  {
    title: 'Board',
    keys: [
      ['1 2 3 4', 'Board, cards, costs, timeline'],
      ['Ctrl Z / Shift Ctrl Z', 'Undo, redo'],
      ['Ctrl + wheel', 'Zoom'],
      ['F', 'Fit to screen'],
      ['Ctrl K', 'Find a board'],
      ['Ctrl E', 'Export (PDF, CSV, calendar)'],
      ['Esc', 'Close or deselect'],
    ],
  },
]

export function ShortcutsDialog() {
  const close = () => useBoard.getState().set({ dialog: null })
  return (
    <Modal onClose={close} label="Keyboard shortcuts" className="max-w-[760px] gap-4 p-[22px]">
      <div className="flex items-center">
        <span className="text-lg font-medium">Keyboard shortcuts</span>
        <button type="button" aria-label="Close" onClick={close} className="btn btn-icon ml-auto text-neutral-400">
          <X />
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            <span className="kicker">{g.title}</span>
            {g.keys.map(([k, what]) => (
              <div key={k} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-neutral-300">{what}</span>
                <kbd className="rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-accent-200 shadow-inset">{k}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
      <span className="text-xs text-neutral-500">On a Mac, use ⌘ for Ctrl. Paste a link, an email or an image onto the board to make a card from it.</span>
    </Modal>
  )
}
