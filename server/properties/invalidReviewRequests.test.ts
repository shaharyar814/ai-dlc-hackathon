import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { handleRequest } from '../handleRequest.ts'
import { createHarness, postReviewEvent, rawOrder } from '../handlerTestSupport.ts'

const dataset = [rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z' })]

const notString = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string(), { maxLength: 2 }), fc.constant(''))
const invalidBody = fc.oneof(
  fc.constant({ raw: true, body: null as unknown }),
  fc.constant({ raw: true, body: '' as unknown }),
  fc.string().filter((s) => { try { JSON.parse(s); return false } catch { return true } }).map((s) => ({ raw: true, body: s as unknown })),
  fc.constantFrom('1', 'null', '"x"', '[]', 'true').map((s) => ({ raw: true, body: s as unknown })),
  notString.map((v) => ({ raw: false, body: { orderId: v, ruleId: 'paid-unfulfilled' } as unknown })),
  notString.map((v) => ({ raw: false, body: { orderId: '1042', ruleId: v } as unknown })),
  fc.constant({ raw: false, body: {} as unknown }),
  fc.string({ minLength: 1 }).filter((s) => s !== 'paid-unfulfilled').map((r) => ({ raw: false, body: { orderId: '1042', ruleId: r } as unknown })),
  fc.string({ minLength: 1 }).filter((s) => s !== '1042').map((o) => ({ raw: false, body: { orderId: o, ruleId: 'paid-unfulfilled' } as unknown })),
)

// Feature: stalled-orders-aws, Property 12: Invalid review requests return 400 and write nothing
describe('Property 12: Invalid review requests return 400 and write nothing', () => {
  it('returns 400 with the error body shape and never writes or reads the clock', async () => {
    await fc.assert(
      fc.asyncProperty(invalidBody, async ({ raw, body }) => {
        const h = createHarness(dataset)
        const res = await handleRequest(postReviewEvent(body, undefined, { raw }), h.deps)
        expect(res.statusCode).toBe(400)
        const parsed = JSON.parse(res.body) as { error: { code: string; message: string } }
        expect(parsed.error.code).toBe('invalid_request')
        expect(parsed.error.message.length).toBeGreaterThan(0)
        expect(h.db.writes).toBe(0)
        expect(h.db.snapshot()).toEqual([])
        expect(h.clock.calls()).toBe(0)
      }),
      { numRuns: 250 },
    )
  })
})
