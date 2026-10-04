/**
 * A random derangement of 0..n-1: `pairs[giver] = receiver` and nobody draws
 * themselves. Uses Sattolo's algorithm, which yields a single cycle, so it
 * always terminates (unlike shuffle-and-retry).
 */
export function drawNames(n: number, random: () => number = Math.random): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * i)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
