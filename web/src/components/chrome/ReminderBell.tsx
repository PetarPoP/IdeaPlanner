import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellRinging } from '@phosphor-icons/react'
import { dayLabel, daysBetween, toIso } from '~/lib/dates'
import { NamedIcon } from '~/lib/icons'
import type { Reminder } from '~/lib/reminders'
import { msUntil, soon } from '~/lib/reminders'
import { useBoard } from '~/store/board'
import { cx } from '../ui'
import { Popover } from './Popover'

const NOTIFIED_KEY = 'ideaPlanner.notified'
const NOTIFY_WITHIN_MS = 24 * 3600_000
const CHECK_EVERY_MS = 15 * 60_000

const canNotify = () => typeof Notification !== 'undefined'

function relative(date: string): string {
  const d = daysBetween(toIso(new Date()), date)
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : dayLabel(date)
}

/** Upcoming departures, check-ins, day plans and payments, with an optional heads-up a day before. */
export function ReminderBell({ className }: { className?: string }) {
  const board = useBoard((s) => s.board!)
  const items = useMemo(() => soon(board), [board])
  const [open, setOpen] = useState(false)
  const [perm, setPerm] = useState(() => (canNotify() ? Notification.permission : 'denied'))
  const anchor = useRef<HTMLButtonElement>(null)
  const today = items.some((r) => r.date === toIso(new Date()))

  useReminderNotifications(items, perm === 'granted')

  return (
    <div className="relative">
      <button
        ref={anchor}
        type="button"
        title="Coming up"
        aria-pressed={open}
        onClick={() => setOpen(!open)}
        className={cx('relative grid size-9 place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-900 aria-pressed:bg-accent-900 aria-pressed:text-accent-200', className)}
      >
        {today ? <BellRinging size={18} className="anim-wiggle" /> : <Bell size={18} />}
        {items.length > 0 && (
          <span key={items.length} className="anim-pop absolute top-1 right-1 grid min-w-3.5 place-items-center rounded-full bg-accent px-1 text-[9px] leading-[14px] font-semibold text-bg">
            {items.length}
          </span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} className="top-11 right-0 flex w-[300px] flex-col gap-2">
        <div className="kicker">Next two weeks</div>
        {!items.length && <p className="text-xs text-neutral-500">Nothing dated yet. Bookings, day plans and payments with a due date show up here.</p>}
        <div className="-mx-1 flex max-h-[320px] flex-col overflow-auto">
          {items.map((r, i) => (
            <ReminderRow key={r.key} r={r} delay={i} onPick={() => setOpen(false)} />
          ))}
        </div>
        {canNotify() && perm === 'default' && (
          <button type="button" onClick={() => void Notification.requestPermission().then(setPerm)} className="btn btn-secondary justify-center text-xs">
            <Bell />
            Remind me a day before
          </button>
        )}
        {perm === 'granted' && <p className="text-[11px] text-neutral-500">You'll get a notification a day before each one.</p>}
      </Popover>
    </div>
  )
}

function ReminderRow({ r, delay, onPick }: { r: Reminder; delay: number; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onPick()
        const s = useBoard.getState()
        s.setMode('board')
        s.focusNode(r.nodeId)
      }}
      className="anim-card flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-neutral-900"
      style={{ animationDelay: `${Math.min(delay, 8) * 30}ms` }}
    >
      <span className="grid size-8 flex-none place-items-center rounded-lg bg-accent-900 text-accent-300">
        <NamedIcon name={r.icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px]">
          {r.what}
          <span className="text-neutral-400"> · {r.title || 'Untitled'}</span>
        </span>
        <span className="text-[11px] text-neutral-500">
          {relative(r.date)}
          {r.time && ` · ${r.time}`}
        </span>
      </span>
    </button>
  )
}

function readNotified(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** Shows a system notification once per event, when it's less than a day away. */
function useReminderNotifications(items: Reminder[], on: boolean) {
  const title = useBoard((s) => s.board!.title)
  useEffect(() => {
    if (!on) return
    const check = () => {
      const done = new Set(readNotified())
      for (const r of items) {
        const ms = msUntil(r)
        if (done.has(r.key) || ms < 0 || ms > NOTIFY_WITHIN_MS) continue
        try {
          new Notification(`${r.what}: ${r.title || 'Untitled'}`, {
            body: `${relative(r.date)}${r.time ? ` at ${r.time}` : ''} · ${title}`,
            tag: r.key,
            icon: '/icons/icon-192.png',
          })
        } catch {
          // Some webviews have no notifications; the bell still lists it.
        }
        done.add(r.key)
      }
      try {
        localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...done].slice(-200)))
      } catch {
        // Not remembered: at worst one repeat.
      }
    }
    check()
    const t = setInterval(check, CHECK_EVERY_MS)
    return () => clearInterval(t)
  }, [items, on, title])
}
