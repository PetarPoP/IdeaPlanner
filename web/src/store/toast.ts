import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

interface ToastState {
  toasts: Toast[]
}

const SHOW_MS = 3600
let next = 1

export const useToasts = create<ToastState>()(() => ({ toasts: [] }))

/** A short note at the bottom of the screen, optionally with one action (Undo). */
export function toast(text: string, action?: Toast['action']) {
  const id = next++
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, action }] }))
  setTimeout(() => dismiss(id), SHOW_MS)
}

export const dismiss = (id: number) => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
