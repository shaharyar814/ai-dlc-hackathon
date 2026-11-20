import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../handleRequest.ts'
import { bodyOf, createHarness, leadClaims, postReviewEvent, rawOrder, usernameArb } from '../handlerTestSupport.ts'
import { createFakeDynamo } from '../testSupport.ts'

const dataset = [rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z' })]
const request = { orderId: '1042', ruleId: 'paid-unfulfilled' }

// Feature: stalled-orders-aws, Property 9: Concurrent saves keep exactly one review
describe('Property 9: Concurrent saves keep exactly one review', () => {
  it('keeps one review and answers every request with the same timestamp and reviewer', async () => {
    const stamp = fc
      .date({ min: new Date('2026-11-20T12:00:00Z'), max: new Date('2026-12-31T00:00:00Z'), noInvalidDate: true })
      .map((d) => d.toISOString())
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ user: usernameArb, at: stamp }), { minLength: 2, maxLength: 10 }),
        async (saves) => {
          const db = createFakeDynamo()
          const results = await Promise.all(
            saves.map((s) =>
              handleRequest(
                postReviewEvent(request, leadClaims(s.user)),
                createHarness(dataset, { db, reviewTime: s.at }).deps,
              ),
            ),
          )
          const codes = results.map((r) => r.statusCode).sort((a, b) => a - b)
          expect(codes).toEqual([...Array(saves.length - 1).fill(200), 201])
          const stored = db.snapshot()
          expect(stored).toHaveLength(1)
          expect(db.writes).toBe(1)
          for (const r of results) {
            expect(bodyOf(r)).toMatchObject({ reviewedAt: stored[0].reviewedAt, reviewer: stored[0].reviewer })
          }
        },
      ),
      { numRuns: 150 },
    )
  })
})
