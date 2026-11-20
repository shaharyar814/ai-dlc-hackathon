import { formatCounts, formatUtc } from '../format.ts'
import { PRODUCT_NAME } from '../view/title.ts'
import NavBar from './NavBar.tsx'

interface HeaderProps {
  checkedCount: number
  skippedCount: number
  evaluationTime: string
  onRerun: () => void
  /** API mode only. When set, a Sign out link is shown. */
  signOutHref?: string
  onSignOut?: () => void
}

export default function Header({
  checkedCount,
  skippedCount,
  evaluationTime,
  onRerun,
  signOutHref,
  onSignOut,
}: HeaderProps) {
  return (
    <header>
      <span className="product-name">{PRODUCT_NAME}</span>
      <NavBar />
      <span className="evaluation-chip">Evaluated at {formatUtc(evaluationTime)}</span>
      <span className="checked-count">{formatCounts(checkedCount, skippedCount)}</span>
      <button type="button" onClick={onRerun}>
        Re-run evaluation
      </button>
      {signOutHref !== undefined && (
        <a href={signOutHref} onClick={onSignOut}>
          Sign out
        </a>
      )}
    </header>
  )
}
