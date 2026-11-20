import fc from 'fast-check'
import { describe, it } from 'vitest'
import { RULE_ID } from '../config.ts'
import { reviewKey } from '../rules/queue.ts'
import { DynamoReviewStore } from '../../server/reviewStore.ts'
import { createFakeDynamo } from '../../server/testSupport.ts'
import { loadReviews, saveReview, type StorageLike } from './reviews.ts'

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
  }
}

// Feature: stalled-orders-aws, Property 14: Local and Lambda stores agree
describe('Property 14: Local and Lambda stores agree', () => {
  it('returns identical reviews for every pair after the same sequence of saves', async () => {
    const orderId = fc.constantFrom('1', '2', '3', '10', 'a b', '')
    const ruleId = fc.constantFrom(RULE_ID, 'other-rule')
    const stamp = fc
      .date({ min: new Date('2026-01-01T00:00:00Z'), max: new Date('2026-12-31T00:00:00Z'), noInvalidDate: true })
      .map((d) => d.toISOString())
    const save = fc.record({ orderId, ruleId, reviewedAt: stamp, reviewer: fc.constantFrom('lead1', 'lead2') })
    await fc.assert(
      fc.asyncProperty(fc.array(save, { minLength: 1, maxLength: 50 }), async (saves) => {
        const storage = memoryStorage()
        const db = createFakeDynamo()
        const store = new DynamoReviewStore(db)
        for (const s of saves) {
          saveReview(storage, s.orderId, s.ruleId, s.reviewedAt)
          await store.save(s.orderId, s.ruleId, s.reviewedAt, s.reviewer)
        }
        const local = loadReviews(storage)
        const pairs = [...new Set(saves.map((s) => reviewKey(s.orderId, s.ruleId)))]
        const keys = ['1', '2', '3', '10', 'a b', '', 'never'].flatMap((o) =>
          [RULE_ID, 'other-rule'].map((r) => ({ orderId: o, ruleId: r })),
        )
        const remote = await store.getMany(keys)
        for (const k of keys) {
          const key = reviewKey(k.orderId, k.ruleId)
          const a = local.get(key)
          const b = remote.get(key)
          if ((a === undefined) !== (b === undefined)) throw new Error(`presence differs for ${key}`)
          if (a && b && a.reviewedAt !== b.reviewedAt) throw new Error(`timestamp differs for ${key}`)
        }
        if (local.size !== pairs.length || remote.size !== pairs.length) throw new Error('size differs')
      }),
      { numRuns: 150 },
    )
  })
})
