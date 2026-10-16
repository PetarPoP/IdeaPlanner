import { useState } from 'react'
import { ArrowLeft, EnvelopeSimple, GoogleLogo, SpinnerGap } from '@phosphor-icons/react'
import { isTauri } from '@tauri-apps/api/core'
import { googleUrl, useAccount } from '~/store/account'

/** Email (link or code) and Google sign-in. Calls `onDone` once signed in. */
export function SignInForm({ onDone }: { onDone?: () => void }) {
  const { google, sendLink, enterCode } = useAccount()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const send = () =>
    run(async () => {
      await sendLink(email.trim())
      setStep('code')
    })
  const verify = () =>
    run(async () => {
      await enterCode(email.trim(), code)
      onDone?.()
    })
  const withGoogle = async () => {
    const url = await googleUrl(location.pathname)
    if (url) location.href = url
  }

  if (step === 'code') {
    return (
      <form
        className="anim-fade flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void verify()
        }}
      >
        <p className="text-[13px] text-neutral-300">
          We sent a sign-in link and a 6-digit code to <b className="text-text">{email}</b>.{' '}
          {isTauri() ? 'Enter the code here.' : 'Open the link on this device, or enter the code here.'}
        </p>
        <input
          className="input text-center font-mono text-lg tracking-[.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Code from the email"
          autoFocus
        />
        {error && <p className="anim-drop text-xs text-[#f08a8a]">{error}</p>}
        <button type="submit" disabled={busy || code.replace(/\D/g, '').length !== 6} className="btn btn-primary justify-center">
          {busy && <SpinnerGap className="animate-spin" />}
          Sign in
        </button>
        <button type="button" onClick={() => setStep('email')} className="btn btn-ghost justify-center text-xs text-neutral-400">
          <ArrowLeft />
          Use another email
        </button>
      </form>
    )
  }

  return (
    <div className="anim-fade flex flex-col gap-3">
      {google && !isTauri() && (
        <>
          <button type="button" onClick={() => void withGoogle()} className="btn btn-secondary justify-center">
            <GoogleLogo weight="bold" />
            Continue with Google
          </button>
          <div className="flex items-center gap-2 text-[11px] text-neutral-600">
            <span className="h-px flex-1 bg-neutral-800" />
            or
            <span className="h-px flex-1 bg-neutral-800" />
          </div>
        </>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          className="input"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
          autoFocus
        />
        {error && <p className="anim-drop text-xs text-[#f08a8a]">{error}</p>}
        <button type="submit" disabled={busy || !email.includes('@')} className="btn btn-primary justify-center">
          {busy ? <SpinnerGap className="animate-spin" /> : <EnvelopeSimple />}
          Email me a sign-in link
        </button>
      </form>
    </div>
  )
}
