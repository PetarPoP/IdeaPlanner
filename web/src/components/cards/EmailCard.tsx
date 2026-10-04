import { useState } from 'react'
import { Check, ClipboardText, Copy, EnvelopeSimple, Paperclip } from '@phosphor-icons/react'
import type { Node } from '~/lib/model.gen'
import type { ChangeMode } from '~/store/board'
import { useInboxAddress } from '~/hooks/useInbox'
import { looksLikeEmail, mailDateLabel, parseEmail } from '~/lib/email'
import { patchNode, useBoard, useNode } from '~/store/board'
import { Area, Field, cx } from '../ui'

type Mail = Extract<Node, { type: 'email' }>

/** An email kept on the board: paste one, drop an .eml file, or forward it to the board's address. */
export function EmailCard({ id }: { id: string }) {
  const n = useNode(id, 'email')
  const boardId = useBoard((s) => s.board?.id ?? '')
  const address = useInboxAddress(boardId)
  const [over, setOver] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  if (!n) return null

  const set = (patch: Partial<Mail>, mode?: ChangeMode) => patchNode<'email'>(id, (x) => ({ ...x, ...patch }), mode)

  const fill = (raw: string) => {
    if (!looksLikeEmail(raw)) {
      // Plain text: keep it as the body.
      set({ body: raw.trim() })
      return
    }
    const mail = parseEmail(raw)
    set({ ...mail, title: mail.subject || n.title })
    useBoard.getState().log(`added the email "${mail.subject || 'untitled'}"`)
  }

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) fill(text)
      else setNote('The clipboard is empty.')
    } catch {
      setNote('Paste with Ctrl+V into the text below instead.')
    }
  }

  const copyAddress = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // The address stays visible to copy by hand.
    }
  }

  const empty = !n.from && !n.subject && !n.body
  return (
    <div
      className={cx('flex flex-col gap-2 px-3 pb-3', over && 'rounded-b-[14px] bg-accent-900')}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0]
        if (!file) return
        e.preventDefault()
        setOver(false)
        void file.text().then(fill)
      }}
    >
      <Field
        value={n.subject}
        onValue={(subject, m) => set({ subject }, m)}
        placeholder="Subject"
        className="text-[15px] font-medium"
        aria-label="Subject"
      />
      <div className="grid grid-cols-[38px_1fr] items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="kicker">From</span>
        <Field value={n.from} onValue={(from, m) => set({ from }, m)} placeholder="sender@mail.com" className="text-neutral-200" aria-label="From" />
        <span className="kicker">To</span>
        <Field value={n.to} onValue={(to, m) => set({ to }, m)} placeholder="—" className="text-neutral-300" aria-label="To" />
        <span className="kicker">Date</span>
        <span className="truncate text-neutral-400" title={n.date}>
          {mailDateLabel(n.date) || '—'}
        </span>
      </div>
      <Area
        value={n.body}
        onValue={(body, m) => set({ body }, m)}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain')
          if (empty && looksLikeEmail(text)) {
            e.preventDefault()
            fill(text)
          }
        }}
        rows={empty ? 3 : 6}
        placeholder="Paste the email here, drop an .eml file, or forward it to the board."
        className="max-h-60 overflow-auto rounded-lg bg-bg p-2 text-[13px] leading-normal text-neutral-200"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={pasteFromClipboard} className="btn btn-secondary px-2 py-1 text-xs">
          <ClipboardText />
          Paste email
        </button>
        <label className="btn btn-secondary cursor-pointer px-2 py-1 text-xs">
          <Paperclip />
          .eml file
          <input
            type="file"
            accept=".eml,message/rfc822,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void file.text().then(fill)
              e.target.value = ''
            }}
          />
        </label>
        {note && <span className="text-[11px] text-neutral-500">{note}</span>}
      </div>
      {address && (
        <div className="flex items-center gap-1.5 rounded-lg bg-bg py-1 pr-1 pl-2 text-[11px] text-neutral-400 shadow-inset">
          <EnvelopeSimple className="flex-none text-accent" />
          <span className="min-w-0 flex-1 truncate font-mono" title="Forward emails here to add them to this board">
            {address}
          </span>
          <button type="button" onClick={copyAddress} aria-label="Copy address" className="btn btn-icon size-6 text-neutral-300">
            {copied ? <Check /> : <Copy />}
          </button>
        </div>
      )}
    </div>
  )
}
