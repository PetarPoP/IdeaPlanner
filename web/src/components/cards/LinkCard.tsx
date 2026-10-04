import { ArrowSquareOut, Globe } from '@phosphor-icons/react'
import { patchNode, useNode } from '~/store/board'
import { Field } from '../ui'

function safeUrl(url: string): URL | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

export function LinkCard({ id }: { id: string }) {
  const n = useNode(id, 'link')
  if (!n) return null
  const u = safeUrl(n.url)

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      <div
        className="grid h-[70px] place-items-center rounded-lg font-mono text-[11px] text-neutral-500"
        style={{ background: 'repeating-linear-gradient(135deg,#262838 0 8px,#1f2130 8px 16px)' }}
      >
        {u ? u.hostname.replace(/^www\./, '') : 'link preview'}
      </div>
      <div className="flex items-center gap-1.5 rounded-lg bg-bg px-2 py-1.5">
        <Globe className="text-neutral-500" />
        <Field
          value={n.url}
          onValue={(url, m) => patchNode<'link'>(id, (x) => ({ ...x, url }), m)}
          placeholder="Paste a link"
          inputMode="url"
          className="flex-1 font-mono text-xs text-neutral-300"
        />
        {u && (
          <a href={u.href} target="_blank" rel="noreferrer" aria-label="Open link" className="grid place-items-center">
            <ArrowSquareOut />
          </a>
        )}
      </div>
    </div>
  )
}
