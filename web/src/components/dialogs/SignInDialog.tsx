import { X } from '@phosphor-icons/react'
import { useBoard } from '~/store/board'
import { SignInForm } from '../account/SignInForm'
import { Modal } from './Modal'

export function SignInDialog() {
  const close = () => useBoard.getState().set({ dialog: null })
  return (
    <Modal onClose={close} label="Sign in" className="max-w-[380px] gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="text-base font-medium">Sign in</h2>
          <p className="text-xs text-neutral-400">Your boards follow you to every device, and you decide who can view or edit them.</p>
        </div>
        <button type="button" aria-label="Close" onClick={close} className="btn btn-icon size-8 text-neutral-400">
          <X />
        </button>
      </div>
      <SignInForm onDone={close} />
    </Modal>
  )
}
