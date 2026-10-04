import { useState } from 'react'
import { Plus, Wallet, X } from '@phosphor-icons/react'
import { nodeTotal } from '~/lib/budget'
import { CURRENCIES } from '~/lib/catalog'
import { NamedIcon } from '~/lib/icons'
import { cleanAmount, num } from '~/lib/money'
import { uid } from '~/lib/ids'
import { patchNode, useBoard } from '~/store/board'
import { PlanPaidBar, Seg } from '../ui'
import { SplitStepper, useCapMessage } from '../panel/SidePanel'
import { Modal } from './Modal'

const CAP_STEPS = [
  ['−500', -500],
  ['+100', 100],
  ['+500', 500],
  ['+1k', 1000],
] as const

export function BudgetDialog() {
  const { board, sum, m, msg, planPct, paidPct, over } = useCapMessage()
  const { change, set, log } = useBoard.getState()
  const close = () => set({ dialog: null })
  const sections = board.nodes.filter((n) => n.type === 'section')
  const [qa, setQa] = useState({ text: '', amt: '', node: '', payer: -1 })
  const qaNode = sections.some((s) => s.id === qa.node) ? qa.node : (sections[0]?.id ?? '')

  const addExpense = () => {
    if (!qaNode || !qa.text.trim()) return
    const item = { id: uid(), text: qa.text.trim(), cost: qa.amt, cur: '', paid: qa.payer >= 0, payer: Math.max(0, qa.payer), due: '' }
    patchNode<'section'>(qaNode, (x) => ({ ...x, items: [...x.items, item] }))
    log(`added expense ${item.text}`)
    setQa({ text: '', amt: '', node: qaNode, payer: -1 })
  }

  return (
    <Modal onClose={close} label="Budget" className="max-w-[560px] gap-[18px] p-5">
      <div className="flex items-center gap-2.5">
        <Wallet size={20} className="text-accent" />
        <span className="text-lg font-medium">Budget</span>
        <span className="text-xs text-neutral-500 max-md:hidden">Everyone with edit access can change this</span>
        <button type="button" aria-label="Close" onClick={close} className="btn btn-icon ml-auto text-neutral-400">
          <X />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-xs text-neutral-400">Total budget</span>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 rounded-[10px] bg-bg px-3 py-2 text-[26px] font-medium shadow-[inset_0_0_0_1px_var(--color-accent-700)]">
            <span className="text-neutral-500">{board.cur}</span>
            <input
              value={board.cap}
              onChange={(e) => change((b) => ({ ...b, cap: cleanAmount(e.target.value) }), 'typing')}
              onFocus={() => useBoard.getState().beginEdit()}
              onBlur={() => useBoard.getState().endEdit()}
              placeholder="0"
              inputMode="decimal"
              aria-label="Total budget"
              className="field w-[140px]"
            />
          </label>
          <div className="flex gap-1.5">
            {CAP_STEPS.map(([label, d]) => (
              <button
                key={label}
                type="button"
                onClick={() => change((b) => ({ ...b, cap: String(Math.max(0, num(b.cap) + d)) }))}
                className="btn btn-secondary px-[9px] py-[5px] text-xs"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <PlanPaidBar className="h-2" planPct={planPct} paidPct={paidPct} over={over} striped />
        <span className="text-xs text-neutral-400">{msg}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-400">Currency</span>
          <Seg
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={board.cur as (typeof CURRENCIES)[number]}
            onPick={(cur) => change((b) => ({ ...b, cur }))}
            className="[&_.seg-opt]:px-3 [&_.seg-opt]:py-1.5 [&_.seg-opt]:text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-400">Group size</span>
          <SplitStepper />
        </div>
        <div className="ml-auto flex flex-col gap-0.5">
          <span className="text-xs text-neutral-400">Per person</span>
          <span className="text-xl font-medium text-accent-200">{m(sum.perPerson)}</span>
        </div>
      </div>

      {sections.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="pb-1 text-xs text-neutral-400">
            Budget per card <span className="text-neutral-600">— optional</span>
          </span>
          {sections.map((n) => (
            <div key={n.id} className="flex min-h-[38px] items-center gap-2 text-[13px]">
              <NamedIcon name={n.icon} className="text-accent" />
              <span className="min-w-0 flex-1 truncate">{n.title || 'Untitled'}</span>
              <span className="text-neutral-400">{m(nodeTotal(n))}</span>
              <span className="text-neutral-600">of</span>
              <label className="flex items-center gap-1 rounded-lg bg-bg px-2 py-1 shadow-inset">
                <span className="text-neutral-500">{board.cur}</span>
                <input
                  value={n.budget}
                  onChange={(e) => patchNode<'section'>(n.id, (x) => ({ ...x, budget: cleanAmount(e.target.value) }), 'typing')}
                  onFocus={() => useBoard.getState().beginEdit()}
                  onBlur={() => useBoard.getState().endEdit()}
                  placeholder="—"
                  inputMode="decimal"
                  aria-label={`Budget for ${n.title}`}
                  className="field w-[60px] text-right text-[13px]"
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {sections.length > 0 && (
        <form
          className="flex flex-col gap-2.5 rounded-xl bg-bg p-3.5"
          onSubmit={(e) => {
            e.preventDefault()
            addExpense()
          }}
        >
          <span className="text-[13px] font-medium">Add an expense</span>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
            <input className="input" value={qa.text} onChange={(e) => setQa({ ...qa, text: e.target.value })} placeholder="What was it?" aria-label="Expense" />
            <label className="flex min-h-9 items-center gap-1 rounded-lg border border-divider bg-surface px-2.5">
              <span className="text-neutral-500">{board.cur}</span>
              <input
                value={qa.amt}
                onChange={(e) => setQa({ ...qa, amt: cleanAmount(e.target.value) })}
                placeholder="0"
                inputMode="decimal"
                aria-label="Amount"
                className="field flex-1 text-sm"
              />
            </label>
            <select className="input" value={qaNode} onChange={(e) => setQa({ ...qa, node: e.target.value })} aria-label="Cost card">
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || 'Untitled'}
                </option>
              ))}
            </select>
            <select className="input" value={qa.payer} onChange={(e) => setQa({ ...qa, payer: Number(e.target.value) })} aria-label="Paid by">
              <option value={-1}>Not paid yet</option>
              {board.people.slice(0, board.splitN).map((p, i) => (
                <option key={i} value={i}>
                  Paid by {p.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary self-start">
            <Plus />
            Add expense
          </button>
        </form>
      )}
    </Modal>
  )
}
