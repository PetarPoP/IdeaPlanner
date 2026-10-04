import type { Board, Node } from './model.gen'
import { num } from './money'

export type CostedNode = Extract<Node, { type: 'section' | 'itinerary' | 'booking' }>

export const isCosted = (n: Node): n is CostedNode =>
  n.type === 'section' || n.type === 'itinerary' || n.type === 'booking'

export function nodeTotal(n: Node): number {
  switch (n.type) {
    case 'section':
      return n.items.reduce((a, i) => a + num(i.cost), 0)
    case 'itinerary':
      return n.stops.reduce((a, s) => a + num(s.cost), 0)
    case 'booking':
      return num(n.cost)
    default:
      return 0
  }
}

export function nodePaid(n: Node): number {
  if (n.type === 'section') return n.items.reduce((a, i) => a + (i.paid ? num(i.cost) : 0), 0)
  if (n.type === 'booking' && n.paid) return num(n.cost)
  return 0
}

export interface Transfer {
  from: number
  to: number
  amount: number
}

export interface Summary {
  costed: CostedNode[]
  total: number
  paid: number
  cap: number
  perPerson: number
  /** What each of the first `splitN` people has paid so far. */
  paidBy: number[]
  /** paidBy minus a fair share of everything paid; positive means owed money. */
  balances: number[]
  transfers: Transfer[]
}

export function summarize(board: Board): Summary {
  const n = Math.max(1, board.splitN)
  const costed = board.nodes.filter(isCosted)
  const total = costed.reduce((a, x) => a + nodeTotal(x), 0)
  const paid = costed.reduce((a, x) => a + nodePaid(x), 0)

  const paidBy = Array<number>(n).fill(0)
  const credit = (who: number, amount: number) => {
    if (who < n) paidBy[who]! += amount
  }
  for (const x of costed) {
    if (x.type === 'section') for (const i of x.items) if (i.paid) credit(i.payer, num(i.cost))
    if (x.type === 'booking' && x.paid) credit(x.payer, num(x.cost))
  }
  const share = paid / n
  const balances = paidBy.map((p) => p - share)

  return { costed, total, paid, cap: num(board.cap), perPerson: total / n, paidBy, balances, transfers: settleUp(balances) }
}

/**
 * Greedy settle-up: debtors pay creditors in order until everyone is within
 * half a currency unit. Produces at most n-1 transfers.
 */
export function settleUp(balances: number[], epsilon = 0.5): Transfer[] {
  const creditors = balances.flatMap((b, i) => (b > epsilon ? [{ i, b }] : []))
  const debtors = balances.flatMap((b, i) => (b < -epsilon ? [{ i, b: -b }] : []))
  const out: Transfer[] = []
  let c = 0
  let d = 0
  while (c < creditors.length && d < debtors.length) {
    const cr = creditors[c]!
    const db = debtors[d]!
    const amount = Math.min(cr.b, db.b)
    out.push({ from: db.i, to: cr.i, amount })
    cr.b -= amount
    db.b -= amount
    if (cr.b < epsilon) c++
    if (db.b < epsilon) d++
  }
  return out
}
