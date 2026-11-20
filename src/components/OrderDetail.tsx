import { RULE_NAME, SUGGESTED_ACTION } from '../config.ts'
import { formatElapsed, formatOrderId, formatUtc } from '../format.ts'
import type { FlaggedOrder, ReviewRecord } from '../types.ts'

interface OrderDetailProps {
  flagged: FlaggedOrder
  review: ReviewRecord | null
}

export default function OrderDetail({ flagged, review }: OrderDetailProps) {
  const { order, elapsedMs } = flagged
  return (
    <section aria-label={`Details for order ${formatOrderId(order.orderId)}`}>
      <h2>{formatOrderId(order.orderId)}</h2>
      <dl>
        <dt>Paid at</dt>
        <dd>{formatUtc(order.paidAt)}</dd>
        <dt>Elapsed</dt>
        <dd>{formatElapsed(elapsedMs)}</dd>
        <dt>Fulfilled</dt>
        <dd>
          {order.fulfilledQuantity} of {order.orderedQuantity} units fulfilled
        </dd>
        <dt>Rule</dt>
        <dd>{RULE_NAME}</dd>
        <dt>Suggested action</dt>
        <dd>{SUGGESTED_ACTION}</dd>
        <dt>Review status</dt>
        <dd>{review ? `Reviewed ${formatUtc(review.reviewedAt)}` : 'Open'}</dd>
      </dl>
    </section>
  )
}
