import { formatHours, formatOrderId, formatReason, formatUtc } from '../format.ts'
import type { QueueRow } from '../rules/queue.ts'
import EmptyState from './EmptyState.tsx'

export type QueueView = 'open' | 'reviewed'

interface QueueTableProps {
  rows: readonly QueueRow[]
  view: QueueView
  selectedId: string | null
  onSelect: (orderId: string) => void
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
  selectedId,
  onSelect,
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
              <td>
                <button
                  type="button"
                  aria-current={selectedId === orderId ? 'true' : undefined}
                  onClick={() => onSelect(orderId)}
                >
                  {formatOrderId(orderId)}
                </button>
              </td>
              <td>{formatHours(flagged.elapsedMs)}</td>
              <td>{formatReason(flagged, thresholdHours)}</td>
              <td>{review ? `Reviewed ${formatUtc(review.reviewedAt)}` : 'Open'}</td>
              <td>
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
