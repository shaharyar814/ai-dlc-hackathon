import { formatOrderId } from '../format.ts'
import type { SkippedRecord } from '../types.ts'
import { groupSkippedByReason, skippedLabel } from '../view/skipped.ts'

interface SkippedGroupsProps {
  skipped: readonly SkippedRecord[]
}

export default function SkippedGroups({ skipped }: SkippedGroupsProps) {
  const groups = groupSkippedByReason(skipped)
  const idByIndex = new Map(skipped.map((s) => [s.index, s.orderId]))

  return (
    <>
      {groups.map((group) => (
        <section key={group.reason} aria-label={group.reason}>
          <h2>{group.reason}</h2>
          <p>
            {group.entries.length} {group.entries.length === 1 ? 'record' : 'records'}
          </p>
          <ul>
            {group.entries.map((entry) => {
              const id = idByIndex.get(entry.index) ?? null
              const label = skippedLabel(id)
              return (
                <li key={entry.index}>
                  {id === null || id === '' ? label : formatOrderId(id)}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
