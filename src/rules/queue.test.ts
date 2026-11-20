import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { FlaggedOrder, ReviewMap, ReviewRecord } from '../types.ts'
import { evaluate } from './paidUnfulfilled.ts'
import { buildQueue, compareFlagged, compareOrderIds, reviewKey } from './queue.ts'

function flagged(orderId: string, paidAtMs: number): FlaggedOrder {
  return {
    order: {
      orderId,
      paymentStatus: 'paid',
      paidAtMs,
      paidAt: new Date(paidAtMs).toISOString(),
      canceled: false,
      refundStatus: 'none',
      orderedQuantity: 1,
      fulfilledQuantity: 0,
    },
    elapsedMs: 0,
  }
}

const RULE = 'paid-unfulfilled'

function review(orderId: string, reviewedAt: string): ReviewRecord {
  return { orderId, ruleId: RULE, reviewedAt }
}

function mapOf(...records: ReviewRecord[]): ReviewMap {
  return new Map(records.map((r) => [reviewKey(r.orderId, r.ruleId), r]))
}

describe('compareOrderIds', () => {
  it('sorts 998 before 1042', () => {
    expect(compareOrderIds('998', '1042')).toBeLessThan(0)
    expect(compareOrderIds('1042', '998')).toBeGreaterThan(0)
  })
  it('treats 0042 as numeric 42 and falls back to text order', () => {
    expect(compareOrderIds('0042', '43')).toBeLessThan(0)
    expect(compareOrderIds('0042', '42')).toBeLessThan(0)
    expect(compareOrderIds('42', '0042')).toBeGreaterThan(0)
  })
  it('compares non-digit IDs as text', () => {
    expect(compareOrderIds('A-2', 'A-10')).toBeGreaterThan(0)
    expect(compareOrderIds('A-1', 'A-1')).toBe(0)
  })
  it('puts an all-digit ID before a mixed one so the order stays transitive', () => {
    expect(compareOrderIds('9', '10')).toBeLessThan(0)
    expect(compareOrderIds('10', '1a')).toBeLessThan(0)
    expect(compareOrderIds('9', '1a')).toBeLessThan(0)
    expect(compareOrderIds('1', '0:')).toBeLessThan(0)
    expect(compareOrderIds('02', '0:')).toBeLessThan(0)
  })
  it('compares very long digit IDs without precision loss', () => {
    expect(compareOrderIds('9007199254740993', '9007199254740992')).toBeGreaterThan(0)
  })
})

describe('compareFlagged', () => {
  it('sorts by earlier payment first', () => {
    expect(compareFlagged(flagged('2', 100), flagged('1', 200))).toBeLessThan(0)
  })
  it('breaks equal timestamps by natural order ID', () => {
    expect(compareFlagged(flagged('1042', 100), flagged('998', 100))).toBeGreaterThan(0)
    expect(compareFlagged(flagged('998', 100), flagged('998', 100))).toBe(0)
  })
})

describe('reviewKey', () => {
  it('does not collide when an ID contains a delimiter', () => {
    expect(reviewKey('a|b', 'c')).not.toBe(reviewKey('a', 'b|c'))
    expect(reviewKey('a:b', 'c')).not.toBe(reviewKey('a', 'b:c'))
  })
})

describe('buildQueue', () => {
  const a = flagged('1', 100)
  const b = flagged('2', 200)
  const c = flagged('3', 300)

  it('splits open and reviewed and keeps input order', () => {
    const r = review('2', '2026-11-20T12:05:00.000Z')
    const { open, reviewed } = buildQueue([a, b, c], mapOf(r), RULE)
    expect(open.map((x) => x.flagged.order.orderId)).toEqual(['1', '3'])
    expect(reviewed.map((x) => x.flagged.order.orderId)).toEqual(['2'])
  })
  it('carries the original review timestamp on the row', () => {
    const r = review('2', '2026-11-20T12:05:00.000Z')
    const { reviewed } = buildQueue([b], mapOf(r), RULE)
    expect(reviewed[0].review).toBe(r)
  })
  it('ignores a review for an unflagged order and leaves the map unchanged', () => {
    const reviews = mapOf(review('99', '2026-11-20T12:05:00.000Z'))
    const before = [...reviews.entries()]
    const { open, reviewed } = buildQueue([a], reviews, RULE)
    expect(open).toHaveLength(1)
    expect(reviewed).toHaveLength(0)
    expect([...reviews.entries()]).toEqual(before)
  })
  it('returns an order to Reviewed when it matches again', () => {
    const reviews = mapOf(review('1', '2026-11-20T12:05:00.000Z'))
    expect(buildQueue([], reviews, RULE).reviewed).toHaveLength(0)
    const again = buildQueue([a], reviews, RULE)
    expect(again.reviewed[0].review?.reviewedAt).toBe('2026-11-20T12:05:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Property tests (fast-check)
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 }
const HOUR = 3_600_000
const EVAL_TIME = '2026-11-20T12:00:00Z'
const EVAL_MS = Date.UTC(2026, 10, 20, 12)

const sign = (n: number): number => Math.sign(n) || 0

const digitIdArb = fc.stringMatching(/^[0-9]{1,25}$/)
const anyIdArb = fc.oneof(digitIdArb, fc.string({ maxLength: 6 }), fc.constantFrom('A-1', 'A-10', 'A-2', '9', '10', '1a'))

describe('queue properties', () => {
  it('Feature: stalled-orders, Property 6: Queue order is earliest payment first, then natural ID', () => {
    const recordArb = fc.record({
      orderId: fc.oneof(digitIdArb, fc.string({ minLength: 1, maxLength: 4 })),
      // few distinct payment times so that ties are common
      hoursAgo: fc.constantFrom(24, 25, 30, 100),
    })
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 15 }), (records) => {
        const raw = records.map((r) => ({
          orderId: r.orderId,
          paymentStatus: 'paid',
          paymentTimestamp: new Date(EVAL_MS - r.hoursAgo * HOUR).toISOString(),
          canceled: false,
          refundStatus: 'none',
          orderedQuantity: 1,
          fulfilledQuantity: 0,
        }))
        const { flagged } = evaluate(raw, EVAL_TIME, 24)
        for (let i = 1; i < flagged.length; i++) {
          const prev = flagged[i - 1].order
          const next = flagged[i].order
          expect(prev.paidAtMs).toBeLessThanOrEqual(next.paidAtMs)
          if (prev.paidAtMs === next.paidAtMs) {
            expect(compareOrderIds(prev.orderId, next.orderId)).toBeLessThanOrEqual(0)
          }
        }
      }),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 7: Order ID comparison is a consistent total order', () => {
    fc.assert(
      fc.property(anyIdArb, anyIdArb, anyIdArb, (a, b, c) => {
        expect(sign(compareOrderIds(a, b))).toBe(-sign(compareOrderIds(b, a)) || 0)
        expect(compareOrderIds(a, b) === 0).toBe(a === b)
        if (compareOrderIds(a, b) <= 0 && compareOrderIds(b, c) <= 0) {
          expect(compareOrderIds(a, c)).toBeLessThanOrEqual(0)
        }
      }),
      RUNS,
    )
    fc.assert(
      fc.property(digitIdArb, digitIdArb, (a, b) => {
        const na = BigInt(a)
        const nb = BigInt(b)
        if (na !== nb) {
          expect(sign(compareOrderIds(a, b))).toBe(na < nb ? -1 : 1)
        }
      }),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 8: The queue partitions flagged orders by saved review', () => {
    const arb = fc
      .uniqueArray(fc.string({ minLength: 1, maxLength: 5 }), { maxLength: 10 })
      .chain((ids) =>
        fc.record({
          ids: fc.constant(ids),
          reviewedIds: fc.subarray(ids),
          strayIds: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 5 }).map((s) => `stray-${s}`), {
            maxLength: 4,
          }),
        }),
      )
    fc.assert(
      fc.property(arb, ({ ids, reviewedIds, strayIds }) => {
        const list = ids.map((id, i) => flagged(id, 1000 + i))
        const records = [...reviewedIds, ...strayIds].map((id, i) =>
          review(id, `2026-11-20T12:0${i % 10}:00.000Z`),
        )
        const reviews = mapOf(...records)
        const before = [...reviews.entries()]
        const { open, reviewed } = buildQueue(list, reviews, RULE)

        expect(open.length + reviewed.length).toBe(list.length)
        expect(reviewed.map((r) => r.flagged.order.orderId)).toEqual(
          ids.filter((id) => reviewedIds.includes(id)),
        )
        expect(open.map((r) => r.flagged.order.orderId)).toEqual(
          ids.filter((id) => !reviewedIds.includes(id)),
        )
        for (const row of reviewed) {
          expect(row.review).toBe(reviews.get(reviewKey(row.flagged.order.orderId, RULE)))
        }
        for (const row of open) expect(row.review).toBeNull()
        expect([...reviews.entries()]).toEqual(before)

        // Stray reviews appear in neither list, and return when the order matches again.
        const withStray = strayIds.map((id) => flagged(id, 5000))
        const again = buildQueue([...list, ...withStray], reviews, RULE)
        for (const f of withStray) {
          const row = again.reviewed.find((r) => r.flagged.order.orderId === f.order.orderId)
          expect(row?.review).toBe(reviews.get(reviewKey(f.order.orderId, RULE)))
        }
      }),
      RUNS,
    )
  })
})
