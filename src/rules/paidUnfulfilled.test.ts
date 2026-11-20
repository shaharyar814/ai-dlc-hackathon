import { describe, expect, it } from 'vitest'
import type { RawOrder } from '../types.ts'
import { evaluate } from './paidUnfulfilled.ts'

const NOW = '2026-11-20T12:00:00Z'
const HOUR = 3_600_000
const MINUTE = 60_000
const NOW_MS = Date.UTC(2026, 10, 20, 12)

function paidAgo(ms: number): string {
  return new Date(NOW_MS - ms).toISOString()
}

function order(overrides: Record<string, unknown> = {}): RawOrder {
  return {
    orderId: '1',
    paymentStatus: 'paid',
    paymentTimestamp: paidAgo(30 * HOUR),
    canceled: false,
    refundStatus: 'none',
    orderedQuantity: 1,
    fulfilledQuantity: 0,
    ...overrides,
  }
}

function run(orders: readonly RawOrder[]) {
  return evaluate(orders, NOW, 24)
}

describe('evaluate: BRD success table', () => {
  it('Paid 23 hours 59 minutes ago, zero fulfilled: Stays out of the queue', () => {
    const result = run([order({ paymentTimestamp: paidAgo(24 * HOUR - MINUTE) })])
    expect(result.flagged).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it('Paid exactly 24 hours ago, zero fulfilled: Appears in Open', () => {
    const result = run([order({ paymentTimestamp: paidAgo(24 * HOUR) })])
    expect(result.flagged).toHaveLength(1)
    expect(result.flagged[0].elapsedMs).toBe(24 * HOUR)
  })

  it('Order #1042, paid 27 hours ago, 0 of 2 fulfilled: Appears with elapsed time, reason, and suggested action', () => {
    const result = run([
      order({ orderId: '1042', paymentTimestamp: '2026-11-19T09:00:00Z', orderedQuantity: 2 }),
    ])
    expect(result.flagged).toHaveLength(1)
    const [f] = result.flagged
    expect(f.order.orderId).toBe('1042')
    expect(f.elapsedMs).toBe(27 * HOUR)
    expect(f.order.orderedQuantity).toBe(2)
    expect(f.order.fulfilledQuantity).toBe(0)
  })

  it('Paid more than 24 hours ago, canceled or fully refunded: Stays out, even when payment status still reads paid', () => {
    const result = run([
      order({ orderId: 'a', canceled: true }),
      order({ orderId: 'b', refundStatus: 'full' }),
    ])
    expect(result.flagged).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it('Unpaid order, or any units fulfilled: Stays out', () => {
    const result = run([
      order({ orderId: 'a', paymentStatus: 'pending' }),
      order({ orderId: 'b', orderedQuantity: 3, fulfilledQuantity: 1 }),
    ])
    expect(result.flagged).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it('Payment timestamp is invalid: Record is skipped and counted; valid orders still evaluate', () => {
    const result = run([
      order({ orderId: 'bad', paymentTimestamp: 'yesterday' }),
      order({ orderId: 'good' }),
    ])
    expect(result.skipped.map((s) => s.orderId)).toEqual(['bad'])
    expect(result.flagged.map((f) => f.order.orderId)).toEqual(['good'])
    expect(result.checkedCount).toBe(2)
  })

  it('Same data evaluated twice: One row per matching order and rule', () => {
    const data = [order({ orderId: '1' }), order({ orderId: '2' }), order({ orderId: 'x', canceled: 3 })]
    const first = run(data)
    const second = run(data)
    expect(second).toEqual(first)
    const ids = second.flagged.map((f) => f.order.orderId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('A flagged order is later fulfilled: It leaves the queue after re-evaluation', () => {
    expect(run([order({ orderId: '7' })]).flagged).toHaveLength(1)
    const after = run([order({ orderId: '7', orderedQuantity: 2, fulfilledQuantity: 2 })])
    expect(after.flagged).toHaveLength(0)
  })
})

describe('evaluate: other behavior', () => {
  it('flags a partially refunded order', () => {
    expect(run([order({ refundStatus: 'partial' })]).flagged).toHaveLength(1)
  })

  it('normalizes payment status with trim and lowercase', () => {
    expect(run([order({ paymentStatus: ' PAID ' })]).flagged).toHaveLength(1)
  })

  it('excludes a valid unpaid order without skipping it', () => {
    const result = run([order({ paymentStatus: 'pending' })])
    expect(result.flagged).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it('keeps the first record for a duplicate ID and skips the later one', () => {
    const result = run([
      order({ orderId: '5', orderedQuantity: 1 }),
      order({ orderId: '5', orderedQuantity: 9 }),
    ])
    expect(result.flagged).toHaveLength(1)
    expect(result.flagged[0].order.orderedQuantity).toBe(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]).toMatchObject({ orderId: '5', index: 1 })
    expect(result.skipped[0].reasons[0].code).toBe('duplicate-order-id')
  })

  it('keeps a later valid record when the first record with that ID is invalid', () => {
    const result = run([
      order({ orderId: '5', paymentTimestamp: 'nope' }),
      order({ orderId: '5' }),
    ])
    expect(result.flagged.map((f) => f.order.orderId)).toEqual(['5'])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].index).toBe(0)
  })

  it('does not let a skipped record change the result for other records', () => {
    const valid = [order({ orderId: '1' }), order({ orderId: '2', canceled: true })]
    const withBad = [valid[0], order({ orderId: '3', orderedQuantity: -1 }), valid[1]]
    expect(run(withBad).flagged).toEqual(run(valid).flagged)
  })

  it('records a null orderId for a record without an ID', () => {
    const raw: Record<string, unknown> = { ...order() }
    delete raw.orderId
    expect(run([raw]).skipped[0].orderId).toBeNull()
  })

  it('handles an empty dataset', () => {
    expect(run([])).toEqual({ flagged: [], skipped: [], checkedCount: 0 })
  })

  it('throws RangeError for an unparsable evaluation time', () => {
    expect(() => evaluate([], 'not a time', 24)).toThrow(RangeError)
  })

  it('sorts flagged orders by earliest payment, then natural ID', () => {
    const result = run([
      order({ orderId: '1042', paymentTimestamp: paidAgo(27 * HOUR) }),
      order({ orderId: '998', paymentTimestamp: paidAgo(27 * HOUR) }),
      order({ orderId: '5', paymentTimestamp: paidAgo(50 * HOUR) }),
    ])
    expect(result.flagged.map((f) => f.order.orderId)).toEqual(['5', '998', '1042'])
  })
})
