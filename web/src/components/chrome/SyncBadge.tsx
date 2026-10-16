import { CloudSlash } from '@phosphor-icons/react'
import { useBoard } from '~/store/board'

/** Shown while the server can't be reached; edits are kept on the device and sent when back online. */
export function SyncBadge({ label }: { label: boolean }) {
  const offline = useBoard((s) => s.sync === 'offline')
  if (!offline) return null
  return (
    <span
      role="status"
      title="Offline, saved on this device"
      className="flex flex-none items-center gap-1.5 rounded-lg bg-neutral-800 px-2 py-1 text-xs whitespace-nowrap text-neutral-300"
    >
      <CloudSlash className="text-accent-300" />
      {label ? 'Offline, saved on this device' : <span className="sr-only">Offline, saved on this device</span>}
    </span>
  )
}
