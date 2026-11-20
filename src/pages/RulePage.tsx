import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME, RULE_NAME } from '../config.ts'
import { formatUtc } from '../format.ts'

// DRAFT wording derived from .kiro/steering/product.md. Needs user approval before release (Req 10.7).
export default function RulePage() {
  return (
    <>
      <h1 tabIndex={-1}>Rule</h1>
      <section className="rule-card">
        <h2>{RULE_NAME}</h2>
        <p>
          An order is flagged only when all of these are true: it is paid, it was paid at least{' '}
          {DEFAULT_THRESHOLD_HOURS} hours before the evaluation time, none of its units are
          fulfilled, it is not canceled, and it is not fully refunded. A partial refund does not
          stop an order from being flagged.
        </p>
        <dl>
          <dt>Threshold</dt>
          <dd>{DEFAULT_THRESHOLD_HOURS} hours</dd>
          <dt>Evaluation time</dt>
          <dd>{formatUtc(EVALUATION_TIME)}</dd>
        </dl>
      </section>
    </>
  )
}
