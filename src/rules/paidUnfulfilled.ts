import type {
  EvaluationResult,
  FlaggedOrder,
  RawOrder,
  SkippedRecord,
} from '../types.ts'
import { compareFlagged } from './queue.ts'
import { parseUtcTimestamp } from './timestamps.ts'
import { validateOrder } from './validateOrder.ts'

const MS_PER_HOUR = 3_600_000

function idOf(raw: RawOrder): string | null {
  const id = raw.orderId
  return typeof id === 'string' && id.trim() !== '' ? id : null
}

/**
 * Evaluates the "Paid and unfulfilled" rule. Pure: no clock, storage, or DOM,
 * and the input is never mutated.
 */
export function evaluate(
  orders: readonly RawOrder[],
  evaluationTime: string,
  thresholdHours: number,
): EvaluationResult {
  const evaluationTimeMs = parseUtcTimestamp(evaluationTime)
  if (evaluationTimeMs === null) {
    throw new RangeError(`Unparsable evaluation time: ${String(evaluationTime)}`)
  }

  const accepted = new Set<string>()
  const flagged: FlaggedOrder[] = []
  const skipped: SkippedRecord[] = []

  orders.forEach((raw, index) => {
    const result = validateOrder(raw, evaluationTimeMs)
    if (!result.ok) {
      skipped.push({ orderId: idOf(raw), index, reasons: result.reasons })
      return
    }
    const { order } = result
    if (accepted.has(order.orderId)) {
      skipped.push({
        orderId: order.orderId,
        index,
        reasons: [
          {
            code: 'duplicate-order-id',
            field: 'orderId',
            message: `Duplicate order ID ${order.orderId}; the first record was kept`,
          },
        ],
      })
      return
    }
    accepted.add(order.orderId)

    const elapsedMs = evaluationTimeMs - order.paidAtMs
    if (
      order.paymentStatus.trim().toLowerCase() === 'paid' &&
      elapsedMs >= thresholdHours * MS_PER_HOUR &&
      order.fulfilledQuantity === 0 &&
      !order.canceled &&
      order.refundStatus !== 'full'
    ) {
      flagged.push({ order, elapsedMs })
    }
  })

  flagged.sort(compareFlagged)
  return { flagged, skipped, checkedCount: orders.length }
}
