import { formatLongestWait } from '../view/summary.ts'
import type { Summary } from '../view/summary.ts'

interface SummaryCardsProps {
  summary: Summary
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const cards: readonly { label: string; value: string }[] = [
    { label: 'Open', value: String(summary.open) },
    { label: 'Reviewed', value: String(summary.reviewed) },
    { label: 'Skipped', value: String(summary.skipped) },
    { label: 'Longest wait', value: formatLongestWait(summary.longestWaitHours) },
  ]
  return (
    <div className="summary-cards">
      {cards.map(({ label, value }) => (
        <div key={label} className="summary-card">
          <div className="summary-card-label">{label}</div>
          <div className="summary-card-value">{value}</div>
        </div>
      ))}
    </div>
  )
}
