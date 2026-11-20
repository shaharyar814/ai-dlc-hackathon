import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { RULE_ID } from '../config.ts'
import { buildQueue } from '../rules/queue.ts'
import { loadReviews, saveReview, type StorageLike } from '../storage/reviews.ts'
import type { FlaggedOrder } from '../types.ts'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

function flaggedOrder(orderId: string): FlaggedOrder {
  return {
    order: {
      orderId,
      paymentStatus: 'paid',
      paidAtMs: Date.parse('2026-11-19T09:00:00Z'),
      paidAt: '2026-11-19T09:00:00Z',
      canceled: false,
      refundStatus: 'none',
      orderedQuantity: 2,
      fulfilledQuantity: 0,
    },
    elapsedMs: 27 * 3_600_000,
  }
}

const REVIEWED_AT = '2026-11-20T12:05:00Z'

const scenario = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 12 })
  .chain((ids) =>
    fc.record({
      ids: fc.constant(ids),
      alreadyReviewed: fc.array(fc.boolean(), { minLength: ids.length, maxLength: ids.length }),
    }),
  )
  .filter(({ alreadyReviewed }) => alreadyReviewed.some((r) => !r))
  .chain((s) => {
    const openIds = s.ids.filter((_, i) => !s.alreadyReviewed[i])
    return fc.record({
      ids: fc.constant(s.ids),
      alreadyReviewed: fc.constant(s.alreadyReviewed),
      target: fc.constantFrom(...openIds),
    })
  })

const ids = (rows: readonly { flagged: FlaggedOrder }[]) => rows.map((r) => r.flagged.order.orderId)

describe('review flow', () => {
  // Feature: ui-redesign, Property 8: Marking an order reviewed moves exactly that order
  // **Validates: Requirements 4.7, 5.6, 7.3, 7.6**
  it('Property 8: marking an order reviewed moves exactly that order', () => {
    fc.assert(
      fc.property(scenario, ({ ids: orderIds, alreadyReviewed, target }) => {
        const storage = memoryStorage()
        const flagged = orderIds.map(flaggedOrder)
        orderIds.forEach((id, i) => {
          if (alreadyReviewed[i]) saveReview(storage, id, RULE_ID, '2026-11-20T11:00:00Z')
        })
        const before = buildQueue(flagged, loadReviews(storage), RULE_ID)

        const saved = saveReview(storage, target, RULE_ID, REVIEWED_AT)
        expect(saved.ok).toBe(true)
        const after = buildQueue(flagged, saved.reviews, RULE_ID)

        expect(after.open.length).toBe(before.open.length - 1)
        expect(after.reviewed.length).toBe(before.reviewed.length + 1)
        expect(ids(after.open)).toEqual(ids(before.open).filter((id) => id !== target))
        expect(ids(after.reviewed).filter((id) => id !== target)).toEqual(ids(before.reviewed))
        expect(ids(after.reviewed)).toContain(target)
        expect(ids(after.open)).not.toContain(target)

        const reloaded = buildQueue(flagged, loadReviews(storage), RULE_ID)
        expect(ids(reloaded.open)).toEqual(ids(after.open))
        expect(ids(reloaded.reviewed)).toEqual(ids(after.reviewed))
        expect(
          reloaded.reviewed.find((r) => r.flagged.order.orderId === target)?.review?.reviewedAt,
        ).toBe(REVIEWED_AT)
      }),
      { numRuns: 100 },
    )
  })
})
