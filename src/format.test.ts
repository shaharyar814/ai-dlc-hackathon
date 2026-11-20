import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
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

// ---------------------------------------------------------------------------
// Property tests (fast-check)
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 }

describe('format properties', () => {
  it('Feature: stalled-orders, Property 12: Duration and reason text agree with the elapsed time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 * HOUR }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (elapsedMs, threshold, fulfilled, ordered) => {
          const hours = Math.floor(elapsedMs / HOUR)
          expect(formatHours(elapsedMs)).toBe(`${hours} h`)
          const minutes = Math.floor((elapsedMs % HOUR) / MINUTE)
          expect(formatElapsed(elapsedMs)).toBe(`${hours} h ${minutes} min`)

          const f: FlaggedOrder = {
            order: { ...flagged27h.order, fulfilledQuantity: fulfilled, orderedQuantity: ordered },
            elapsedMs,
          }
          expect(formatReason(f, threshold)).toBe(
            `Paid ${hours} h ago, ${fulfilled} of ${ordered} units fulfilled (threshold ${threshold} h)`,
          )
        },
      ),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 13: UTC timestamps format in UTC regardless of time zone', () => {
    const zones = ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati']
    try {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 4_102_444_800_000 }),
          fc.constantFrom(...zones),
          (ms, zone) => {
            vi.stubEnv('TZ', zone)
            const iso = new Date(ms).toISOString()
            const expected = `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
            expect(formatUtc(ms)).toBe(expected)
            expect(formatUtc(iso)).toBe(expected)
          },
        ),
        RUNS,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

import { formatReviewStatus } from './format.ts'

// Feature: stalled-orders-aws, Property 20: Review status text names the reviewer
describe('formatReviewStatus', () => {
  const reviewedAt = fc
    .integer({ min: 0, max: 4_102_444_800_000 })
    .map((ms) => new Date(ms).toISOString())
  const reviewer = fc.stringMatching(/^[a-z][a-z0-9_.-]{0,15}$/)

  it('Property 20: names the reviewer and the UTC time when a reviewer is present', () => {
    fc.assert(
      fc.property(reviewedAt, reviewer, (at, name) => {
        expect(formatReviewStatus({ reviewedAt: at, reviewer: name }, true)).toBe(
          `Reviewed by ${name} ${formatUtc(at)}`,
        )
        expect(formatReviewStatus({ reviewedAt: at, reviewer: name }, false)).toBe(
          `by ${name} ${formatUtc(at)}`,
        )
      }),
      { numRuns: 200 },
    )
  })

  it('Property 20: returns exactly the Stage A text when there is no reviewer', () => {
    fc.assert(
      fc.property(reviewedAt, (at) => {
        expect(formatReviewStatus({ reviewedAt: at }, true)).toBe(`Reviewed ${formatUtc(at)}`)
        expect(formatReviewStatus({ reviewedAt: at }, false)).toBe(formatUtc(at))
        expect(formatReviewStatus({ reviewedAt: at, reviewer: '' }, false)).toBe(formatUtc(at))
      }),
      { numRuns: 200 },
    )
  })
})
