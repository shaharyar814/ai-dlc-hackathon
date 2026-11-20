import { describe, expect, it } from 'vitest'
import type { FlaggedOrder, ReviewMap, ReviewRecord } from '../types.ts'
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
