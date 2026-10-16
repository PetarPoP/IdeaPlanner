import { LockSimple } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useAccount } from '~/store/account'
import { SignInForm } from './SignInForm'

/** Shown instead of a board the server won't open for me. */
export function AccessGate({ kind }: { kind: 'signin' | 'denied' }) {
  const user = useAccount((s) => s.user)
  const signOut = useAccount((s) => s.signOut)
  return (
    <div className="grid h-full place-items-center p-4">
      <div className="anim-modal flex w-full max-w-[380px] flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-lg">
        <span className="grid size-11 place-items-center rounded-xl border border-accent text-xl text-accent shadow-glow">
          <LockSimple />
        </span>
        {kind === 'signin' || !user ? (
          <>
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-medium">Sign in to open this board</h1>
              <p className="text-[13px] text-neutral-400">Its owner shares it only with people they invited.</p>
            </div>
            <SignInForm />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-medium">You don't have access</h1>
              <p className="text-[13px] text-neutral-400">
                You're signed in as <b className="text-text">{user.email}</b>. Ask the board's owner to invite this address.
              </p>
            </div>
            <div className="flex gap-2">
              <Link to="/" className="btn btn-primary flex-1 justify-center no-underline">
                My boards
              </Link>
              <button type="button" onClick={() => void signOut()} className="btn btn-secondary flex-1 justify-center">
                Switch account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
