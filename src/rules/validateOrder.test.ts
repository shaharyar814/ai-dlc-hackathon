import { describe, expect, it } from 'vitest'
import type { RawOrder, SkipReason } from '../types.ts'
import { parseUtcTimestamp } from './timestamps.ts'
import { validateOrder } from './validateOrder.ts'

const NOW = parseUtcTimestamp('2026-11-20T12:00:00Z') as number

const VALID: RawOrder = {
  orderId: '1042',
  paymentStatus: 'paid',
  paymentTimestamp: '2026-11-19T09:00:00Z',
  canceled: false,
  refundStatus: 'none',
  orderedQuantity: 2,
  fulfilledQuantity: 0,
}

function without(...fields: string[]): RawOrder {
  const copy: Record<string, unknown> = { ...VALID }
  for (const f of fields) delete copy[f]
  return copy
}

function reasonsOf(raw: RawOrder): readonly SkipReason[] {
  const result = validateOrder(raw, NOW)
  if (result.ok) throw new Error('expected a validation failure')
  return result.reasons
}

describe('validateOrder', () => {
  it('accepts a valid order', () => {
    const result = validateOrder(VALID, NOW)
    expect(result).toEqual({
      ok: true,
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
    })
  })

  it.each([
    'orderId',
    'paymentStatus',
    'paymentTimestamp',
    'canceled',
    'refundStatus',
    'orderedQuantity',
    'fulfilledQuantity',
  ])('reports missing %s by name', (field) => {
    const reasons = reasonsOf(without(field))
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatchObject({ code: 'missing-field', field })
  })

  it('reports one reason per missing field', () => {
    const reasons = reasonsOf(without('orderId', 'refundStatus', 'fulfilledQuantity'))
    expect(reasons.map((r) => r.field)).toEqual(['orderId', 'refundStatus', 'fulfilledQuantity'])
  })

  it('rejects an unparsable timestamp', () => {
    expect(reasonsOf({ ...VALID, paymentTimestamp: 'yesterday' })[0]).toMatchObject({
      code: 'invalid-timestamp',
      field: 'paymentTimestamp',
    })
  })

  it('rejects a timestamp later than the evaluation time', () => {
    expect(reasonsOf({ ...VALID, paymentTimestamp: '2026-11-21T00:00:00Z' })[0]).toMatchObject({
      code: 'future-timestamp',
    })
  })

  it('accepts a timestamp equal to the evaluation time', () => {
    expect(validateOrder({ ...VALID, paymentTimestamp: '2026-11-20T12:00:00Z' }, NOW).ok).toBe(true)
  })

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['non-numeric', 'two'],
    ['empty', ''],
  ])('rejects a %s quantity and names each bad field', (_label, bad) => {
    const reasons = reasonsOf({ ...VALID, orderedQuantity: bad, fulfilledQuantity: bad })
    expect(reasons.map((r) => [r.code, r.field])).toEqual([
      ['invalid-quantity', 'orderedQuantity'],
      ['invalid-quantity', 'fulfilledQuantity'],
    ])
  })

  it('rejects an invalid refund status', () => {
    expect(reasonsOf({ ...VALID, refundStatus: 'maybe' })[0]).toMatchObject({
      code: 'invalid-refund-status',
      field: 'refundStatus',
    })
  })

  it('reports a missing refund status as missing', () => {
    expect(reasonsOf(without('refundStatus'))[0]).toMatchObject({ code: 'missing-field' })
  })

  it('never defaults a missing canceled flag', () => {
    expect(reasonsOf(without('canceled'))[0]).toMatchObject({
      code: 'missing-field',
      field: 'canceled',
    })
    expect(reasonsOf({ ...VALID, canceled: 'no' })[0]).toMatchObject({ field: 'canceled' })
  })

  it('rejects an unpaid but malformed record', () => {
    const raw = { ...VALID, paymentStatus: 'pending', paymentTimestamp: 'yesterday' }
    expect(validateOrder(raw, NOW).ok).toBe(false)
  })

  it('reports every defect of a record with several', () => {
    const reasons = reasonsOf({
      ...without('orderId'),
      paymentTimestamp: 'nope',
      refundStatus: 'x',
      orderedQuantity: -2,
    })
    expect(reasons.map((r) => r.code)).toEqual([
      'missing-field',
      'invalid-timestamp',
      'invalid-refund-status',
      'invalid-quantity',
    ])
  })
})
