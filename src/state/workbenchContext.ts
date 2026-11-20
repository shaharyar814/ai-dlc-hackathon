import { createContext, useContext } from 'react'
import type { QueueRow } from '../rules/queue.ts'
import type { EvaluationResult, ReviewMap } from '../types.ts'
export type WorkbenchMode = 'local' | 'api'
export type WorkbenchStatus = 'loading' | 'ready' | 'error' | 'forbidden'
export type LoadErrorKind = 'timeout' | 'network' | 'http'
export interface WorkbenchState {
  result: EvaluationResult
  reviews: ReviewMap
  open: readonly QueueRow[]
  reviewed: readonly QueueRow[]
  saveErrorFor: string | null
  rerun(): void
  markReviewed(orderId: string): void
  /** Stage B fields. Local mode uses the defaults 'local' and 'ready'. */
  mode?: WorkbenchMode
  status?: WorkbenchStatus
  /** True while a queue request is in progress. */
  loading?: boolean
  errorKind?: LoadErrorKind | null
  evaluationTime?: string
  thresholdHours?: number
  reload?(): void
}
export const WorkbenchContext = createContext<WorkbenchState | null>(null)
export function useWorkbench(): WorkbenchState {
  const state = useContext(WorkbenchContext)
  if (state === null) throw new Error('useWorkbench must be used inside WorkbenchProvider')
  return state
}
