import type { QueueRow } from '../rules/queue.ts'
import type { SkippedRecord } from '../types.ts'
import { wholeHours } from './age.ts'

export interface Summary {
  readonly open: number
  readonly reviewed: number
  readonly skipped: number
  readonly longestWaitHours: number | null
}

export function summarize(
  open: readonly QueueRow[],
  reviewed: readonly QueueRow[],
  skipped: readonly SkippedRecord[],
): Summary {
  let longest: number | null = null
  for (const row of open) {
    const h = wholeHours(row.flagged.elapsedMs)
    if (longest === null || h > longest) longest = h
  }
  return {
    open: open.length,
    reviewed: reviewed.length,
    skipped: skipped.length,
    longestWaitHours: longest,
  }
}

export function formatLongestWait(h: number | null): string {
  return h === null ? '—' : `${h} h`
}
