import { useEffect, useState } from 'react'
import { inboxAddress } from '~/lib/email'
import { inboxDomain } from '~/lib/storage'

/** The address that forwards email into this board, once the server says it has an inbox. */
export function useInboxAddress(boardId: string): string | null {
  const [domain, setDomain] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void inboxDomain().then((d) => live && setDomain(d))
    return () => {
      live = false
    }
  }, [])
  return inboxAddress(boardId, domain)
}
