export type RawOrder = Readonly<Record<string, unknown>>

export type RefundStatus = 'none' | 'partial' | 'full'

export interface Order {
  readonly orderId: string
  readonly paymentStatus: string // as supplied; compared after trim + lowercase
  readonly paidAtMs: number // parsed UTC epoch milliseconds
  readonly paidAt: string // original ISO string, for display
  readonly canceled: boolean
  readonly refundStatus: RefundStatus
  readonly orderedQuantity: number
  readonly fulfilledQuantity: number
}

export interface FlaggedOrder {
  readonly order: Order
  readonly elapsedMs: number
}

export type SkipCode =
  | 'missing-field'
  | 'invalid-timestamp'
  | 'future-timestamp'
  | 'invalid-quantity'
  | 'invalid-refund-status'
  | 'duplicate-order-id'

export interface SkipReason {
  readonly code: SkipCode
  readonly field?: string // the field a reason is about, when there is one
  readonly message: string // shown in the skipped list
}

export interface SkippedRecord {
  readonly orderId: string | null // null when the ID itself is missing
  readonly index: number // position in the input
  readonly reasons: readonly SkipReason[] // at least one
}

export interface EvaluationResult {
  readonly flagged: readonly FlaggedOrder[]
  readonly skipped: readonly SkippedRecord[]
  readonly checkedCount: number // total records received, including skipped
}

export interface ReviewRecord {
  readonly orderId: string
  readonly ruleId: string
  readonly reviewedAt: string // ISO 8601 UTC, ends in Z
  readonly reviewer?: string // set in API mode only (Cognito username)
}

export type ReviewMap = ReadonlyMap<string, ReviewRecord>
