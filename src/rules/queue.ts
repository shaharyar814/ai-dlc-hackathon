import type { FlaggedOrder, ReviewMap, ReviewRecord } from '../types.ts'

const ALL_DIGITS = /^\d+$/

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Natural ascending order for order IDs.
 * - Two all-digit IDs compare numerically without precision loss (strip
 *   leading zeros, compare length, then text). Equal numeric values fall back
 *   to text order.
 * - Two other IDs compare as text (code-unit order).
 * - A mixed pair (one all-digit, one not) puts the all-digit ID first.
 *   Comparing mixed pairs as text would make the order intransitive
 *   (for example "0:" < "1" < "02" < "0:"), so Req 3.11 and Property 7 could
 *   not both hold.
 */
export function compareOrderIds(a: string, b: string): number {
  const aDigits = ALL_DIGITS.test(a)
  const bDigits = ALL_DIGITS.test(b)
  if (aDigits !== bDigits) return aDigits ? -1 : 1
  if (aDigits) {
    const na = a.replace(/^0+/, '')
    const nb = b.replace(/^0+/, '')
    if (na.length !== nb.length) return na.length < nb.length ? -1 : 1
    const numeric = compareText(na, nb)
    if (numeric !== 0) return numeric
  }
  return compareText(a, b)
}

/** Earliest payment first, then natural order ID. */
export function compareFlagged(a: FlaggedOrder, b: FlaggedOrder): number {
  if (a.order.paidAtMs !== b.order.paidAtMs) return a.order.paidAtMs < b.order.paidAtMs ? -1 : 1
  return compareOrderIds(a.order.orderId, b.order.orderId)
}

export function reviewKey(orderId: string, ruleId: string): string {
  return JSON.stringify([orderId, ruleId])
}

export interface QueueRow {
  readonly flagged: FlaggedOrder
  readonly review: ReviewRecord | null
}

/** Splits flagged orders into open and reviewed, preserving input order. */
export function buildQueue(
  flagged: readonly FlaggedOrder[],
  reviews: ReviewMap,
  ruleId: string,
): { readonly open: readonly QueueRow[]; readonly reviewed: readonly QueueRow[] } {
  const open: QueueRow[] = []
  const reviewed: QueueRow[] = []
  for (const f of flagged) {
    const review = reviews.get(reviewKey(f.order.orderId, ruleId)) ?? null
    if (review) reviewed.push({ flagged: f, review })
    else open.push({ flagged: f, review: null })
  }
  return { open, reviewed }
}
