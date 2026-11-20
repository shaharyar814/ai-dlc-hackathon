import { reviewKey } from '../rules/queue.ts'
import type {
  EvaluationResult,
  FlaggedOrder,
  Order,
  RefundStatus,
  ReviewMap,
  ReviewRecord,
  SkipCode,
  SkipReason,
  SkippedRecord,
} from '../types.ts'

export interface WireReview {
  readonly reviewedAt: string
  readonly reviewer: string
}

export interface WireRow {
  readonly order: Order
  readonly elapsedMs: number
  readonly review: WireReview | null
}

export interface QueueResponse {
  readonly ruleId: string
  readonly evaluationTime: string
  readonly thresholdHours: number
  readonly checkedCount: number
  readonly rows: readonly WireRow[]
  readonly skipped: readonly SkippedRecord[]
}

/** Thrown by the decoder when a body is not a valid QueueResponse. */
export class WireFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WireFormatError'
  }
}

export interface EncodeInput {
  readonly ruleId: string
  readonly evaluationTime: string
  readonly thresholdHours: number
  readonly result: EvaluationResult
  /** Reviews keyed by `reviewKey(orderId, ruleId)`. */
  readonly reviews: ReadonlyMap<string, WireReview>
}

/** Builds the response in evaluator order. Used by the Lambda. */
export function encodeQueueResponse(input: EncodeInput): QueueResponse {
  const rows: WireRow[] = input.result.flagged.map((f) => {
    const review = input.reviews.get(reviewKey(f.order.orderId, input.ruleId))
    return {
      order: f.order,
      elapsedMs: f.elapsedMs,
      review: review ? { reviewedAt: review.reviewedAt, reviewer: review.reviewer } : null,
    }
  })
  return {
    ruleId: input.ruleId,
    evaluationTime: input.evaluationTime,
    thresholdHours: input.thresholdHours,
    checkedCount: input.result.checkedCount,
    rows,
    skipped: input.result.skipped,
  }
}

const REFUND_STATUSES: readonly RefundStatus[] = ['none', 'partial', 'full']
const SKIP_CODES: readonly SkipCode[] = [
  'missing-field',
  'invalid-timestamp',
  'future-timestamp',
  'invalid-quantity',
  'invalid-refund-status',
  'duplicate-order-id',
]

function fail(what: string): never {
  throw new WireFormatError(`Malformed queue response: ${what}`)
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(what)
  return value as Record<string, unknown>
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') fail(what)
  return value
}

function asNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(what)
  return value
}

function asBoolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') fail(what)
  return value
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(what)
  return value
}

function decodeOrder(value: unknown): Order {
  const o = asRecord(value, 'order')
  const refundStatus = o.refundStatus
  if (!REFUND_STATUSES.includes(refundStatus as RefundStatus)) fail('order.refundStatus')
  return {
    orderId: asString(o.orderId, 'order.orderId'),
    paymentStatus: asString(o.paymentStatus, 'order.paymentStatus'),
    paidAtMs: asNumber(o.paidAtMs, 'order.paidAtMs'),
    paidAt: asString(o.paidAt, 'order.paidAt'),
    canceled: asBoolean(o.canceled, 'order.canceled'),
    refundStatus: refundStatus as RefundStatus,
    orderedQuantity: asNumber(o.orderedQuantity, 'order.orderedQuantity'),
    fulfilledQuantity: asNumber(o.fulfilledQuantity, 'order.fulfilledQuantity'),
  }
}

function decodeRow(value: unknown): WireRow {
  const r = asRecord(value, 'row')
  let review: WireReview | null = null
  if (r.review !== null) {
    const rv = asRecord(r.review, 'row.review')
    review = {
      reviewedAt: asString(rv.reviewedAt, 'row.review.reviewedAt'),
      reviewer: asString(rv.reviewer, 'row.review.reviewer'),
    }
  }
  return { order: decodeOrder(r.order), elapsedMs: asNumber(r.elapsedMs, 'row.elapsedMs'), review }
}

function decodeReason(value: unknown): SkipReason {
  const r = asRecord(value, 'skip reason')
  const code = r.code
  if (!SKIP_CODES.includes(code as SkipCode)) fail('skip reason code')
  const message = asString(r.message, 'skip reason message')
  if (r.field === undefined) return { code: code as SkipCode, message }
  return { code: code as SkipCode, field: asString(r.field, 'skip reason field'), message }
}

function decodeSkipped(value: unknown): SkippedRecord {
  const s = asRecord(value, 'skipped record')
  const orderId = s.orderId === null ? null : asString(s.orderId, 'skipped.orderId')
  const reasons = asArray(s.reasons, 'skipped.reasons').map(decodeReason)
  if (reasons.length === 0) fail('skipped.reasons is empty')
  return { orderId, index: asNumber(s.index, 'skipped.index'), reasons }
}

/**
 * Checks the shape of a parsed JSON body and returns it, or throws a
 * WireFormatError. Never returns partial data. Used by the client.
 */
export function decodeQueueResponse(value: unknown): QueueResponse {
  const r = asRecord(value, 'body')
  return {
    ruleId: asString(r.ruleId, 'ruleId'),
    evaluationTime: asString(r.evaluationTime, 'evaluationTime'),
    thresholdHours: asNumber(r.thresholdHours, 'thresholdHours'),
    checkedCount: asNumber(r.checkedCount, 'checkedCount'),
    rows: asArray(r.rows, 'rows').map(decodeRow),
    skipped: asArray(r.skipped, 'skipped').map(decodeSkipped),
  }
}

/** Rows as the `FlaggedOrder` list the existing pages expect. */
export function toFlaggedOrders(response: QueueResponse): FlaggedOrder[] {
  return response.rows.map((row) => ({ order: row.order, elapsedMs: row.elapsedMs }))
}

/** Reviewed rows as a `ReviewMap` keyed by `reviewKey`. */
export function toReviewMap(response: QueueResponse): ReviewMap {
  const map = new Map<string, ReviewRecord>()
  for (const row of response.rows) {
    if (row.review === null) continue
    map.set(reviewKey(row.order.orderId, response.ruleId), {
      orderId: row.order.orderId,
      ruleId: response.ruleId,
      reviewedAt: row.review.reviewedAt,
      reviewer: row.review.reviewer,
    })
  }
  return map
}
