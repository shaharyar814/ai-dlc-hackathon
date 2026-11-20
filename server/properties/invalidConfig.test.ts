import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DATASET } from '../../src/data/orders.ts'
import { handleRequest } from '../handleRequest.ts'
import { createHarness, getQueueEvent } from '../handlerTestSupport.ts'
import { GENERIC_ERROR_MESSAGE } from '../responses.ts'

const GENERIC_BODY = JSON.stringify({ error: { code: 'internal_error', message: GENERIC_ERROR_MESSAGE } })

const badThreshold = fc.oneof(
  fc.constantFrom('', ' ', '0', '0.0', '-1', '-0.5', 'NaN', 'Infinity', '1e3', ' 24', '24 ', '0x18', 'abc'),
  fc.string().filter((s) => !/^\d+(\.\d+)?$/.test(s)),
)
const badTime = fc.oneof(
  fc.constantFrom('', ' ', '2026-11-20T12:00:00', '2026-11-20T12:00:00+02:00', '2026-02-30T00:00:00Z', 'now'),
  fc.string().filter((s) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z$/.test(s)),
)

// Feature: stalled-orders-aws, Property 6: Invalid configuration returns a generic 500
describe('Property 6: Invalid configuration returns a generic 500', () => {
  it('returns the fixed body for any invalid threshold or evaluation time, on both routes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({ FULFILLMENT_THRESHOLD_HOURS: badThreshold }),
          fc.record({ EVALUATION_TIME: badTime }),
          fc.record({ FULFILLMENT_THRESHOLD_HOURS: badThreshold, EVALUATION_TIME: badTime }),
        ),
        async (env) => {
          const h = createHarness(DATASET, { env })
          const res = await handleRequest(getQueueEvent(), h.deps)
          expect(res.statusCode).toBe(500)
          expect(res.body).toBe(GENERIC_BODY)
          expect(res.body).not.toContain('FULFILLMENT_THRESHOLD_HOURS')
          expect(res.body).not.toContain('EVALUATION_TIME')
          expect(res.body).not.toContain('1042')
          expect(res.body).not.toContain('rows')
          expect(h.db.writes).toBe(0)
        },
      ),
      { numRuns: 200 },
    )
  })
})
