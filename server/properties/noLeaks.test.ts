import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { handleRequest, type ApiEvent } from '../handleRequest.ts'
import { createHarness, getQueueEvent, LEAD_CLAIMS, postReviewEvent, rawOrder } from '../handlerTestSupport.ts'
import type { ReviewStore } from '../reviewStore.ts'
import { GENERIC_ERROR_MESSAGE } from '../responses.ts'

const dataset = [rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z' })]
const GENERIC_BODY = JSON.stringify({ error: { code: 'internal_error', message: GENERIC_ERROR_MESSAGE } })

function failingStore(message: string, stack: string): ReviewStore {
  const fail = (): never => {
    const e = new Error(message)
    e.stack = stack
    throw e
  }
  return { getMany: () => Promise.resolve().then(fail), save: () => Promise.resolve().then(fail) }
}

// Lowercase bodies with distinct uppercase prefixes, so no value can be a substring of another.
const body = fc.stringMatching(/^[a-z0-9]{12,24}$/)
const errArb = body.map((s) => `ERR${s}`)
const stackArb = body.map((s) => `STK${s}`)
const tokenArb = body.map((s) => `TOK${s}`)

// Feature: stalled-orders-aws, Property 13: Failures do not leak internals or credentials
describe('Property 13: Failures do not leak internals or credentials', () => {
  it('returns the fixed body, logs the cause, and never logs the Authorization value', async () => {
    await fc.assert(
      fc.asyncProperty(errArb, stackArb, tokenArb, fc.boolean(), async (errText, stackText, token, onPost) => {
        const store = failingStore(`boom-${errText}`, `Error: at ${stackText}`)
        const h = createHarness(dataset, { store })
        const base: ApiEvent = onPost
          ? postReviewEvent({ orderId: '1042', ruleId: 'paid-unfulfilled' }, LEAD_CLAIMS)
          : getQueueEvent()
        const event = { ...base, headers: { authorization: `Bearer ${token}` } }
        const res = await handleRequest(event, h.deps)
        expect(res.statusCode).toBe(500)
        expect(res.body).toBe(GENERIC_BODY)
        expect(res.body).not.toContain(errText)
        expect(res.body).not.toContain(stackText)
        expect(h.logs).toHaveLength(1)
        const log = JSON.stringify(h.logs[0])
        expect(log).toContain(`boom-${errText}`)
        expect(log).not.toContain(token)
        expect(log).not.toContain(stackText)
        expect(h.logs[0]).toMatchObject({ errorName: 'Error' })
      }),
      { numRuns: 150 },
    )
  })
})
