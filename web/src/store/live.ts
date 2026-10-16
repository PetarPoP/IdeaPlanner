import { create } from 'zustand'
import type { Peer } from '~/lib/live'

interface LiveState {
  status: 'connecting' | 'live' | 'off'
  peers: Record<number, Peer>
}

/** Who else has the board open right now, and where they are. */
export const useLive = create<LiveState>()(() => ({ status: 'off', peers: {} }))

export const setPeer = (id: number, update: Partial<Peer> | null) =>
  useLive.setState((s) => {
    const peers = { ...s.peers }
    if (update == null) delete peers[id]
    else peers[id] = { ...(peers[id] ?? { id, name: '', color: '', role: 'edit' }), ...update }
    return { peers }
  })
