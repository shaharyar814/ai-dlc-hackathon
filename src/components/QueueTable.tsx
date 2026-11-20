import { Link } from 'react-router-dom'
import { formatOrderId, formatReason, formatUtc } from '../format.ts'
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
                {review && <span>{formatUtc(review.reviewedAt)}</span>}
              </td>
              <td data-label="Action">
                {view === 'open' && (
                  <button type="button" onClick={() => onMarkReviewed(orderId)}>
                    Mark reviewed
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
