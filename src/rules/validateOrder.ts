import type { Order, RawOrder, RefundStatus, SkipReason } from '../types.ts'
import { parseUtcTimestamp } from './timestamps.ts'

export type ValidationResult =
  | { readonly ok: true; readonly order: Order }
  | { readonly ok: false; readonly reasons: readonly SkipReason[] }

const REFUND_STATUSES: readonly string[] = ['none', 'partial', 'full']

function missing(field: string): SkipReason {
  return { code: 'missing-field', field, message: `Missing ${field}` }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Checks all seven fields and collects every failure. Validation ignores
 * payment status, so malformed unpaid records are rejected too.
 */
export function validateOrder(raw: RawOrder, evaluationTimeMs: number): ValidationResult {
  const reasons: SkipReason[] = []

  const orderId = raw.orderId
  if (!isNonEmptyString(orderId)) reasons.push(missing('orderId'))

  const paymentStatus = raw.paymentStatus
  if (!isNonEmptyString(paymentStatus)) reasons.push(missing('paymentStatus'))

  const paidAt = raw.paymentTimestamp
  let paidAtMs: number | null = null
  if (paidAt === undefined || paidAt === null || paidAt === '') {
    reasons.push(missing('paymentTimestamp'))
  } else {
    paidAtMs = parseUtcTimestamp(paidAt)
    if (paidAtMs === null) {
      reasons.push({
        code: 'invalid-timestamp',
        field: 'paymentTimestamp',
        message: 'Payment timestamp is not a valid UTC timestamp',
      })
    } else if (paidAtMs > evaluationTimeMs) {
      reasons.push({
        code: 'future-timestamp',
        field: 'paymentTimestamp',
        message: 'Payment timestamp is later than the evaluation time',
      })
    }
  }

  const canceled = raw.canceled
  if (typeof canceled !== 'boolean') reasons.push(missing('canceled'))

  const refundStatus = raw.refundStatus
  if (refundStatus === undefined) {
    reasons.push(missing('refundStatus'))
  } else if (typeof refundStatus !== 'string' || !REFUND_STATUSES.includes(refundStatus)) {
    reasons.push({
      code: 'invalid-refund-status',
      field: 'refundStatus',
      message: 'Refund status must be none, partial, or full',
    })
  }

  for (const field of ['orderedQuantity', 'fulfilledQuantity'] as const) {
    const value = raw[field]
    if (value === undefined) {
      reasons.push(missing(field))
    } else if (!isQuantity(value)) {
      reasons.push({
        code: 'invalid-quantity',
        field,
        message: `${field} must be a non-negative whole number`,
      })
    }
  }

  if (reasons.length > 0) return { ok: false, reasons }

  return {
    ok: true,
    order: {
      orderId: raw.orderId as string,
      paymentStatus: raw.paymentStatus as string,
      paidAtMs: paidAtMs as number,
      paidAt: paidAt as string,
      canceled: canceled as boolean,
      refundStatus: refundStatus as RefundStatus,
      orderedQuantity: raw.orderedQuantity as number,
      fulfilledQuantity: raw.fulfilledQuantity as number,
    },
  }
}
