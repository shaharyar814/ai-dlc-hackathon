import { formatCounts, formatUtc } from '../format.ts'

interface HeaderProps {
  checkedCount: number
  skippedCount: number
  evaluationTime: string
  onRerun: () => void
  onOpenSkipped: () => void
}

export default function Header({
  checkedCount,
  skippedCount,
  evaluationTime,
  onRerun,
  onOpenSkipped,
}: HeaderProps) {
  return (
    <header>
      <h1>Fulfillment Watch</h1>
      <p>{formatCounts(checkedCount, skippedCount)}</p>
      <p>Evaluated at {formatUtc(evaluationTime)}</p>
      <button type="button" onClick={onRerun}>
        Re-run evaluation
      </button>
      <button type="button" onClick={onOpenSkipped}>
        {skippedCount} skipped
      </button>
    </header>
  )
}
