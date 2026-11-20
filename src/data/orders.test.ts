import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME } from '../config.ts'
import { formatCounts, formatElapsed } from '../format.ts'
import { evaluate } from '../rules/paidUnfulfilled.ts'
import { DATASET } from './orders.ts'

const result = evaluate(DATASET, EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS)
const flaggedIds = result.flagged.map((f) => f.order.orderId)
const skippedIds = result.skipped.map((s) => s.orderId)

describe('bundled dataset', () => {
  it('has between 12 and 20 records', () => {
    expect(DATASET.length).toBeGreaterThanOrEqual(12)
    expect(DATASET.length).toBeLessThanOrEqual(20)
  })

  it('evaluates to 17 checked, 5 skipped', () => {
    expect(result.checkedCount).toBe(17)
    expect(formatCounts(result.checkedCount, result.skipped.length)).toBe('17 checked, 5 skipped')
  })

  it('flags the expected orders in queue order', () => {
    expect(flaggedIds).toEqual(['1051', '1049', '1050', '998', '1042', '1043'])
  })

  it('shows #1042 at 27 h 0 min with 0 of 2 units fulfilled', () => {
    const f = result.flagged.find((x) => x.order.orderId === '1042')
    expect(f).toBeDefined()
    expect(formatElapsed(f!.elapsedMs)).toBe('27 h 0 min')
    expect(f!.order.fulfilledQuantity).toBe(0)
    expect(f!.order.orderedQuantity).toBe(2)
  })

  it('skips the malformed and duplicate records', () => {
    expect(skippedIds).toEqual(['1053', '1054', '1055', '1056', '1043'])
  })

  it('covers every BRD success-table row', () => {
    // Row 1: 23 h 59 min stays out and is not skipped.
    expect(flaggedIds).not.toContain('1044')
    expect(skippedIds).not.toContain('1044')
    // Row 2: exactly 24 h is flagged.
    expect(result.flagged.find((f) => f.order.orderId === '1043')?.elapsedMs).toBe(24 * 3_600_000)
    // Row 3: #1042 is flagged (checked above).
    expect(flaggedIds).toContain('1042')
    // Row 4: canceled and fully refunded stay out although status reads paid.
    for (const id of ['1045', '1046']) {
      const raw = DATASET.find((r) => r.orderId === id)
      expect(raw?.paymentStatus).toBe('paid')
      expect(flaggedIds).not.toContain(id)
    }
    // Row 5: unpaid and partly fulfilled stay out.
    expect(flaggedIds).not.toContain('1047')
    expect(flaggedIds).not.toContain('1048')
    // Row 6: an invalid timestamp is skipped.
    expect(skippedIds).toContain('1053')
  })
})
