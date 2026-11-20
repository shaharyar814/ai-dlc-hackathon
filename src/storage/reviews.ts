import { REVIEW_STORAGE_KEY } from '../config.ts'
import { reviewKey } from '../rules/queue.ts'
import { parseUtcTimestamp } from '../rules/timestamps.ts'
import type { ReviewMap, ReviewRecord } from '../types.ts'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Returns browser local storage, or null when it is blocked or unavailable. */
export function getBrowserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function toRecord(value: unknown): ReviewRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const { orderId, ruleId, reviewedAt } = value as Record<string, unknown>
  if (typeof orderId !== 'string' || typeof ruleId !== 'string') return null
  if (typeof reviewedAt !== 'string' || parseUtcTimestamp(reviewedAt) === null) return null
  return { orderId, ruleId, reviewedAt }
}

/**
 * Loads saved reviews. Returns an empty map for missing storage, an absent
 * key, a throwing getItem, bad JSON, a non-array, or any invalid entry.
 * Never throws.
 */
export function loadReviews(storage: StorageLike | null): ReviewMap {
  const reviews = new Map<string, ReviewRecord>()
  if (storage === null) return reviews
  let parsed: unknown
  try {
    const raw = storage.getItem(REVIEW_STORAGE_KEY)
    if (raw === null) return reviews
    parsed = JSON.parse(raw)
  } catch {
    return reviews
  }
  if (!Array.isArray(parsed)) return reviews
  for (const entry of parsed) {
    const record = toRecord(entry)
    if (record === null) return new Map()
    const key = reviewKey(record.orderId, record.ruleId)
    if (!reviews.has(key)) reviews.set(key, record)
  }
  return reviews
}

export type SaveResult =
  | { readonly ok: true; readonly reviews: ReviewMap }
  | { readonly ok: false; readonly reviews: ReviewMap; readonly error: string }

/**
 * Saves a review. An existing review for the same order and rule is kept and
 * nothing is written. The timestamp is always an argument; this module never
 * reads the clock.
 */
export function saveReview(
  storage: StorageLike | null,
  orderId: string,
  ruleId: string,
  reviewedAt: string,
): SaveResult {
  const before = loadReviews(storage)
  const key = reviewKey(orderId, ruleId)
  if (before.has(key)) return { ok: true, reviews: before }
  if (storage === null) return { ok: false, reviews: before, error: 'Storage is unavailable' }

  const after = new Map(before)
  after.set(key, { orderId, ruleId, reviewedAt })
  try {
    storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify([...after.values()]))
  } catch (e) {
    return { ok: false, reviews: before, error: e instanceof Error ? e.message : 'Write failed' }
  }
  return { ok: true, reviews: after }
}
