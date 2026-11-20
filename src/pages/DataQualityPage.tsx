import EmptyState from '../components/EmptyState.tsx'
import SkippedGroups from '../components/SkippedGroups.tsx'
import { useWorkbench } from '../state/workbenchContext.ts'
import { groupSkippedByReason } from '../view/skipped.ts'

export default function DataQualityPage() {
  const { result } = useWorkbench()
  const hasGroups = groupSkippedByReason(result.skipped).length > 0

  return (
    <>
      <h1 tabIndex={-1}>Data quality</h1>
      {hasGroups ? (
        <SkippedGroups skipped={result.skipped} />
      ) : (
        <EmptyState message="No records were skipped." />
      )}
    </>
  )
}
