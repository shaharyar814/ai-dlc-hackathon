import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
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

// ---------------------------------------------------------------------------
// Property tests (fast-check)
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 }
const FIELDS = [
  'orderId',
  'paymentStatus',
  'paymentTimestamp',
  'canceled',
  'refundStatus',
  'orderedQuantity',
  'fulfilledQuantity',
] as const

// Elapsed times in ms, biased to the boundaries for a given threshold.
function elapsedArb(thresholdHours: number): fc.Arbitrary<number> {
  return fc.oneof(
    fc.constant(thresholdHours * HOUR),
    fc.constant(thresholdHours * HOUR - MINUTE),
    fc.constant(0),
    fc.integer({ min: 0, max: 100 * 60 }).map((m) => m * MINUTE),
  )
}

const statusArb = fc.constantFrom('paid', ' PAID ', 'Paid', 'pending', 'refunded', 'voided')

function validRecordArb(
  idArb: fc.Arbitrary<string>,
  thresholdHours: number,
): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .record({
      orderId: idArb,
      paymentStatus: statusArb,
      elapsed: elapsedArb(thresholdHours),
      canceled: fc.boolean(),
      refundStatus: fc.constantFrom('none', 'partial', 'full'),
      fulfilledQuantity: fc.integer({ min: 0, max: 2 }),
      extra: fc.integer({ min: 0, max: 3 }),
    })
    .map((r) => ({
      orderId: r.orderId,
      paymentStatus: r.paymentStatus,
      paymentTimestamp: paidAgo(r.elapsed),
      canceled: r.canceled,
      refundStatus: r.refundStatus,
      orderedQuantity: r.fulfilledQuantity + r.extra,
      fulfilledQuantity: r.fulfilledQuantity,
    }))
}

// One optional defect per field; the value `REMOVE` deletes the field.
const REMOVE = Symbol('remove')
const defectArbs: Record<(typeof FIELDS)[number], fc.Arbitrary<unknown>> = {
  orderId: fc.constantFrom(REMOVE, '', '   ', 42),
  paymentStatus: fc.constantFrom(REMOVE, '', null),
  paymentTimestamp: fc.constantFrom(
    REMOVE,
    null,
    '',
    'yesterday',
    '2026-02-30T00:00:00Z',
    '2026-11-20T12:00:00',
    '2026-11-20T12:00:01Z',
    '2026-11-21T00:00:00Z',
  ),
  canceled: fc.constantFrom(REMOVE, null, 'no', 0),
  refundStatus: fc.constantFrom(REMOVE, 'maybe', '', 7),
  orderedQuantity: fc.constantFrom(REMOVE, -1, 1.5, 'two', '', null),
  fulfilledQuantity: fc.constantFrom(REMOVE, -1, 1.5, 'two', '', null),
}

const defectsArb = fc
  .record(
    Object.fromEntries(
      FIELDS.map((f) => [f, fc.option(defectArbs[f], { nil: undefined, freq: 3 })]),
    ) as Record<(typeof FIELDS)[number], fc.Arbitrary<unknown>>,
  )
  .filter((d) => FIELDS.some((f) => d[f] !== undefined))

function applyDefects(
  base: Record<string, unknown>,
  defects: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...base }
  for (const f of FIELDS) {
    const d = defects[f]
    if (d === undefined) continue
    if (d === REMOVE) delete copy[f]
    else copy[f] = d
  }
  return copy
}

const smallIdArb = fc.constantFrom('1', '2', '3', '10', '0010')
const malformedArb = fc
  .tuple(validRecordArb(smallIdArb, 24), defectsArb)
  .map(([base, defects]) => applyDefects(base, defects))
const mixedArrayArb = fc.array(
  fc.oneof({ weight: 3, arbitrary: validRecordArb(smallIdArb, 24) }, malformedArb),
  { maxLength: 12 },
)

describe('evaluate: properties', () => {
  it('Feature: stalled-orders, Property 1: Evaluation is deterministic and does not mutate its input', () => {
    fc.assert(
      fc.property(
        mixedArrayArb,
        fc.integer({ min: 0, max: 72 }),
        (orders, threshold) => {
          const clone = structuredClone(orders)
          const first = evaluate(orders, NOW, threshold)
          const second = evaluate(orders, NOW, threshold)
          expect(second).toEqual(first)
          expect(orders).toEqual(clone)
        },
      ),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 2: The flag decision matches the rule', () => {
    const arb = fc.integer({ min: 1, max: 72 }).chain((threshold) =>
      fc
        .array(validRecordArb(fc.constant('x'), threshold), { maxLength: 12 })
        .map((records) => ({
          threshold,
          // unique IDs by position
          records: records.map((r, i): Record<string, unknown> => ({ ...r, orderId: `id-${i}` })),
        })),
    )
    fc.assert(
      fc.property(arb, ({ threshold, records }) => {
        const result = evaluate(records, NOW, threshold)
        const flaggedIds = new Set(result.flagged.map((f) => f.order.orderId))
        for (const r of records) {
          const elapsed = NOW_MS - Date.parse(r.paymentTimestamp as string)
          const expected =
            (r.paymentStatus as string).trim().toLowerCase() === 'paid' &&
            elapsed >= threshold * HOUR &&
            r.fulfilledQuantity === 0 &&
            r.canceled === false &&
            r.refundStatus !== 'full'
          expect(flaggedIds.has(r.orderId as string)).toBe(expected)
        }
        expect(result.skipped).toHaveLength(0)
      }),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 3: Invalid records are skipped once, with a reason per defect', () => {
    const arb = fc.array(
      fc.tuple(validRecordArb(fc.constant('1'), 24), defectsArb),
      { minLength: 1, maxLength: 8 },
    )
    fc.assert(
      fc.property(arb, (pairs) => {
        const records = pairs.map(([base, defects]) => applyDefects(base, defects))
        const result = evaluate(records, NOW, 24)
        expect(result.flagged).toHaveLength(0)
        expect(result.skipped).toHaveLength(records.length)
        expect(result.checkedCount).toBe(records.length)
        pairs.forEach(([, defects], i) => {
          const skipped = result.skipped[i]
          expect(skipped.index).toBe(i)
          for (const f of FIELDS) {
            if (defects[f] === undefined) continue
            expect(skipped.reasons.some((r) => r.field === f)).toBe(true)
            if (defects[f] === REMOVE) {
              expect(
                skipped.reasons.some((r) => r.code === 'missing-field' && r.field === f),
              ).toBe(true)
            }
          }
        })
      }),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 4: Skipped records do not affect other records', () => {
    fc.assert(
      fc.property(mixedArrayArb, (orders) => {
        const result = evaluate(orders, NOW, 24)
        const skippedIdx = new Set(result.skipped.map((s) => s.index))
        const kept = orders.filter((_, i) => !skippedIdx.has(i))
        expect(evaluate(kept, NOW, 24).flagged).toEqual(result.flagged)
      }),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 5: Duplicate IDs keep the first, and flagged IDs are unique', () => {
    fc.assert(
      fc.property(
        mixedArrayArb,
        validRecordArb(smallIdArb, 24),
        validRecordArb(fc.constant('dup'), 24),
        validRecordArb(fc.constant('dup'), 24),
        (orders, first, a, b) => {
          const flaggedIds = evaluate(orders, NOW, 24).flagged.map((f) => f.order.orderId)
          expect(new Set(flaggedIds).size).toBe(flaggedIds.length)

          const dupFirst = { ...a, orderId: first.orderId }
          const input = [first, ...orders.slice(0, 2), dupFirst, b]
          const result = evaluate(input, NOW, 24)
          const laterIdx = 1 + Math.min(2, orders.length)
          const skipped = result.skipped.find((s) => s.index === laterIdx)
          expect(skipped?.reasons.map((r) => r.code)).toContain('duplicate-order-id')
          // The first record is evaluated exactly as it would be on its own.
          const alone = evaluate([first], NOW, 24).flagged.length
          const inResult = result.flagged.filter(
            (f) => f.order.orderId === first.orderId && f.order.paidAt === first.paymentTimestamp,
          ).length
          expect(inResult).toBe(alone)
        },
      ),
      RUNS,
    )
  })
})
