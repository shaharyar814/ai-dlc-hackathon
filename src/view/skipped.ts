import type { SkippedRecord } from '../types.ts'

export interface SkippedEntry {
  readonly index: number
  readonly label: string
}

export interface SkippedGroup {
  readonly reason: string
  readonly entries: readonly SkippedEntry[]
}

export function skippedLabel(orderId: string | null): string {
  return orderId === null || orderId === '' ? '(no ID)' : orderId
}

/** Groups by reason message in first-seen order; a record counts once per distinct message. */
export function groupSkippedByReason(
  skipped: readonly SkippedRecord[],
): readonly SkippedGroup[] {
  const groups = new Map<string, SkippedEntry[]>()
  for (const record of skipped) {
    const entry: SkippedEntry = { index: record.index, label: skippedLabel(record.orderId) }
    const seen = new Set<string>()
    for (const reason of record.reasons) {
      if (seen.has(reason.message)) continue
      seen.add(reason.message)
      const list = groups.get(reason.message)
      if (list) list.push(entry)
      else groups.set(reason.message, [entry])
    }
  }
  return [...groups].map(([reason, entries]) => ({ reason, entries }))
}
