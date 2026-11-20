import { describe, expect, it } from 'vitest'
import {
  formatCounts,
  formatElapsed,
  formatHours,
  formatOrderId,
  formatReason,
  formatUtc,
} from './format.ts'
import type { FlaggedOrder } from './types.ts'

const HOUR = 3_600_000
const MINUTE = 60_000

const flagged27h: FlaggedOrder = {
  order: {
    orderId: '1042',
    paymentStatus: 'paid',
    paidAtMs: Date.UTC(2026, 10, 19, 9),
    paidAt: '2026-11-19T09:00:00Z',
    canceled: false,
    refundStatus: 'none',
    orderedQuantity: 2,
    fulfilledQuantity: 0,
  },
  elapsedMs: 27 * HOUR,
}

describe('format', () => {
  it('formatHours rounds down to whole hours', () => {
    expect(formatHours(27 * HOUR)).toBe('27 h')
    expect(formatHours(27 * HOUR - MINUTE)).toBe('26 h')
  })
  it('formatElapsed shows hours and minutes', () => {
    expect(formatElapsed(27 * HOUR)).toBe('27 h 0 min')
    expect(formatElapsed(5 * MINUTE)).toBe('0 h 5 min')
  })
  it('formatReason describes the order', () => {
    expect(formatReason(flagged27h, 24)).toBe(
      'Paid 27 h ago, 0 of 2 units fulfilled (threshold 24 h)',
    )
  })
  it('formatUtc drops seconds and appends UTC', () => {
    expect(formatUtc('2026-11-20T12:05:31.000Z')).toBe('2026-11-20 12:05 UTC')
    expect(formatUtc(Date.UTC(2026, 0, 2, 3, 4))).toBe('2026-01-02 03:04 UTC')
  })
  it('formatOrderId adds a # prefix', () => {
    expect(formatOrderId('1042')).toBe('#1042')
  })
  it('formatCounts joins checked and skipped', () => {
    expect(formatCounts(20, 3)).toBe('20 checked, 3 skipped')
    expect(formatCounts(0, 0)).toBe('0 checked, 0 skipped')
  })
})
