const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Random URL-safe id (`len` chars of base36). */
export function uid(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

export const newBoardId = () => uid(12)
