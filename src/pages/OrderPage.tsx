import { Link } from 'react-router-dom'
import EvidencePanel from '../components/EvidencePanel.tsx'
import Icon from '../components/Icon.tsx'
import NextCheckBox from '../components/NextCheckBox.tsx'
import StatusChip from '../components/StatusChip.tsx'
import { formatOrderId, formatReviewStatus } from '../format.ts'
import { useWorkbench } from '../state/workbenchContext.ts'
import './OrderPage.css'

interface OrderPageProps {
  orderId: string
}

const SAVE_ERROR = 'Could not save the review. The order stays open.'

export default function OrderPage({ orderId }: OrderPageProps) {
  const { open, reviewed, saveErrorFor, markReviewed, mode } = useWorkbench()
  const row =
    open.find((r) => r.flagged.order.orderId === orderId) ??
    reviewed.find((r) => r.flagged.order.orderId === orderId)

  if (!row) {
    return (
      <div>
        <h1 tabIndex={-1}>Order not found</h1>
        <p>This order is not currently flagged or was not found.</p>
        <Link to="/">Back to queue</Link>
      </div>
    )
  }

  const { flagged, review } = row
  return (
    <div>
      <Link to="/">
        <Icon name="back" />
        <span>Back to queue</span>
      </Link>
      <div className="order-heading">
        <h1 tabIndex={-1}>{formatOrderId(orderId)}</h1>
        <StatusChip status={review ? 'reviewed' : 'open'} />
      </div>
      <EvidencePanel flagged={flagged} />
      <NextCheckBox />
      {review ? (
        <p>{formatReviewStatus(review, true)}</p>
      ) : (
        <>
          {saveErrorFor === orderId && <p role="alert">{SAVE_ERROR}</p>}
          <button type="button" onClick={() => markReviewed(orderId)}>
            Mark reviewed
          </button>
          {mode === 'api' && saveErrorFor === orderId && (
            <button type="button" onClick={() => markReviewed(orderId)}>
              Retry
            </button>
          )}
        </>
      )}
    </div>
  )
}
