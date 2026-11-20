import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EVALUATION_TIME } from '../../src/config.ts'
import { evaluate } from '../../src/rules/paidUnfulfilled.ts'
import { handleRequest } from '../handleRequest.ts'
import {
  bodyOf,
  createHarness,
  getQueueEvent,
  leadClaims,
  postReviewEvent,
  rawDatasetArb,
  usernameArb,
} from '../handlerTestSupport.ts'
import { createFakeDynamo } from '../testSupport.ts'

// Feature: stalled-orders-aws, Property 10: Save then queue round trip
describe('Property 10: Save then queue round trip', () => {
  it('shows each saved review on its row, from a fresh handler that shares only the store', async () => {
    await fc.assert(
      fc.asyncProperty(
        rawDatasetArb,
        fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
        usernameArb,
        fc.date({ min: new Date('2026-11-20T12:00:00Z'), max: new Date('2026-12-31T00:00:00Z'), noInvalidDate: true }),
        async (dataset, picks, user, when) => {
          const at = when.toISOString()
          const db = createFakeDynamo()
          const flagged = evaluate(dataset, EVALUATION_TIME, 24).flagged.map((f) => f.order.orderId)
          const saved = new Set<string>()
          for (const [i, id] of flagged.entries()) {
            if (!picks[i % picks.length]) continue
            const h = createHarness(dataset, { db, reviewTime: at })
            const res = await handleRequest(postReviewEvent({ orderId: id, ruleId: 'paid-unfulfilled' }, leadClaims(user)), h.deps)
            expect(res.statusCode).toBe(201)
            saved.add(id)
          }
          const fresh = createHarness(dataset, { db })
          const rows = bodyOf(await handleRequest(getQueueEvent(), fresh.deps)).rows as {
            order: { orderId: string }
            review: { reviewedAt: string; reviewer: string } | null
          }[]
          expect(rows.map((r) => r.order.orderId)).toEqual(flagged)
          for (const r of rows) {
            if (saved.has(r.order.orderId)) expect(r.review).toEqual({ reviewedAt: at, reviewer: user })
            else expect(r.review).toBeNull()
          }
        },
      ),
      { numRuns: 120 },
    )
  })
})
