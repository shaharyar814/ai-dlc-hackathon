import { Link } from 'react-router-dom'
import { formatOrderId, formatReason, formatReviewStatus } from '../format.ts'
import type { QueueRow } from '../rules/queue.ts'
import { orderPath } from '../view/routes.ts'
import AgeChip from './AgeChip.tsx'
import EmptyState from './EmptyState.tsx'
import StatusChip from './StatusChip.tsx'

export type QueueView = 'open' | 'reviewed'

interface QueueTableProps {
  rows: readonly QueueRow[]
  view: QueueView
  onMarkReviewed: (orderId: string) => void
  thresholdHours: number
  /** Order ID whose last save failed. In API mode a Retry button shows next to it. */
  retryFor?: string | null
}

const EMPTY_MESSAGES: Record<QueueView, string> = {
  open: 'No stalled orders. Nothing needs review.',
  reviewed: 'No reviewed orders yet.',
}

export default function QueueTable({
  rows,
  view,
  onMarkReviewed,
  thresholdHours,
  retryFor = null,
}: QueueTableProps) {
  if (rows.length === 0) return <EmptyState message={EMPTY_MESSAGES[view]} />

  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Hours since payment</th>
          <th scope="col">Reason</th>
          <th scope="col">Review status</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ flagged, review }) => {
          const { orderId } = flagged.order
          return (
            <tr key={orderId}>
              <td data-label="Order">
                <Link to={orderPath(orderId)}>{formatOrderId(orderId)}</Link>
              </td>
              <td data-label="Hours since payment">
                <AgeChip elapsedMs={flagged.elapsedMs} />
              </td>
              <td data-label="Reason">{formatReason(flagged, thresholdHours)}</td>
              <td data-label="Review status">
                <StatusChip status={review ? 'reviewed' : 'open'} />
                {review && <span>{formatReviewStatus(review, false)}</span>}
              </td>
              <td data-label="Action">
                {view === 'open' && (
                  <button type="button" onClick={() => onMarkReviewed(orderId)}>
                    Mark reviewed
                  </button>
                )}
                {view === 'open' && retryFor === orderId && (
                  <button type="button" onClick={() => onMarkReviewed(orderId)}>
                    Retry
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
