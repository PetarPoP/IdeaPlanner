import { useRef, useState } from 'react'
import { ImageSquare, Trash } from '@phosphor-icons/react'
import { imageToDataUrl } from '~/lib/image'
import { patchNode, useNode } from '~/store/board'
import { cx } from '../ui'

export function ImageCard({ id }: { id: string }) {
  const n = useNode(id, 'image')
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!n) return null

  const take = async (file: File | undefined) => {
    if (!file?.type.startsWith('image/')) return
    try {
      setError(null)
      const src = await imageToDataUrl(file)
      patchNode<'image'>(id, (x) => ({ ...x, src }))
    } catch {
      setError('Couldn’t read that image.')
    }
  }

  return (
    <div className="px-3 pb-3">
      <div
        role="button"
        tabIndex={0}
        aria-label={n.src ? 'Replace photo' : 'Add a photo'}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void take(e.dataTransfer.files[0])
        }}
        className={cx(
          'group relative grid h-[170px] cursor-pointer place-items-center overflow-hidden rounded-lg',
          n.src ? '' : 'border border-dashed',
          over ? 'border-accent bg-accent-900' : 'border-neutral-700 bg-bg',
        )}
      >
        {n.src ? (
          <>
            {/* .lighten from Nocturne: dark parts of the photo melt into the card. */}
            <img src={n.src} alt={n.title} className="size-full object-cover mix-blend-lighten" draggable={false} />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={(e) => {
                e.stopPropagation()
                patchNode<'image'>(id, (x) => ({ ...x, src: null }))
              }}
              className="glass absolute top-2 right-2 grid size-8 place-items-center rounded-lg text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
            >
              <Trash />
            </button>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-xs text-neutral-500">
            <ImageSquare size={28} className="text-accent" />
            {error ?? 'Drop a photo'}
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
