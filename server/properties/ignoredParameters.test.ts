import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DATASET } from '../../src/data/orders.ts'
import { handleRequest, type ApiEvent } from '../handleRequest.ts'
import { createHarness, getQueueEvent } from '../handlerTestSupport.ts'

// Feature: stalled-orders-aws, Property 7: Request parameters do not change the result
describe('Property 7: Request parameters do not change the result', () => {
  it('ignores any query parameter or body that carries a threshold or evaluation time', async () => {
    const h = createHarness(DATASET)
    const baseline = await handleRequest(getQueueEvent(), h.deps)
    const value = fc.oneof(fc.string(), fc.integer().map(String), fc.constantFrom('1', '1000', '2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z'))
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.constantFrom('thresholdHours', 'threshold', 'FULFILLMENT_THRESHOLD_HOURS', 'evaluationTime', 'EVALUATION_TIME', 'x'),
          value,
        ),
        value,
        async (params, body) => {
          const event: ApiEvent & Record<string, unknown> = {
            ...getQueueEvent(),
            queryStringParameters: params,
            rawQueryString: new URLSearchParams(params).toString(),
            body: JSON.stringify({ thresholdHours: body, evaluationTime: body }),
          }
          const res = await handleRequest(event, createHarness(DATASET).deps)
          expect(res.statusCode).toBe(200)
          expect(res.body).toBe(baseline.body)
        },
      ),
      { numRuns: 150 },
    )
  })
})
