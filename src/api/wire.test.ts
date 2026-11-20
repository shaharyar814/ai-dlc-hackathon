import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { reviewKey } from '../rules/queue.ts'
import type { Order, SkipCode, SkippedRecord } from '../types.ts'
import {
  decodeQueueResponse,
  encodeQueueResponse,
  toFlaggedOrders,
  toReviewMap,
  WireFormatError,
  type QueueResponse,
} from './wire.ts'

const orderArb: fc.Arbitrary<Order> = fc.record({
  orderId: fc.string({ minLength: 1 }),
  paymentStatus: fc.string(),
  paidAtMs: fc.integer({ min: 0, max: 4_000_000_000_000 }),
  paidAt: fc.string(),
  canceled: fc.boolean(),
  refundStatus: fc.constantFrom('none', 'partial', 'full'),
  orderedQuantity: fc.integer({ min: 0, max: 1000 }),
  fulfilledQuantity: fc.integer({ min: 0, max: 1000 }),
})

const codeArb = fc.constantFrom<SkipCode>(
  'missing-field',
  'invalid-timestamp',
  'future-timestamp',
  'invalid-quantity',
  'invalid-refund-status',
  'duplicate-order-id',
)

const reasonArb = fc.oneof(
  fc.record({ code: codeArb, message: fc.string() }),
  fc.record({ code: codeArb, field: fc.string(), message: fc.string() }),
)

const skippedArb: fc.Arbitrary<SkippedRecord> = fc.record({
  orderId: fc.option(fc.string(), { nil: null }),
  index: fc.nat(1000),
  reasons: fc.array(reasonArb, { minLength: 1, maxLength: 3 }),
})

const rowArb = fc.record({
  order: orderArb,
  elapsedMs: fc.nat(1_000_000_000),
  review: fc.option(fc.record({ reviewedAt: fc.string(), reviewer: fc.string({ minLength: 1 }) }), { nil: null }),
})

const responseArb: fc.Arbitrary<QueueResponse> = fc.record({
  ruleId: fc.string({ minLength: 1 }),
  evaluationTime: fc.string(),
  thresholdHours: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
  checkedCount: fc.nat(10000),
  rows: fc.array(rowArb, { maxLength: 6 }),
  skipped: fc.array(skippedArb, { maxLength: 4 }),
})

// Feature: stalled-orders-aws, Property 16: Wire format round trip
describe('Property 16: Wire format round trip', () => {
  it('decodes the JSON text of any valid response to an equal value', () => {
    fc.assert(
      fc.property(responseArb, (response) => {
        const text = JSON.stringify(response)
        expect(decodeQueueResponse(JSON.parse(text))).toEqual(response)
      }),
      { numRuns: 200 },
    )
  })

  it('fails with a typed error for a value that is not a valid response', () => {
    const base = { ruleId: 'r', evaluationTime: 't', thresholdHours: 24, checkedCount: 0, rows: [], skipped: [] }
    const broken = fc.oneof(
      fc.anything().filter((v) => typeof v !== 'object' || v === null || Array.isArray(v)),
      fc.constantFrom('ruleId', 'evaluationTime', 'thresholdHours', 'checkedCount', 'rows', 'skipped').map((k) => {
        const copy: Record<string, unknown> = { ...base }
        delete copy[k]
        return copy
      }),
      fc.constantFrom('ruleId', 'thresholdHours', 'rows', 'skipped').map((k) => ({ ...base, [k]: { bad: true } })),
      fc.constant({ ...base, rows: [{ order: {}, elapsedMs: 1, review: null }] }),
      fc.constant({ ...base, rows: [null] }),
      fc.constant({ ...base, skipped: [{ orderId: null, index: 0, reasons: [] }] }),
      fc.constant({ ...base, thresholdHours: Number.NaN }),
    )
    fc.assert(
      fc.property(broken, (value) => {
        expect(() => decodeQueueResponse(value)).toThrow(WireFormatError)
      }),
      { numRuns: 200 },
    )
  })
})

describe('encodeQueueResponse and mapping helpers', () => {
  const order: Order = {
    orderId: '1042',
    paymentStatus: 'paid',
    paidAtMs: 1_000,
    paidAt: '2026-11-19T00:00:00Z',
    canceled: false,
    refundStatus: 'none',
    orderedQuantity: 2,
    fulfilledQuantity: 0,
  }
  const encoded = encodeQueueResponse({
    ruleId: 'paid-unfulfilled',
    evaluationTime: '2026-11-20T12:00:00Z',
    thresholdHours: 24,
    result: { flagged: [{ order, elapsedMs: 5 }], skipped: [], checkedCount: 3 },
    reviews: new Map([
      [reviewKey('1042', 'paid-unfulfilled'), { reviewedAt: '2026-11-20T12:05:00.000Z', reviewer: 'lead1' }],
    ]),
  })

  it('places the review on the matching row', () => {
    expect(encoded.rows[0].review).toEqual({ reviewedAt: '2026-11-20T12:05:00.000Z', reviewer: 'lead1' })
    expect(encoded.checkedCount).toBe(3)
  })
  it('maps rows to flagged orders and reviews to a ReviewMap', () => {
    const decoded = decodeQueueResponse(JSON.parse(JSON.stringify(encoded)))
    expect(toFlaggedOrders(decoded)).toEqual([{ order, elapsedMs: 5 }])
    expect(toReviewMap(decoded).get(reviewKey('1042', 'paid-unfulfilled'))).toEqual({
      orderId: '1042',
      ruleId: 'paid-unfulfilled',
      reviewedAt: '2026-11-20T12:05:00.000Z',
      reviewer: 'lead1',
    })
  })
})
