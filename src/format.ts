import type { FlaggedOrder } from './types.ts'

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Whole hours, rounded down: "27 h". */
export function formatHours(elapsedMs: number): string {
  return `${Math.floor(elapsedMs / MS_PER_HOUR)} h`
}

/** Whole hours, then whole minutes of the remainder: "27 h 0 min". */
export function formatElapsed(elapsedMs: number): string {
  const minutes = Math.floor((elapsedMs % MS_PER_HOUR) / MS_PER_MINUTE)
  return `${formatHours(elapsedMs)} ${minutes} min`
}

/** "Paid 27 h ago, 0 of 2 units fulfilled (threshold 24 h)". */
export function formatReason(f: FlaggedOrder, thresholdHours: number): string {
  const { fulfilledQuantity, orderedQuantity } = f.order
  return `Paid ${formatHours(f.elapsedMs)} ago, ${fulfilledQuantity} of ${orderedQuantity} units fulfilled (threshold ${thresholdHours} h)`
}

/** "2026-11-20 12:05 UTC", built from UTC getters only. */
export function formatUtc(isoOrMs: string | number): string {
  const d = new Date(isoOrMs)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

export function formatOrderId(orderId: string): string {
  return `#${orderId}`
}

export function formatCounts(checked: number, skipped: number): string {
  return `${checked} checked, ${skipped} skipped`
}
/**
 * Review status text. With a reviewer (API mode): "Reviewed by lead1 2026-11-20 12:05 UTC".
 * Without one (Stage A): "Reviewed 2026-11-20 12:05 UTC". Where a "Reviewed" chip already
 * shows the label, pass `withLabel: false` to get "by lead1 2026-11-20 12:05 UTC" or just the time.
 */
export function formatReviewStatus(
  review: { readonly reviewedAt: string; readonly reviewer?: string },
  withLabel: boolean,
): string {
  const time = formatUtc(review.reviewedAt)
  const reviewer = review.reviewer
  const text = reviewer !== undefined && reviewer !== '' ? `by ${reviewer} ${time}` : time
  return withLabel ? `Reviewed ${text}` : text
}
