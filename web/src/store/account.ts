import { create } from 'zustand'
import { isTauri } from '@tauri-apps/api/core'
import type { Role } from '~/lib/storage'
import { authFetch, serverApi, setSessionToken } from '~/lib/storage'

export interface User {
  id: string
  email: string
  name: string
}

interface AccountState {
  /** False until the server answered (or turned out not to exist). */
  ready: boolean
  /** The server supports accounts at all. */
  available: boolean
  user: User | null
  google: boolean
  ai: boolean
  load(): Promise<void>
  /** Emails a sign-in link and code. */
  sendLink(email: string, next?: string): Promise<void>
  enterCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
  rename(name: string): Promise<void>
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const api = await serverApi()
  if (!api) throw new Error('No server to sign in with.')
  const res = await authFetch(api.base, path, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res
}

export const useAccount = create<AccountState>()((set, get) => ({
  ready: false,
  available: false,
  user: null,
  google: false,
  ai: false,

  async load() {
    const api = await serverApi()
    if (!api) return set({ ready: true, available: false })
    try {
      const res = await authFetch(api.base, '/api/me')
      const me = (await res.json()) as { user: User | null; google: boolean; ai: boolean }
      set({ ready: true, available: true, user: me.user, google: me.google, ai: me.ai })
    } catch {
      set({ ready: true, available: false })
    }
  },

  async sendLink(email, next) {
    await call('/api/auth/email', { method: 'POST', body: JSON.stringify({ email, next: next ?? location.pathname }) })
  },

  async enterCode(email, code) {
    const res = await call('/api/auth/code', { method: 'POST', body: JSON.stringify({ email, code }) })
    const { token, user } = (await res.json()) as { token: string; user: User }
    // The web build has the cookie; other origins need the token itself.
    const api = await serverApi()
    if (isTauri() || api?.base) setSessionToken(token)
    set({ user })
    notifyAccount()
  },

  async signOut() {
    await call('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setSessionToken(null)
    set({ user: null })
    notifyAccount()
  },

  async rename(name) {
    await call('/api/me', { method: 'PATCH', body: JSON.stringify({ name }) })
    const user = get().user
    if (user) set({ user: { ...user, name } })
  },
}))

const ACCOUNT_EVENT = 'ideaplanner:account'
const notifyAccount = () => window.dispatchEvent(new Event(ACCOUNT_EVENT))
export const onAccountChanged = (fn: () => void) => {
  window.addEventListener(ACCOUNT_EVENT, fn)
  return () => window.removeEventListener(ACCOUNT_EVENT, fn)
}

/** Google sign-in leaves the app for Google and comes back to `next`. */
export async function googleUrl(next: string): Promise<string | null> {
  const api = await serverApi()
  return api ? `${api.base}/api/auth/google?next=${encodeURIComponent(next)}` : null
}

export interface Member extends User {
  role: Role
}

export interface Access {
  role: Role
  owned: boolean
  isOwner: boolean
  linkAccess: 'none' | 'view' | 'edit'
  members: Member[]
}

export const boardAccess = async (id: string) => (await call(`/api/boards/${id}/access`)).json() as Promise<Access>
export const setLinkAccess = (id: string, linkAccess: Access['linkAccess']) =>
  call(`/api/boards/${id}/access`, { method: 'PUT', body: JSON.stringify({ linkAccess }) })
export const claimBoard = (id: string) => call(`/api/boards/${id}/claim`, { method: 'POST' })
export const addMember = async (id: string, email: string, role: Role) =>
  (await call(`/api/boards/${id}/members`, { method: 'PUT', body: JSON.stringify({ email, role }) })).json() as Promise<Member[]>
export const removeMember = (id: string, user: string) => call(`/api/boards/${id}/members/${user}`, { method: 'DELETE' })

export interface MyBoard {
  id: string
  title: string
  icon: string
  date: string
  endDate: string
  updatedAt: number
  role: Role
}
export const myBoards = async () => (await call('/api/me/boards')).json() as Promise<MyBoard[]>

/** POSTs JSON to an AI endpoint (receipts, bookings). */
export async function aiCall<T>(path: string, body: unknown): Promise<T> {
  return (await call(path, { method: 'POST', body: JSON.stringify(body) })).json() as Promise<T>
}
