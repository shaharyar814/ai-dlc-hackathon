import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../handleRequest.ts'
import { bodyOf, createHarness, leadClaims, postReviewEvent, rawOrder, usernameArb } from '../handlerTestSupport.ts'

const dataset = [rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z' })]

// Feature: stalled-orders-aws, Property 11: The reviewer is the token username
describe('Property 11: The reviewer is the token username', () => {
  it('takes the reviewer from the username claim and ignores any reviewer in the body', async () => {
    await fc.assert(
      fc.asyncProperty(usernameArb, fc.option(fc.string(), { nil: undefined }), async (username, fake) => {
        const h = createHarness(dataset)
        const body = { orderId: '1042', ruleId: 'paid-unfulfilled', ...(fake === undefined ? {} : { reviewer: fake }) }
        const res = await handleRequest(postReviewEvent(body, leadClaims(username)), h.deps)
        expect(res.statusCode).toBe(201)
        expect(bodyOf(res).reviewer).toBe(username)
        expect(h.db.snapshot()[0].reviewer).toBe(username)
      }),
      { numRuns: 150 },
    )
  })

  it('rejects a missing or non-string username without writing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(undefined, '', 5, null, ['a'], {}), async (bad) => {
        const h = createHarness(dataset)
        const claims: Record<string, unknown> = { 'cognito:groups': '[fulfillment-lead]' }
        if (bad !== undefined) claims.username = bad
        const res = await handleRequest(
          postReviewEvent({ orderId: '1042', ruleId: 'paid-unfulfilled', reviewer: 'x' }, claims),
          h.deps,
        )
        expect(res.statusCode).toBe(403)
        expect(h.db.writes).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})
