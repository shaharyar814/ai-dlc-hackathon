import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EVALUATION_TIME, RULE_ID } from '../../src/config.ts'
import { evaluate } from '../../src/rules/paidUnfulfilled.ts'
import { handleRequest } from '../handleRequest.ts'
import { bodyOf, createHarness, FIXED_REVIEW_TIME, getQueueEvent, rawDatasetArb } from '../handlerTestSupport.ts'
import { createFakeDynamo } from '../testSupport.ts'

// Feature: stalled-orders-aws, Property 2: Stale reviews are omitted and kept
describe('Property 2: Stale reviews are omitted and kept', () => {
  it('omits reviews of orders that no longer match and leaves every stored review unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        rawDatasetArb,
        fc.array(fc.constantFrom('1', '2', '3', '10', '11', '042', 'A7', 'b', 'gone'), { maxLength: 9 }),
        async (dataset, reviewedIds: string[]) => {
          const db = createFakeDynamo()
          for (const id of new Set(reviewedIds)) {
            db.seed({ orderId: id, ruleId: RULE_ID, reviewedAt: FIXED_REVIEW_TIME, reviewer: 'lead1' })
          }
          const before = db.snapshot()
          const h = createHarness(dataset, { db })
          const flagged = new Set(evaluate(dataset, EVALUATION_TIME, 24).flagged.map((f) => f.order.orderId))
          const res = await handleRequest(getQueueEvent(), h.deps)
          expect(res.statusCode).toBe(200)
          const rows = bodyOf(res).rows as { order: { orderId: string }; review: unknown }[]
          for (const r of rows) {
            expect(flagged.has(r.order.orderId)).toBe(true)
            expect(r.review !== null).toBe(reviewedIds.includes(r.order.orderId))
          }
          expect(rows.length).toBe(flagged.size)
          expect(db.snapshot()).toEqual(before)
          expect(db.writes).toBe(0)
        },
      ),
      { numRuns: 150 },
    )
  })
})
