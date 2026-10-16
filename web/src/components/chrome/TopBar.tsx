import { useRef, useState } from 'react'
import { CalendarBlank, CheckCircle, ClockCounterClockwise, Lightbulb, List, MapPin, ShareNetwork, Wallet, X } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { summarize } from '~/lib/budget'
import { countdown, daysBetween, rangeLabel } from '~/lib/dates'
import { BOARD_ICONS, NamedIcon } from '~/lib/icons'
import { money } from '~/lib/money'
import { isMobileWidth, useBoard } from '~/store/board'
import { DateField, Field, PlanPaidBar, cx } from '../ui'
import { Popover } from './Popover'
import { SyncBadge } from './SyncBadge'
import { LiveAvatars } from './LiveAvatars'
import { ViewSwitcher } from './ViewSwitcher'

export function TopBar() {
  const { title, icon } = useBoard(useShallow((s) => ({ title: s.board!.title, icon: s.board!.icon })))
  const mobile = useBoard((s) => isMobileWidth(s.vw))
  const wide = useBoard((s) => s.vw >= 1180)
  const xwide = useBoard((s) => s.vw >= 1560)
  const panel = useBoard((s) => s.panel)
  const dialog = useBoard((s) => s.dialog)
  const sidebar = useBoard((s) => s.sidebar)
  const { set, togglePanel, toggleDialog } = useBoard.getState()

  return (
    <>
      <div className="pointer-events-none absolute inset-x-2 top-2 z-40 flex items-center gap-2 md:inset-x-3 md:top-3">
        <div className="glass-sm pointer-events-auto flex max-w-max min-w-0 flex-auto items-center gap-1.5 rounded-xl py-1.5 pr-2 pl-1.5">
          <button
            type="button"
            title="Your boards (Ctrl+K)"
            aria-pressed={sidebar}
            onClick={() => set({ sidebar: !sidebar })}
            className={cx(
              'grid size-[34px] flex-none place-items-center rounded-lg border border-accent text-accent transition-[background,box-shadow] duration-200',
              sidebar ? 'bg-accent-900 shadow-glow' : 'shadow-glow hover:bg-accent-900',
            )}
          >
            <Lightbulb size={18} weight={sidebar ? 'fill' : 'regular'} />
          </button>
          {wide && <IconPicker icon={icon} />}
          <Field
            value={title}
            onValue={(v, m) => useBoard.getState().change((b) => ({ ...b, title: v }), m)}
            aria-label="Board title"
            className="w-[110px] min-w-[70px] flex-[1_1_110px] text-[15px] font-medium text-ellipsis md:w-[180px] md:min-w-[90px] md:flex-[1_1_180px]"
          />
          <DateChip compact={!wide} />
          <SyncBadge label={xwide} />
        </div>
        {!mobile && (
          <div className="flex flex-1 justify-center">
            <ViewSwitcher labels={wide} />
          </div>
        )}
        {mobile && <div className="flex-1" />}
        <LiveAvatars />
        <BudgetSummaryButton wide={wide} />
        <button
          type="button"
          title="Set budget"
          aria-pressed={dialog === 'budget'}
          onClick={() => toggleDialog('budget')}
          className="pointer-events-auto flex h-[46px] flex-none items-center gap-1.5 rounded-xl border border-accent bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] px-3.5 text-sm font-medium text-accent transition-colors hover:bg-accent-900 aria-pressed:bg-accent-900"
        >
          <Wallet size={18} />
          {xwide && <span>Budget</span>}
        </button>
        {!mobile && (
          <div className="glass-sm pointer-events-auto flex items-center gap-1 rounded-xl p-[5px]">
            <PeopleStack on={panel === 'people'} onClick={() => togglePanel('people')} />
            <PanelButton title="Tasks" on={panel === 'tasks'} onClick={() => togglePanel('tasks')}>
              <CheckCircle size={18} />
            </PanelButton>
            <PanelButton title="Activity" on={panel === 'activity'} onClick={() => togglePanel('activity')}>
              <ClockCounterClockwise size={18} />
            </PanelButton>
          </div>
        )}
        {mobile && (
          <button
            type="button"
            title="Panels"
            aria-pressed={panel != null}
            onClick={() => set({ panel: panel ? null : 'tasks' })}
            className="glass-sm pointer-events-auto grid size-[46px] flex-none place-items-center rounded-xl aria-pressed:text-accent"
          >
            {panel ? <X size={20} /> : <List size={20} />}
          </button>
        )}
        <button
          type="button"
          aria-pressed={panel === 'people'}
          onClick={() => togglePanel('people')}
          className="btn btn-primary pointer-events-auto h-[46px] flex-none rounded-xl bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] aria-pressed:bg-accent-900"
        >
          <ShareNetwork size={18} />
          {xwide && <span>Share</span>}
        </button>
      </div>
      {mobile && <ViewSwitcher labels={false} className="absolute inset-x-2 top-[62px] z-40" />}
    </>
  )
}

function PanelButton({ title, on, onClick, children }: { title: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={cx('btn btn-icon transition-colors', on ? 'bg-accent-900 text-accent-200' : 'text-neutral-300')}
    >
      {children}
    </button>
  )
}

function IconPicker({ icon }: { icon: string }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative flex-none">
      <button
        ref={anchor}
        type="button"
        title="Board icon"
        aria-pressed={open}
        onClick={() => setOpen(!open)}
        className="grid size-8 place-items-center rounded-lg text-lg text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-text"
      >
        <NamedIcon name={icon} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} className="top-10 left-0 grid w-[236px] grid-cols-7 gap-1 p-2">
        {BOARD_ICONS.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={name === icon}
            onClick={() => {
              useBoard.getState().change((b) => ({ ...b, icon: name }))
              setOpen(false)
            }}
            className="grid size-[28px] place-items-center rounded-md text-lg text-neutral-300 hover:bg-neutral-900 aria-pressed:bg-accent-900 aria-pressed:text-accent-200"
          >
            <NamedIcon name={name} />
          </button>
        ))}
      </Popover>
    </div>
  )
}

/** The board's dates and place; opens a picker where the dates can be typed or picked. */
function DateChip({ compact }: { compact: boolean }) {
  const { date, endDate, place } = useBoard(useShallow((s) => ({ date: s.board!.date, endDate: s.board!.endDate, place: s.board!.place })))
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const change = useBoard.getState().change
  const range = rangeLabel(date, endDate)
  const until = countdown(date, endDate)
  const nights = daysBetween(date, endDate)

  return (
    <div className="relative flex-none">
      <button
        ref={anchor}
        type="button"
        title={range ? `${range}${until ? ` · ${until}` : ''}` : 'Add dates'}
        aria-pressed={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs whitespace-nowrap transition-colors',
          range ? 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700' : 'border border-dashed border-neutral-700 text-neutral-400 hover:text-text',
          open && 'shadow-[0_0_0_1px_var(--color-accent)]',
        )}
      >
        <CalendarBlank className="text-accent-300" />
        {compact ? '' : range || 'Add dates'}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} className="top-10 left-0 flex w-[280px] flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="kicker">Starts</span>
            <DateField
              value={date}
              onValue={(v) => change((b) => ({ ...b, date: v, endDate: b.endDate && v && b.endDate < v ? '' : b.endDate }))}
              aria-label="Start date"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="kicker">Ends</span>
            <DateField value={endDate} min={date || undefined} onValue={(v) => change((b) => ({ ...b, endDate: v }))} aria-label="End date" />
          </label>
        </div>
        <span className="text-xs text-neutral-400">
          {range ? `${range}${nights && nights > 0 ? ` · ${nights + 1} days` : ''}${until ? ` · ${until}` : ''}` : 'Pick when it happens, or type a date.'}
        </span>
        <label className="flex items-center gap-2 rounded-lg bg-bg px-2.5 py-1.5 shadow-inset">
          <MapPin className="text-accent-300" />
          <Field
            value={place}
            onValue={(v, m) => change((b) => ({ ...b, place: v }), m)}
            placeholder="Where? (Lisbon → Algarve)"
            aria-label="Place"
            className="flex-1 text-[13px]"
          />
        </label>
        {range && (
          <button type="button" onClick={() => change((b) => ({ ...b, date: '', endDate: '' }))} className="btn btn-ghost self-start text-xs">
            Clear dates
          </button>
        )}
      </Popover>
    </div>
  )
}

function BudgetSummaryButton({ wide }: { wide: boolean }) {
  const board = useBoard((s) => s.board!)
  const on = useBoard((s) => s.panel === 'budget')
  const sum = summarize(board)
  const m = (v: number) => money(board.cur, v)
  const pct = (v: number) => (sum.cap ? (v / sum.cap) * 100 : 0)

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => useBoard.getState().togglePanel('budget')}
      className={cx(
        'glass-sm pointer-events-auto flex flex-none items-center gap-3.5 rounded-xl px-3 py-1.5 transition-shadow hover:shadow-md md:px-3.5',
        on && 'shadow-[0_0_0_1px_var(--color-accent)]',
      )}
    >
      {wide && (
        <div className="flex flex-col items-start leading-[1.15]">
          <span className="text-[9.5px] tracking-[.08em] text-neutral-500 uppercase">Planned</span>
          <span className="text-[15px] font-medium">{m(sum.total)}</span>
        </div>
      )}
      {wide && (
        <div className="flex w-[110px] flex-col gap-1">
          <PlanPaidBar className="h-[5px]" planPct={pct(sum.total)} paidPct={pct(sum.paid)} over={sum.cap > 0 && sum.total > sum.cap} striped />
          <span className="text-left text-[10px] text-neutral-500">
            {sum.cap ? (sum.total > sum.cap ? `${m(sum.total - sum.cap)} over` : `${m(sum.cap - sum.total)} left of ${m(sum.cap)}`) : 'No budget set'}
          </span>
        </div>
      )}
      <div className="flex flex-col items-start leading-[1.15]">
        <span className="text-[9.5px] tracking-[.08em] text-accent uppercase">Per person</span>
        <span className="text-[15px] font-medium text-accent-200">{m(sum.perPerson)}</span>
      </div>
    </button>
  )
}

function PeopleStack({ on, onClick }: { on: boolean; onClick: () => void }) {
  const people = useBoard((s) => s.board!.people)
  const shown = people.slice(0, 2)
  const rest = people.length - shown.length
  return (
    <button
      type="button"
      title="People"
      aria-pressed={on}
      onClick={onClick}
      className={cx('flex items-center rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-neutral-900', on && 'bg-accent-900')}
    >
      {shown.map((p, i) => (
        <span
          key={i}
          className={cx(
            'grid size-7 place-items-center rounded-full text-[10px] font-medium',
            i === 0 ? 'bg-accent-700 text-accent-100' : '-ml-1.5 bg-neutral-700',
          )}
          style={{ boxShadow: i === 0 ? '0 0 0 2px var(--color-surface),0 0 0 3.5px var(--color-accent)' : '0 0 0 2px var(--color-surface)' }}
        >
          {p.ini}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="-ml-1.5 grid size-7 place-items-center rounded-full bg-neutral-900 text-[10px] text-neutral-400"
          style={{ boxShadow: '0 0 0 2px var(--color-surface),0 0 0 3px var(--color-neutral-800)' }}
        >
          +{rest}
        </span>
      )}
    </button>
  )
}
