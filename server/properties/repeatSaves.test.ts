import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../handleRequest.ts'
import { bodyOf, createHarness, leadClaims, postReviewEvent, rawOrder, usernameArb } from '../handlerTestSupport.ts'
import { createFakeDynamo } from '../testSupport.ts'

const dataset = [rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z' })]
const request = { orderId: '1042', ruleId: 'paid-unfulfilled' }

const stamp = fc
  .date({ min: new Date('2026-11-20T12:00:00Z'), max: new Date('2026-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString())

// Feature: stalled-orders-aws, Property 8: Saving a review repeatedly keeps the first record
describe('Property 8: Saving a review repeatedly keeps the first record', () => {
  it('keeps the first timestamp and reviewer across N saves and returns them every time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ user: usernameArb, at: stamp }), { minLength: 1, maxLength: 10 }),
        async (saves) => {
          const db = createFakeDynamo()
          const results = []
          for (const s of saves) {
            const h = createHarness(dataset, { db, reviewTime: s.at })
            results.push(await handleRequest(postReviewEvent(request, leadClaims(s.user)), h.deps))
          }
          expect(results.map((r) => r.statusCode)).toEqual(saves.map((_, i) => (i === 0 ? 201 : 200)))
          for (const r of results) {
            expect(bodyOf(r)).toMatchObject({ reviewedAt: saves[0].at, reviewer: saves[0].user })
          }
          expect(db.writes).toBe(1)
          expect(db.snapshot()).toEqual([{ ...request, reviewedAt: saves[0].at, reviewer: saves[0].user }])
        },
      ),
      { numRuns: 150 },
    )
  })
})
