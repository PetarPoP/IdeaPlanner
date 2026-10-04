import { useState } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { ArrowRight, Check, CheckCircle, CheckSquare, ClockCounterClockwise, Copy, Link as LinkIcon, PencilSimple, Square, Users, Wallet, X } from '@phosphor-icons/react'
import { QRCodeSVG } from 'qrcode.react'
import type { Role, Task } from '~/lib/model.gen'
import { nodeTotal, summarize } from '~/lib/budget'
import { ME, initials } from '~/lib/catalog'
import { timeAgo } from '~/lib/dates'
import { NamedIcon } from '~/lib/icons'
import { money, num } from '~/lib/money'
import { shareUrl } from '~/lib/storage'
import type { Panel } from '~/store/board'
import { isMobileWidth, patchRow, useBoard } from '~/store/board'
import { Bar, PlanPaidBar, Seg, Stepper, cx } from '../ui'

const TABS: ReadonlyArray<{ key: Panel; icon: Icon; label: string }> = [
  { key: 'budget', icon: Wallet, label: 'Budget' },
  { key: 'tasks', icon: CheckCircle, label: 'Tasks' },
  { key: 'people', icon: Users, label: 'People' },
  { key: 'activity', icon: ClockCounterClockwise, label: 'Activity' },
]

export function SidePanel() {
  const panel = useBoard((s) => s.panel)
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const set = useBoard((s) => s.set)
  if (!panel) return null

  return (
    <aside
      className={cx(
        'absolute z-50 flex flex-col',
        mobile
          ? 'inset-x-0 bottom-0 h-[72%] rounded-t-[18px] bg-surface shadow-lg'
          : 'top-[70px] right-3 bottom-3 z-[44] w-[380px] rounded-[14px] bg-[color-mix(in_srgb,var(--color-surface)_96%,transparent)] shadow-md backdrop-blur-md',
      )}
    >
      {mobile && <div className="mt-2 h-1 w-10 self-center rounded-full bg-neutral-700" />}
      <div className="flex items-center gap-0.5 px-2.5 pt-2.5 shadow-[inset_0_-1px_0_#3f424d]" role="tablist">
        {TABS.map(({ key, icon: I, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={panel === key}
            title={label}
            onClick={() => set({ panel: key })}
            className={cx(
              'flex items-center gap-1.5',
              mobile ? 'px-3.5 pt-2 pb-2.5 text-lg' : 'px-2.5 pt-2 pb-2.5 text-[13px]',
              panel === key ? 'text-text shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-neutral-500',
            )}
          >
            <I />
            {!mobile && label}
          </button>
        ))}
        <button type="button" aria-label="Close panel" onClick={() => set({ panel: null })} className="btn btn-icon ml-auto size-8 text-neutral-400">
          <X />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-[18px] overflow-auto p-4">
        {panel === 'budget' && <BudgetTab />}
        {panel === 'tasks' && <TasksTab />}
        {panel === 'people' && <PeopleTab />}
        {panel === 'activity' && <ActivityTab />}
      </div>
    </aside>
  )
}

export function useCapMessage() {
  const board = useBoard((s) => s.board!)
  const sum = summarize(board)
  const m = (v: number) => money(board.cur, v)
  const msg = !sum.cap
    ? 'Set a total budget to track headroom.'
    : sum.total > sum.cap
      ? `Planned costs are ${m(sum.total - sum.cap)} over budget.`
      : `${m(sum.cap - sum.total)} headroom · ${Math.round((sum.paid / sum.cap) * 100)}% of budget paid.`
  const pct = (v: number) => (sum.cap ? (v / sum.cap) * 100 : 0)
  return { board, sum, m, msg, planPct: pct(sum.total), paidPct: pct(sum.paid), over: sum.cap > 0 && sum.total > sum.cap }
}

export function SplitStepper() {
  const splitN = useBoard((s) => s.board!.splitN)
  const max = useBoard((s) => s.board!.people.length)
  const setN = (n: number) => useBoard.getState().change((b) => ({ ...b, splitN: n }))
  return <Stepper value={splitN} label="people" onDec={() => setN(Math.max(1, splitN - 1))} onInc={() => setN(Math.min(max, splitN + 1))} />
}

function BudgetTab() {
  const { board, sum, m, msg, planPct, paidPct, over } = useCapMessage()
  const set = useBoard((s) => s.set)
  const maxTotal = Math.max(1, ...sum.costed.map(nodeTotal))

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Planned" value={m(sum.total)} sub={`${sum.costed.length} cards with costs`} />
        <Stat label="Paid" value={m(sum.paid)} sub={`${m(Math.max(0, sum.total - sum.paid))} to pay`} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>Budget {sum.cap ? m(sum.cap) : 'not set'}</span>
          <button type="button" onClick={() => set({ dialog: 'budget' })} className="btn btn-ghost text-xs">
            <PencilSimple />
            Edit budget
          </button>
        </div>
        <PlanPaidBar className="h-2" planPct={planPct} paidPct={paidPct} over={over} striped />
        <div className="text-xs text-neutral-400">{msg}</div>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="kicker pb-1.5">By card · tap to jump</div>
        {sum.costed.map((n) => {
          const t = nodeTotal(n)
          const bud = n.type === 'section' ? num(n.budget) : 0
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => useBoard.getState().focusNode(n.id)}
              className="flex flex-col gap-[5px] rounded-lg p-2 text-left hover:bg-neutral-900"
            >
              <span className="flex w-full items-center gap-2 text-[13px]">
                <NamedIcon name={n.icon} className="text-accent" />
                {n.title || 'Untitled'}
                <span className="ml-auto font-medium">{m(t)}</span>
                <span className="min-w-14 text-right text-[11px] text-neutral-500">{bud ? `of ${m(bud)}` : ''}</span>
              </span>
              <Bar className="h-[3px] w-full" pct={(t / (bud || maxTotal)) * 100} fill={bud && t > bud ? 'bg-neutral-300' : 'bg-accent'} />
            </button>
          )
        })}
      </div>
      <div
        className="flex flex-col gap-3 rounded-xl p-3.5"
        style={{ background: 'linear-gradient(135deg,var(--color-accent-900),var(--color-bg))', boxShadow: 'inset 0 0 0 1px var(--color-accent-800)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium">Split between</span>
          <div className="ml-auto">
            <SplitStepper />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[32px] font-medium tracking-[-0.03em] text-accent-100">{m(sum.perPerson)}</span>
          <span className="text-[13px] text-accent-300">
            per person · {m(sum.total)} ÷ {board.splitN}
          </span>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="kicker grid grid-cols-[1fr_70px_76px] pb-1.5">
          <span>Paid so far</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Balance</span>
        </div>
        {sum.balances.map((bal, i) => {
          const p = board.people[i]
          if (!p) return null
          return (
            <div key={i} className="rule-fade grid grid-cols-[1fr_70px_76px] items-center py-[7px] text-[13px]">
              <span className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-neutral-800 text-[10px]">{p.ini}</span>
                {p.name}
              </span>
              <span className="text-right text-neutral-400">{m(sum.paidBy[i] ?? 0)}</span>
              <span className={cx('text-right font-medium', bal >= 0 ? 'text-accent-300' : 'text-neutral-300')}>
                {bal >= 0 ? '+' : '−'}
                {m(Math.abs(bal))}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="kicker">Settle up</div>
        {sum.transfers.map((t, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-bg px-2.5 py-2 text-[13px]">
            {board.people[t.from]?.name}
            <ArrowRight className="text-neutral-600" />
            {board.people[t.to]?.name}
            <span className="ml-auto font-medium text-accent-200">{m(t.amount)}</span>
          </div>
        ))}
        {!sum.transfers.length && <span className="text-xs text-neutral-500">Everyone is square.</span>}
      </div>
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-bg p-3">
      <span className="kicker">{label}</span>
      <span className="text-[22px] font-medium">{value}</span>
      <span className="text-[11px] text-neutral-500">{sub}</span>
    </div>
  )
}

function TasksTab() {
  const nodes = useBoard((s) => s.board!.nodes)
  const people = useBoard((s) => s.board!.people)
  const tasks = nodes.flatMap((n) => (n.type === 'checklist' ? n.items.map((t) => ({ node: n, t })) : []))
  const done = tasks.filter((x) => x.t.done).length

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[13px]">
          <span>All tasks</span>
          <span className="text-neutral-400">
            {done} of {tasks.length} done
          </span>
        </div>
        <Bar className="h-1.5" pct={tasks.length ? (done / tasks.length) * 100 : 0} glow />
      </div>
      <div className="flex flex-col gap-0.5">
        {tasks.map(({ node, t }) => (
          <div key={t.id} className="flex min-h-10 items-center gap-2.5 px-1">
            <button type="button" aria-pressed={t.done} onClick={() => patchRow<Task>(node.id, 'items', t.id, { done: !t.done })} className="grid place-items-center text-[19px] text-accent">
              {t.done ? <CheckSquare weight="fill" /> : <Square />}
            </button>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className={cx('text-[13px]', t.done && 'text-neutral-500 line-through')}>{t.text || 'Untitled task'}</span>
              <span className="text-[11px] text-neutral-500">{node.title}</span>
            </div>
            <span className="grid size-[26px] flex-none place-items-center rounded-full bg-neutral-800 text-[10px] text-neutral-200">
              {t.who != null ? people[t.who]?.ini : '—'}
            </span>
          </div>
        ))}
        {!tasks.length && <span className="text-xs text-neutral-500">Add a checklist card to track tasks.</span>}
      </div>
    </>
  )
}

const ROLES: ReadonlyArray<{ value: Role; label: string }> = [
  { value: 'View', label: 'View' },
  { value: 'Edit', label: 'Edit' },
  { value: 'Admin', label: 'Admin' },
]

function PeopleTab() {
  const id = useBoard((s) => s.board!.id)
  const people = useBoard((s) => s.board!.people)
  const splitN = useBoard((s) => s.board!.splitN)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const link = shareUrl(id)

  const invite = () => {
    const full = name.trim()
    if (!full) return
    const short = full.split(/\s+/)[0]!
    useBoard.getState().change((b) => ({ ...b, people: [...b.people, { name: short, full, ini: initials(full), role: 'Edit' }] }))
    useBoard.getState().log(`invited ${short}`)
    setName('')
  }
  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked; the link stays visible to copy by hand.
    }
  }
  const setRole = (i: number, role: Role) =>
    useBoard.getState().change((b) => ({ ...b, people: b.people.map((p, j) => (j === i ? { ...p, role } : p)) }))

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium">Invite to this plan</div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            invite()
          }}
        >
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name to invite" />
          <button type="submit" className="btn btn-primary flex-none">
            Invite
          </button>
        </form>
        {link ? (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-bg py-1.5 pr-1.5 pl-2.5 shadow-inset">
              <LinkIcon className="text-neutral-500" />
              <span className="flex-1 truncate font-mono text-xs text-neutral-300">{link.replace(/^https?:\/\//, '')}</span>
              <button type="button" onClick={copy} className="btn btn-secondary px-2.5 py-1 text-xs">
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] bg-bg p-2.5">
              <div className="size-[72px] flex-none rounded-lg bg-neutral-100 p-1.5">
                <QRCodeSVG value={link} size={60} bgColor="#f3f5fe" fgColor="#292b31" className="size-full" />
              </div>
              <span className="text-xs text-neutral-400">Friends scan this to join. Anyone with the link can edit — change roles below.</span>
            </div>
          </>
        ) : (
          <span className="text-xs text-neutral-500">Sharing links need the web version of Idea Planner.</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="kicker pb-1.5">People</div>
        {people.map((p, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1.5">
            <span
              className={cx(
                'grid size-8 flex-none place-items-center rounded-full text-[11px] font-medium',
                i === ME ? 'bg-accent-700 text-accent-100' : i < splitN ? 'bg-neutral-700 text-neutral-100' : 'bg-neutral-800 text-neutral-300 opacity-80',
              )}
              style={i === ME ? { boxShadow: '0 0 0 2px var(--color-surface),0 0 0 3.5px var(--color-accent)' } : undefined}
            >
              {p.ini}
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-snug">
              <span className="text-[13px]">
                {p.full}
                {i === ME && ' (you)'}
              </span>
              <span className="text-[11px] text-neutral-500">{i === ME ? 'You · owner' : i < splitN ? 'In the split' : 'Not in the split'}</span>
            </div>
            <Seg options={ROLES} value={p.role} onPick={(r) => setRole(i, r)} className="[&_.seg-opt]:px-2 [&_.seg-opt]:py-1 [&_.seg-opt]:text-[11px]" />
          </div>
        ))}
      </div>
    </>
  )
}

function ActivityTab() {
  const activity = useBoard((s) => s.board!.activity)
  const people = useBoard((s) => s.board!.people)
  const ini = (who: string) => (who === 'You' ? people[ME]?.ini : people.find((p) => p.name === who)?.ini) ?? '?'

  return (
    <div className="flex flex-col gap-0.5">
      {activity.map((a, i) => (
        <div key={i} className="flex gap-2.5 py-2 text-[13px] leading-snug">
          <span className="grid size-[26px] flex-none place-items-center rounded-full bg-neutral-800 text-[10px]">{ini(a.who)}</span>
          <div className="flex flex-col">
            <span>
              <span className="font-medium">{a.who}</span> <span className="text-neutral-300">{a.msg}</span>
            </span>
            <span className="text-[11px] text-neutral-500">{timeAgo(a.t)}</span>
          </div>
        </div>
      ))}
      {!activity.length && <span className="text-xs text-neutral-500">Changes to this board show up here.</span>}
    </div>
  )
}
