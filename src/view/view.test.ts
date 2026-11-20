import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { formatElapsed, formatHours } from '../format.ts'
import type { QueueRow } from '../rules/queue.ts'
import type { SkippedRecord } from '../types.ts'
import { ageTier, wholeHours } from './age.ts'
import { progressFraction } from './progress.ts'
import { groupSkippedByReason, skippedLabel } from './skipped.ts'
import { formatLongestWait, summarize } from './summary.ts'
import { documentTitle } from './title.ts'

const NUM_RUNS = 100
const HOUR = 3_600_000
const MINUTE = 60_000
const LATE_MAX = 48 * HOUR - MINUTE // 47 h 59 min
const VERY_LATE_MIN = 48 * HOUR // 48 h 0 min

const elapsedArb = fc.oneof(
  fc.integer({ min: 0, max: 400 * HOUR }),
  fc.constantFrom(LATE_MAX, VERY_LATE_MIN, LATE_MAX + 1, VERY_LATE_MIN - 1, VERY_LATE_MIN + 1, 0),
)

function row(elapsedMs: number): QueueRow {
  return {
    flagged: {
      elapsedMs,
      order: {
        orderId: 'x',
        paymentStatus: 'paid',
        paidAtMs: 0,
        paidAt: '2026-11-19T09:00:00Z',
        canceled: false,
        refundStatus: 'none',
        orderedQuantity: 1,
        fulfilledQuantity: 0,
      },
    },
    review: null,
  }
}

describe('view functions', () => {
  // Feature: ui-redesign, Property 5: Age tier classification
  // **Validates: Requirements 6.4, 6.5, 6.6**
  it('Property 5: Age tier classification', () => {
    fc.assert(
      fc.property(elapsedArb, (ms) => {
        const hours = Math.floor(ms / HOUR)
        expect(wholeHours(ms)).toBe(hours)
        expect(formatHours(ms)).toBe(`${hours} h`)
        expect(ageTier(ms)).toBe(hours < 48 ? 'late' : 'very-late')
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('Property 5 boundaries: 47 h 59 min is late, 48 h 0 min is very late', () => {
    fc.assert(
      fc.property(fc.constantFrom(LATE_MAX, VERY_LATE_MIN), (ms) => {
        expect(ageTier(ms)).toBe(ms === LATE_MAX ? 'late' : 'very-late')
      }),
      { numRuns: NUM_RUNS },
    )
    expect(ageTier(LATE_MAX)).toBe('late')
    expect(ageTier(VERY_LATE_MIN)).toBe('very-late')
  })

  // Feature: ui-redesign, Property 7: Longest wait
  // **Validates: Requirements 4.5, 4.6**
  it('Property 7: Longest wait', () => {
    fc.assert(
      fc.property(fc.array(elapsedArb, { maxLength: 20 }), (list) => {
        const s = summarize(list.map(row), [], [])
        if (list.length === 0) {
          expect(s.longestWaitHours).toBeNull()
          expect(formatLongestWait(s.longestWaitHours)).toBe('—')
        } else {
          const max = Math.max(...list.map((ms) => Math.floor(ms / HOUR)))
          expect(s.longestWaitHours).toBe(max)
          expect(formatLongestWait(s.longestWaitHours)).toBe(`${max} h`)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: ui-redesign, Property 10: Evidence formatting and progress
  // **Validates: Requirements 8.2**
  it('Property 10: Evidence formatting and progress', () => {
    fc.assert(
      fc.property(
        elapsedArb,
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (ms, fulfilled, ordered) => {
          const m = /^(\d+) h (\d+) min$/.exec(formatElapsed(ms))
          expect(m).not.toBeNull()
          const n = Number(m![1])
          const min = Number(m![2])
          expect(n).toBe(Math.floor(ms / HOUR))
          expect(min).toBeGreaterThanOrEqual(0)
          expect(min).toBeLessThanOrEqual(59)
          expect(n * 60 + min).toBe(Math.floor(ms / MINUTE))

          const p = progressFraction(fulfilled, ordered)
          expect(p).toBeGreaterThanOrEqual(0)
          expect(p).toBeLessThanOrEqual(1)
          if (ordered === 0) expect(p).toBe(0)
          else expect(p).toBe(Math.min(1, Math.max(0, fulfilled / ordered)))
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: ui-redesign, Property 12: Skipped grouping by reason
  // **Validates: Requirements 9.1, 9.2, 9.3, 9.7, 9.8**
  it('Property 12: Skipped grouping by reason', () => {
    const messageArb = fc.constantFrom<string[]>('Missing field: paidAt', 'Invalid quantity', 'Duplicate order ID 1', 'Future timestamp')
    const recordArb = fc.record({
      orderId: fc.option(fc.constantFrom('1', '2', ''), { nil: null }),
      reasons: fc.array(messageArb, { minLength: 1, maxLength: 4 }),
    })
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 15 }), (recs) => {
        const skipped: SkippedRecord[] = recs.map((r, index) => ({
          orderId: r.orderId,
          index,
          reasons: r.reasons.map((message) => ({ code: 'missing-field' as const, message })),
        }))
        const groups = groupSkippedByReason(skipped)
        const allMessages = new Set(recs.flatMap((r) => r.reasons))
        let total = 0
        for (const g of groups) {
          expect(g.entries.length).toBeGreaterThan(0)
          expect(allMessages.has(g.reason)).toBe(true)
          const expected = skipped
            .map((s, i) => (recs[i].reasons.includes(g.reason) ? s.index : -1))
            .filter((i) => i >= 0)
          expect(g.entries.map((e) => e.index)).toEqual(expected)
          total += g.entries.length
        }
        expect(new Set(groups.map((g) => g.reason)).size).toBe(groups.length)
        expect(total).toBe(recs.reduce((sum, r) => sum + new Set(r.reasons).size, 0))
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: ui-redesign, Property 13: Skipped label
  // **Validates: Requirements 9.4**
  it('Property 13: Skipped label', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (id) => {
        expect(skippedLabel(id)).toBe(id === null || id === '' ? '(no ID)' : id)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: ui-redesign, Property 4 (function part): document title
  // **Validates: Requirements 3.3**
  it('Property 4 (function part): documentTitle appends the product name', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        expect(documentTitle(name)).toBe(name + ' - Fulfillment Watch')
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
