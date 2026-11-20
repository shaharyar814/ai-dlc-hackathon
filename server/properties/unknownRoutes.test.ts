import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DATASET } from '../../src/data/orders.ts'
import { handleRequest } from '../handleRequest.ts'
import { bodyOf, createHarness, getQueueEvent, LEAD_CLAIMS } from '../handlerTestSupport.ts'

// Feature: stalled-orders-aws, Property 4: Unknown routes return 404
describe('Property 4: Unknown routes return 404', () => {
  it('returns 404 and no data for any method and path other than GET /queue and POST /reviews', async () => {
    const method = fc.oneof(fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'), fc.string({ maxLength: 8 }))
    const path = fc.oneof(
      fc.constantFrom('/reviews', '/queue', '/queue/', '/reviews/1', '/', '', '/Queue', '/api/queue'),
      fc.string({ maxLength: 20 }),
    )
    await fc.assert(
      fc.asyncProperty(
        method,
        path,
        fc.constantFrom<Record<string, unknown> | null>(LEAD_CLAIMS, null),
        async (m, p, claims) => {
          fc.pre(!(m === 'GET' && p === '/queue') && !(m === 'POST' && p === '/reviews'))
          const h = createHarness(DATASET)
          const res = await handleRequest(getQueueEvent(claims, { method: m, path: p }), h.deps)
          expect(res.statusCode).toBe(404)
          expect(bodyOf(res).error).toMatchObject({ code: 'not_found' })
          expect(res.body).not.toContain('1042')
          expect(h.db.writes).toBe(0)
        },
      ),
      { numRuns: 200 },
    )
  })
})
