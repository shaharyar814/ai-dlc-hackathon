import { Link } from 'react-router-dom'

export type QueueTab = 'open' | 'reviewed'

interface QueueTabsProps {
  current: QueueTab
  openCount: number
  reviewedCount: number
}

export default function QueueTabs({ current, openCount, reviewedCount }: QueueTabsProps) {
  return (
    <nav aria-label="Queue views" className="queue-tabs">
      <Link to="/" aria-current={current === 'open' ? 'page' : undefined}>
        {`Open (${openCount})`}
      </Link>
      <Link to="/reviewed" aria-current={current === 'reviewed' ? 'page' : undefined}>
        {`Reviewed (${reviewedCount})`}
      </Link>
    </nav>
  )
}
