import { createContext, useContext } from 'react'
import type { QueueRow } from '../rules/queue.ts'
import type { EvaluationResult, ReviewMap } from '../types.ts'

export interface WorkbenchState {
  result: EvaluationResult
  reviews: ReviewMap
  open: readonly QueueRow[]
  reviewed: readonly QueueRow[]
  saveErrorFor: string | null
  rerun(): void
  markReviewed(orderId: string): void
}

export const WorkbenchContext = createContext<WorkbenchState | null>(null)

export function useWorkbench(): WorkbenchState {
  const state = useContext(WorkbenchContext)
  if (state === null) throw new Error('useWorkbench must be used inside WorkbenchProvider')
  return state
}
