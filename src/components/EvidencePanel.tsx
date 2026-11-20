import type { CSSProperties } from 'react'
import { RULE_NAME } from '../config.ts'
import { formatElapsed, formatUtc } from '../format.ts'
import type { FlaggedOrder } from '../types.ts'
import { progressFraction } from '../view/progress.ts'

interface EvidencePanelProps {
  flagged: FlaggedOrder
}

export default function EvidencePanel({ flagged }: EvidencePanelProps) {
  const { order, elapsedMs } = flagged
  const fraction = progressFraction(order.fulfilledQuantity, order.orderedQuantity)
  const barStyle = { '--progress': fraction } as CSSProperties
  return (
    <section className="evidence-panel" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Evidence</h2>
      <dl>
        <dt>Paid at</dt>
        <dd>{formatUtc(order.paidAt)}</dd>
        <dt>Elapsed</dt>
        <dd>{formatElapsed(elapsedMs)}</dd>
        <dt>Fulfilled</dt>
        <dd>
          <span>
            {order.fulfilledQuantity} of {order.orderedQuantity} units fulfilled
          </span>
          <div
            className="progress"
            role="progressbar"
            aria-label="Units fulfilled"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={fraction}
            style={barStyle}
          >
            <div className="progress-fill" />
          </div>
        </dd>
        <dt>Rule</dt>
        <dd>{RULE_NAME}</dd>
      </dl>
    </section>
  )
}
