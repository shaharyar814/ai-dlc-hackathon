import QueueTable from '../components/QueueTable.tsx'
import QueueTabs from '../components/QueueTabs.tsx'
import SummaryCards from '../components/SummaryCards.tsx'
import { DEFAULT_THRESHOLD_HOURS } from '../config.ts'
import { useWorkbench } from '../state/workbenchContext.ts'
import { summarize } from '../view/summary.ts'

interface QueuePageProps {
  view: 'open' | 'reviewed'
}

export default function QueuePage({ view }: QueuePageProps) {
  const { result, open, reviewed, saveErrorFor, markReviewed, mode, thresholdHours } = useWorkbench()
  const summary = summarize(open, reviewed, result.skipped)

  return (
    <>
      <h1 tabIndex={-1}>{view === 'open' ? 'Queue' : 'Reviewed'}</h1>
      <SummaryCards summary={summary} />
      <QueueTabs current={view} openCount={open.length} reviewedCount={reviewed.length} />
      {saveErrorFor !== null && (
        <p role="alert">Could not save the review. The order stays open.</p>
      )}
      <QueueTable
        rows={view === 'open' ? open : reviewed}
        view={view}
        onMarkReviewed={markReviewed}
        thresholdHours={thresholdHours ?? DEFAULT_THRESHOLD_HOURS}
        retryFor={mode === 'api' ? saveErrorFor : null}
      />
    </>
  )
}
