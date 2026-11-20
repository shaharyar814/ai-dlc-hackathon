import { describe, expect, it } from 'vitest'
import { handleRequest } from './handleRequest.ts'
import {
  FIXED_REVIEW_TIME,
  bodyOf,
  createHarness,
  getQueueEvent,
  leadClaims,
  postReviewEvent,
  rawOrder,
} from './handlerTestSupport.ts'
import { DATASET } from '../src/data/orders.ts'

interface Row {
  order: { orderId: string; fulfilledQuantity: number; orderedQuantity: number; paidAt: string }
  elapsedMs: number
  review: { reviewedAt: string; reviewer: string } | null
}

async function queueRows(dataset: Parameters<typeof createHarness>[0]): Promise<Row[]> {
  const h = createHarness(dataset)
  const res = await handleRequest(getQueueEvent(), h.deps)
  expect(res.statusCode).toBe(200)
  return bodyOf(res).rows as Row[]
}

describe('GET /queue: Stage A success table through the API', () => {
  it('Paid 23 hours 59 minutes ago, zero fulfilled: Stays out of the queue', async () => {
    const rows = await queueRows([rawOrder({ orderId: '1', paymentTimestamp: '2026-11-19T12:01:00Z' })])
    expect(rows).toEqual([])
  })

  it('Paid exactly 24 hours ago, zero fulfilled: Appears in Open', async () => {
    const rows = await queueRows([rawOrder({ orderId: '1', paymentTimestamp: '2026-11-19T12:00:00Z' })])
    expect(rows.map((r) => r.order.orderId)).toEqual(['1'])
    expect(rows[0].review).toBeNull()
    expect(rows[0].elapsedMs).toBe(24 * 3_600_000)
  })

  it('Order #1042, paid 27 hours ago, 0 of 2 fulfilled: Appears with elapsed time, reason, and suggested action', async () => {
    const rows = await queueRows([
      rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z', orderedQuantity: 2, fulfilledQuantity: 0 }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].order).toMatchObject({ orderId: '1042', orderedQuantity: 2, fulfilledQuantity: 0 })
    expect(rows[0].elapsedMs).toBe(27 * 3_600_000)
    const h = createHarness([rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z', orderedQuantity: 2 })])
    const body = bodyOf(await handleRequest(getQueueEvent(), h.deps))
    expect(body.ruleId).toBe('paid-unfulfilled')
    expect(body.evaluationTime).toBe('2026-11-20T12:00:00Z')
    expect(body.thresholdHours).toBe(24)
  })

  it('Paid more than 24 hours ago, canceled or fully refunded: Stays out, even when payment status still reads paid', async () => {
    const rows = await queueRows([
      rawOrder({ orderId: '1', paymentTimestamp: '2026-11-18T08:00:00Z', canceled: true }),
      rawOrder({ orderId: '2', paymentTimestamp: '2026-11-18T08:00:00Z', refundStatus: 'full' }),
    ])
    expect(rows).toEqual([])
  })

  it('Unpaid order, or any units fulfilled: Stays out', async () => {
    const rows = await queueRows([
      rawOrder({ orderId: '1', paymentStatus: 'pending', paymentTimestamp: '2026-11-18T08:00:00Z' }),
      rawOrder({ orderId: '2', paymentTimestamp: '2026-11-18T08:00:00Z', orderedQuantity: 3, fulfilledQuantity: 1 }),
    ])
    expect(rows).toEqual([])
  })

  it('Payment timestamp is invalid: Record is skipped and counted; valid orders still evaluate', async () => {
    const h = createHarness([
      rawOrder({ orderId: '1', paymentTimestamp: 'yesterday' }),
      rawOrder({ orderId: '2', paymentTimestamp: '2026-11-18T08:00:00Z' }),
    ])
    const body = bodyOf(await handleRequest(getQueueEvent(), h.deps))
    expect((body.rows as Row[]).map((r) => r.order.orderId)).toEqual(['2'])
    expect(body.checkedCount).toBe(2)
    const skipped = body.skipped as { orderId: string; reasons: { code: string }[] }[]
    expect(skipped).toHaveLength(1)
    expect(skipped[0].orderId).toBe('1')
    expect(skipped[0].reasons[0].code).toBe('invalid-timestamp')
  })

  it('Operator marks #1042 reviewed and reloads: #1042 remains in Reviewed with its timestamp', async () => {
    const dataset = [rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z', orderedQuantity: 2 })]
    const first = createHarness(dataset)
    const saved = await handleRequest(postReviewEvent({ orderId: '1042', ruleId: 'paid-unfulfilled' }), first.deps)
    expect(saved.statusCode).toBe(201)
    // A fresh handler instance that shares only the store (a reload).
    const second = createHarness(dataset, { db: first.db })
    const rows = bodyOf(await handleRequest(getQueueEvent(), second.deps)).rows as Row[]
    expect(rows).toHaveLength(1)
    expect(rows[0].review).toEqual({ reviewedAt: FIXED_REVIEW_TIME, reviewer: 'lead1' })
  })

  it('Same data evaluated twice: One row per matching order and rule', async () => {
    const h = createHarness(DATASET)
    const a = await handleRequest(getQueueEvent(), h.deps)
    const b = await handleRequest(getQueueEvent(), h.deps)
    expect(a.body).toBe(b.body)
    const ids = (bodyOf(a).rows as Row[]).map((r) => r.order.orderId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(0)
  })

  it('A flagged order is later fulfilled: It leaves the queue after re-evaluation', async () => {
    const before = await queueRows([rawOrder({ orderId: '7', paymentTimestamp: '2026-11-18T08:00:00Z', orderedQuantity: 2 })])
    expect(before.map((r) => r.order.orderId)).toEqual(['7'])
    const after = await queueRows([
      rawOrder({ orderId: '7', paymentTimestamp: '2026-11-18T08:00:00Z', orderedQuantity: 2, fulfilledQuantity: 2 }),
    ])
    expect(after).toEqual([])
  })
})

describe('POST /reviews', () => {
  const dataset = [rawOrder({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z' })]
  const good = { orderId: '1042', ruleId: 'paid-unfulfilled' }

  it('saves a first review and returns HTTP 201 with the review', async () => {
    const h = createHarness(dataset)
    const res = await handleRequest(postReviewEvent(good), h.deps)
    expect(res.statusCode).toBe(201)
    expect(bodyOf(res)).toEqual({ ...good, reviewedAt: FIXED_REVIEW_TIME, reviewer: 'lead1' })
    expect(h.db.writes).toBe(1)
    expect(h.clock.calls()).toBe(1)
  })

  it('takes the reviewer from the token and ignores a reviewer in the body', async () => {
    const h = createHarness(dataset)
    const res = await handleRequest(postReviewEvent({ ...good, reviewer: 'someone-else' }), h.deps)
    expect(bodyOf(res).reviewer).toBe('lead1')
  })

  it('decodes a base64 body', async () => {
    const h = createHarness(dataset)
    const res = await handleRequest(postReviewEvent(good, undefined, { base64: true }), h.deps)
    expect(res.statusCode).toBe(201)
  })

  it('returns 200 with the first timestamp and reviewer for a repeat, and leaves the record unchanged', async () => {
    const h = createHarness(dataset)
    await handleRequest(postReviewEvent(good), h.deps)
    const before = h.db.snapshot()
    const later = createHarness(dataset, { db: h.db, reviewTime: '2026-11-20T13:00:00.000Z' })
    const res = await handleRequest(postReviewEvent(good, leadClaims('lead2')), later.deps)
    expect(res.statusCode).toBe(200)
    expect(bodyOf(res)).toMatchObject({ reviewedAt: FIXED_REVIEW_TIME, reviewer: 'lead1' })
    expect(h.db.snapshot()).toEqual(before)
    expect(h.db.writes).toBe(1)
  })

  it('no authorizer claims: returns 403 with no order data and no write (fails closed)', async () => {
    const h = createHarness(dataset)
    const q = await handleRequest(getQueueEvent(null), h.deps)
    expect(q.statusCode).toBe(403)
    expect(q.body).not.toContain('1042')
    const p = await handleRequest(postReviewEvent(good, null), h.deps)
    expect(p.statusCode).toBe(403)
    expect(h.db.writes).toBe(0)
  })

  it('user outside the lead group: returns 403, no order data, no write', async () => {
    const h = createHarness(dataset)
    const outsider = { username: 'u', 'cognito:groups': '[other]' }
    const q = await handleRequest(getQueueEvent(outsider), h.deps)
    expect(q.statusCode).toBe(403)
    expect(q.body).not.toContain('1042')
    const p = await handleRequest(postReviewEvent(good, outsider), h.deps)
    expect(p.statusCode).toBe(403)
    expect(h.db.writes).toBe(0)
  })

  it('missing username claim: returns 403 and writes nothing', async () => {
    const h = createHarness(dataset)
    const res = await handleRequest(postReviewEvent(good, { 'cognito:groups': '[fulfillment-lead]' }), h.deps)
    expect(res.statusCode).toBe(403)
    expect(h.db.writes).toBe(0)
  })

  const malformed: [string, unknown, boolean][] = [
    ['missing body', null, true],
    ['empty body', '', true],
    ['body that is not JSON', '{nope', true],
    ['body that is not an object', '[1]', true],
    ['missing orderId', { ruleId: 'paid-unfulfilled' }, false],
    ['empty orderId', { orderId: '', ruleId: 'paid-unfulfilled' }, false],
    ['numeric orderId', { orderId: 1042, ruleId: 'paid-unfulfilled' }, false],
    ['missing ruleId', { orderId: '1042' }, false],
    ['empty ruleId', { orderId: '1042', ruleId: '' }, false],
  ]
  for (const [name, body, raw] of malformed) {
    it(`malformed body (${name}): returns 400 and writes nothing`, async () => {
      const h = createHarness(dataset)
      const res = await handleRequest(postReviewEvent(body, undefined, { raw }), h.deps)
      expect(res.statusCode).toBe(400)
      expect(bodyOf(res).error).toMatchObject({ code: 'invalid_request' })
      expect(h.db.writes).toBe(0)
      expect(h.clock.calls()).toBe(0)
    })
  }

  it('names the invalid field in the 400 message', async () => {
    const h = createHarness(dataset)
    const res = await handleRequest(postReviewEvent({ ruleId: 'paid-unfulfilled' }), h.deps)
    expect((bodyOf(res).error as { message: string }).message).toContain('orderId')
  })

  it('wrong rule ID: returns 400 "rule ID is not supported" and writes nothing', async () => {
    const h = createHarness(dataset)
    const res = await handleRequest(postReviewEvent({ orderId: '1042', ruleId: 'other' }), h.deps)
    expect(res.statusCode).toBe(400)
    expect((bodyOf(res).error as { message: string }).message).toBe('rule ID is not supported')
    expect(h.db.writes).toBe(0)
  })

  it('order not in the queue: returns 400 "order is not in the queue" and writes nothing', async () => {
    const h = createHarness(dataset)
    const res = await handleRequest(postReviewEvent({ orderId: '9999', ruleId: 'paid-unfulfilled' }), h.deps)
    expect(res.statusCode).toBe(400)
    expect((bodyOf(res).error as { message: string }).message).toBe('order is not in the queue')
    expect(h.db.writes).toBe(0)
  })

  it('store failure on save: returns the generic 500, logs the cause, and does not report the order as reviewed', async () => {
    const h = createHarness(dataset)
    h.db.failOn.put = true
    const res = await handleRequest(postReviewEvent(good), h.deps)
    expect(res.statusCode).toBe(500)
    expect(res.body).toBe(JSON.stringify({ error: { code: 'internal_error', message: 'The request could not be completed.' } }))
    expect(h.db.writes).toBe(0)
    expect(h.logs).toHaveLength(1)
    expect(JSON.stringify(h.logs[0])).toContain('simulated put failure')
    h.db.failOn.put = false
    const rows = bodyOf(await handleRequest(getQueueEvent(), h.deps)).rows as Row[]
    expect(rows[0].review).toBeNull()
  })
})

describe('routing and failures', () => {
  it('returns 404 for GET /reviews and other routes', async () => {
    const h = createHarness(DATASET)
    for (const [method, path] of [['GET', '/reviews'], ['POST', '/queue'], ['GET', '/'], ['DELETE', '/queue']]) {
      const res = await handleRequest(getQueueEvent(null, { method, path }), h.deps)
      expect(res.statusCode).toBe(404)
      expect(bodyOf(res).error).toMatchObject({ code: 'not_found' })
    }
  })

  it('returns the generic 500 for an invalid configuration without leaking it', async () => {
    const h = createHarness(DATASET, { env: { FULFILLMENT_THRESHOLD_HOURS: 'abc' } })
    const res = await handleRequest(getQueueEvent(), h.deps)
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('abc')
    expect(res.body).not.toContain('FULFILLMENT')
  })

  it('returns the generic 500 and no partial queue when reading reviews fails', async () => {
    const h = createHarness(DATASET)
    h.db.failOn.batchGet = true
    const res = await handleRequest(getQueueEvent(), h.deps)
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('rows')
    expect(h.logs).toHaveLength(1)
  })

  it('omits a stale review from the queue and leaves it stored', async () => {
    const h = createHarness([rawOrder({ orderId: '1', paymentTimestamp: '2026-11-19T12:01:00Z' })])
    h.db.seed({ orderId: '1', ruleId: 'paid-unfulfilled', reviewedAt: FIXED_REVIEW_TIME, reviewer: 'lead1' })
    const rows = bodyOf(await handleRequest(getQueueEvent(), h.deps)).rows as Row[]
    expect(rows).toEqual([])
    expect(h.db.snapshot()).toHaveLength(1)
  })
})
