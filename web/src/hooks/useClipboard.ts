import { useEffect } from 'react'
import { gesture } from '~/components/board/interaction'
import { looksLikeEmail, parseEmail } from '~/lib/email'
import { imageToDataUrl } from '~/lib/image'
import type { CardClip } from '~/store/board'
import { toast } from '~/store/toast'
import { useBoard } from '~/store/board'

const MIME = 'text/plain'

/** The last copied cards, for when the system clipboard can't be read back. */
let lastClip: CardClip | null = null

function readClip(text: string): CardClip | null {
  if (!text.startsWith('{"ideaplanner"')) return null
  try {
    const c = JSON.parse(text) as CardClip
    return c.ideaplanner === 1 && Array.isArray(c.nodes) ? c : null
  } catch {
    return null
  }
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

/** Text the person selected on the page (outside fields) wins over copying cards. */
const hasTextSelection = () => (window.getSelection()?.toString() ?? '') !== ''

/** Where pasted cards go: under the pointer when it's on the board, else the middle of the screen. */
function pasteSpot() {
  const s = useBoard.getState()
  if (s.mode === 'board' && gesture.world) return gesture.world
  return { x: (s.viewport.w / 2 - s.view.x) / s.view.z - 140, y: (s.viewport.h / 2 - s.view.y) / s.view.z - 80 }
}

function cutSelection() {
  useBoard.getState().deleteSelection()
}

/** Copies (or cuts) the selected cards to the system clipboard, for the toolbar buttons. */
export async function copyToClipboard(cut = false) {
  const clip = useBoard.getState().copySelection()
  if (!clip) return
  lastClip = clip
  try {
    await navigator.clipboard.writeText(JSON.stringify(clip))
  } catch {
    // Kept in memory for pasting inside the app.
  }
  if (cut) cutSelection()
  else toast(clip.nodes.length === 1 ? 'Copied 1 card' : `Copied ${clip.nodes.length} cards`)
}

/** Pastes text from outside the app as the card that fits it best. */
function pasteText(text: string) {
  const s = useBoard.getState()
  const at = pasteSpot()
  const t = text.trim()
  if (!t) return
  if (/^https?:\/\/\S+$/i.test(t)) {
    let host = 'Link'
    try {
      host = new URL(t).hostname.replace(/^www\./, '')
    } catch {
      // Keep the generic title.
    }
    s.addNode('link', { x: at.x + 130, y: at.y + 80 }, { title: host, url: t })
  } else if (looksLikeEmail(t)) {
    const mail = parseEmail(t)
    s.addNode('email', { x: at.x + 160, y: at.y + 80 }, { ...mail, title: mail.subject || 'Email' })
  } else {
    s.addNode('note', { x: at.x + 130, y: at.y + 80 }, { text: t, title: t.split('\n')[0]!.slice(0, 40) || 'Idea' })
  }
}

/** Ctrl/⌘ + C, X and V for cards, plus pasting text, links, emails and images onto the board. */
export function useClipboard() {
  useEffect(() => {
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (isEditable(e.target) || hasTextSelection()) return
      const s = useBoard.getState()
      const clip = s.copySelection()
      if (!clip) return
      e.preventDefault()
      lastClip = clip
      e.clipboardData?.setData(MIME, JSON.stringify(clip))
      if (cut) cutSelection()
      else toast(clip.nodes.length === 1 ? 'Copied 1 card' : `Copied ${clip.nodes.length} cards`)
    }
    const copy = (e: ClipboardEvent) => onCopy(e, false)
    const cut = (e: ClipboardEvent) => onCopy(e, true)

    const paste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const s = useBoard.getState()
      if (!s.board || s.dialog) return
      const data = e.clipboardData
      const image = [...(data?.files ?? [])].find((f) => f.type.startsWith('image/'))
      e.preventDefault()
      if (image) {
        const at = pasteSpot()
        void imageToDataUrl(image).then((src) => s.addNode('image', { x: at.x + 130, y: at.y + 80 }, { src, title: 'Photo' }))
        return
      }
      const text = data?.getData(MIME) ?? ''
      const clip = readClip(text) ?? (!text && lastClip ? lastClip : null)
      if (clip) s.paste(clip, pasteSpot())
      else pasteText(text)
    }

    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', paste)
    return () => {
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', paste)
    }
  }, [])
}
