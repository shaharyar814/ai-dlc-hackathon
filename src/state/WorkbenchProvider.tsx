import { useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME, RULE_ID } from '../config.ts'
import { DATASET } from '../data/orders.ts'
import { evaluate } from '../rules/paidUnfulfilled.ts'
import { buildQueue } from '../rules/queue.ts'
import { getBrowserStorage, loadReviews, saveReview } from '../storage/reviews.ts'
import type { StorageLike } from '../storage/reviews.ts'
import type { EvaluationResult, RawOrder } from '../types.ts'
import { WorkbenchContext } from './workbenchContext.ts'

interface WorkbenchProviderProps {
  dataset?: readonly RawOrder[]
  storage?: StorageLike | null
  now?: () => Date
  children: ReactNode
}

function runEvaluation(dataset: readonly RawOrder[]): EvaluationResult {
  return evaluate(dataset, EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS)
}

export default function WorkbenchProvider({
  dataset = DATASET,
  storage = getBrowserStorage(),
  now = () => new Date(),
  children,
}: WorkbenchProviderProps) {
  const [result, setResult] = useState(() => runEvaluation(dataset))
  const [reviews, setReviews] = useState(() => loadReviews(storage))
  const [saveErrorFor, setSaveErrorFor] = useState<string | null>(null)

  const { open, reviewed } = buildQueue(result.flagged, reviews, RULE_ID)

  function rerun() {
    setResult(runEvaluation(dataset))
    setReviews(loadReviews(storage))
  }

  function markReviewed(orderId: string) {
    const saved = saveReview(storage, orderId, RULE_ID, now().toISOString())
    setReviews(saved.reviews)
    setSaveErrorFor(saved.ok ? null : orderId)
  }

  return (
    <WorkbenchContext.Provider
      value={{ result, reviews, open, reviewed, saveErrorFor, rerun, markReviewed }}
    >
      {children}
    </WorkbenchContext.Provider>
  )
}
