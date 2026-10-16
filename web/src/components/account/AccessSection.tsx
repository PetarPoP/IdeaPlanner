import { useEffect, useState } from 'react'
import { LockSimple, X } from '@phosphor-icons/react'
import type { Role } from '~/lib/storage'
import type { Access } from '~/store/account'
import { addMember, boardAccess, claimBoard, removeMember, setLinkAccess, useAccount } from '~/store/account'
import { useBoard } from '~/store/board'
import { Seg } from '../ui'

const LINK_OPTIONS = [
  { value: 'edit', label: 'Can edit' },
  { value: 'view', label: 'Can view' },
  { value: 'none', label: 'Invited only' },
] as const satisfies ReadonlyArray<{ value: Access['linkAccess']; label: string }>

const ROLE_OPTIONS = [
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
  { value: 'admin', label: 'Admin' },
] as const satisfies ReadonlyArray<{ value: Role; label: string }>

/** Who may open this board, enforced by the server. Needs an account. */
export function AccessSection() {
  const id = useBoard((s) => s.board!.id)
  const { available, user } = useAccount()
  const [access, setAccess] = useState<Access | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('edit')
  const [error, setError] = useState('')

  const refresh = () => void boardAccess(id).then(setAccess, () => setAccess(null))
  useEffect(refresh, [id, user?.id])

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    }
  }

  if (!available) return null
  if (!user)
    return (
      <div className="flex items-center gap-2.5 rounded-[10px] bg-bg p-2.5">
        <LockSimple className="flex-none text-accent" />
        <span className="flex-1 text-xs text-neutral-400">Sign in to choose who can view or edit this board.</span>
        <button type="button" onClick={() => useBoard.getState().toggleDialog('signin')} className="btn btn-secondary px-2.5 py-1 text-xs">
          Sign in
        </button>
      </div>
    )
  if (!access) return null

  if (!access.owned)
    return (
      <div className="flex items-center gap-2.5 rounded-[10px] bg-bg p-2.5">
        <LockSimple className="flex-none text-accent" />
        <span className="flex-1 text-xs text-neutral-400">Anyone with the link can edit. Take ownership to control access.</span>
        <button type="button" onClick={() => void run(() => claimBoard(id))} className="btn btn-secondary px-2.5 py-1 text-xs">
          Protect
        </button>
      </div>
    )

  if (access.role !== 'admin')
    return <div className="rounded-[10px] bg-bg p-2.5 text-xs text-neutral-400">You can {access.role === 'view' ? 'view' : 'edit'} this board. Its admins manage who has access.</div>

  return (
    <div className="anim-fade flex flex-col gap-2.5 rounded-[10px] bg-bg p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-neutral-300">Anyone with the link</span>
        <Seg
          options={LINK_OPTIONS}
          value={access.linkAccess}
          onPick={(v) => void run(() => setLinkAccess(id, v))}
          className="[&_.seg-opt]:px-2 [&_.seg-opt]:py-1 [&_.seg-opt]:text-[11px]"
        />
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) void run(() => addMember(id, email.trim(), role)).then(() => setEmail(''))
        }}
      >
        <input className="input min-w-0 flex-1 text-xs" type="email" placeholder="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to invite" />
        <select className="input w-auto flex-none text-xs" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary flex-none px-2.5 text-xs">
          Add
        </button>
      </form>
      {error && <p className="anim-drop text-xs text-[#f08a8a]">{error}</p>}
      <div className="flex flex-col">
        {access.members.map((m) => {
          const self = m.id === user.id
          return (
            <div key={m.id} className="anim-fade flex items-center gap-2 py-1">
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-xs text-text">
                  {m.name || m.email}
                  {self && ' (you)'}
                </span>
                {m.name && <span className="truncate text-[11px] text-neutral-500">{m.email}</span>}
              </span>
              {self && access.isOwner ? (
                <span className="text-[11px] text-neutral-500">Owner</span>
              ) : (
                <>
                  <Seg
                    options={ROLE_OPTIONS}
                    value={m.role}
                    onPick={(r) => void run(() => addMember(id, m.email, r))}
                    className="[&_.seg-opt]:px-1.5 [&_.seg-opt]:py-0.5 [&_.seg-opt]:text-[10.5px]"
                  />
                  <button type="button" aria-label={`Remove ${m.email}`} onClick={() => void run(() => removeMember(id, m.id))} className="grid size-6 place-items-center rounded-md text-neutral-500 hover:text-text">
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
