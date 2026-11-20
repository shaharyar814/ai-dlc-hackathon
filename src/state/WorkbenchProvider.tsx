import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toFlaggedOrders, toReviewMap } from '../api/wire.ts'
import type { QueueResponse } from '../api/wire.ts'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME, RULE_ID } from '../config.ts'
import { DATASET } from '../data/orders.ts'
import { evaluate } from '../rules/paidUnfulfilled.ts'
import { buildQueue, reviewKey } from '../rules/queue.ts'
import type { ApiRepository } from '../storage/apiRepository.ts'
import { createLocalRepository } from '../storage/localRepository.ts'
import type { LocalRepository } from '../storage/localRepository.ts'
import { getBrowserStorage } from '../storage/reviews.ts'
import type { StorageLike } from '../storage/reviews.ts'
import type { EvaluationResult, RawOrder, ReviewMap } from '../types.ts'
import { WorkbenchContext } from './workbenchContext.ts'
import type { LoadErrorKind, WorkbenchStatus } from './workbenchContext.ts'
interface WorkbenchProviderProps {
  dataset?: readonly RawOrder[]
  storage?: StorageLike | null
  now?: () => Date
  /** API mode when this is an ApiRepository. Omit for Local mode. */
  repository?: LocalRepository | ApiRepository
  /** Called when the API answers 401, to restart sign-in. */
  onUnauthorized?: () => void
  children: ReactNode
}
const EMPTY_RESULT: EvaluationResult = { flagged: [], skipped: [], checkedCount: 0 }
function runEvaluation(dataset: readonly RawOrder[]): EvaluationResult {
  return evaluate(dataset, EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS)
}
function loadErrorKind(error: unknown): LoadErrorKind | 'unauthorized' | 'forbidden' {
  const kind =
    typeof error === 'object' && error !== null && 'kind' in error
      ? (error as { kind: unknown }).kind
      : null
  switch (kind) {
    case 'unauthorized':
    case 'forbidden':
    case 'timeout':
    case 'network':
      return kind
    default:
      return 'http'
  }
}
interface LoadHandlers {
  onSuccess(response: QueueResponse): void
  onFailure(kind: ReturnType<typeof loadErrorKind>): void
}
async function requestQueue(repo: ApiRepository, handlers: LoadHandlers): Promise<void> {
  let response: QueueResponse
  try {
    response = await repo.loadQueue()
  } catch (error) {
    handlers.onFailure(loadErrorKind(error))
    return
  }
  handlers.onSuccess(response)
}
export default function WorkbenchProvider({
  dataset = DATASET,
  storage = getBrowserStorage(),
  now = () => new Date(),
  repository,
  onUnauthorized,
  children,
}: WorkbenchProviderProps) {
  const [repo] = useState<LocalRepository | ApiRepository>(
    () => repository ?? createLocalRepository(storage),
  )
  const apiRepo = repo.mode === 'api' ? repo : null
  const localRepo = repo.mode === 'local' ? repo : null
  const [result, setResult] = useState<EvaluationResult>(() =>
    apiRepo ? EMPTY_RESULT : runEvaluation(dataset),
  )
  const [reviews, setReviews] = useState<ReviewMap>(() => (localRepo ? localRepo.listSync() : new Map()))
  const [saveErrorFor, setSaveErrorFor] = useState<string | null>(null)
  const [status, setStatus] = useState<WorkbenchStatus>(apiRepo ? 'loading' : 'ready')
  const [loading, setLoading] = useState(apiRepo !== null)
  const [errorKind, setErrorKind] = useState<LoadErrorKind | null>(null)
  const [meta, setMeta] = useState({ evaluationTime: EVALUATION_TIME, thresholdHours: DEFAULT_THRESHOLD_HOURS })
  const latestRequest = useRef(0)
  const { open, reviewed } = buildQueue(result.flagged, reviews, RULE_ID)
  function fetchQueue() {
    if (apiRepo === null) return
    latestRequest.current += 1
    const id = latestRequest.current
    const isCurrent = () => id === latestRequest.current
    void requestQueue(apiRepo, {
      onSuccess(response) {
        if (!isCurrent()) return
        setResult({
          flagged: toFlaggedOrders(response),
          skipped: response.skipped,
          checkedCount: response.checkedCount,
        })
        setReviews(toReviewMap(response))
        setMeta({ evaluationTime: response.evaluationTime, thresholdHours: response.thresholdHours })
        setErrorKind(null)
        setStatus('ready')
        setLoading(false)
      },
      onFailure(kind) {
        if (!isCurrent()) return
        if (kind === 'unauthorized') {
          // Sign-in restarts the page. Keep the loading state and show no error or Retry.
          onUnauthorized?.()
          return
        }
        if (kind === 'forbidden') {
          setStatus('forbidden')
          setErrorKind(null)
        } else {
          setStatus('error')
          setErrorKind(kind)
        }
        setLoading(false)
      },
    })
  }
  useEffect(() => {
    fetchQueue()
    // The first load runs once on mount; Re-run and Retry call reload().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function reload() {
    if (apiRepo === null || loading) return
    setLoading(true)
    fetchQueue()
  }
  function rerun() {
    if (localRepo) {
      setResult(runEvaluation(dataset))
      setReviews(localRepo.listSync())
      return
    }
    reload()
  }
  function markReviewed(orderId: string) {
    if (localRepo) {
      const saved = localRepo.saveSync(orderId, RULE_ID, now().toISOString())
      setReviews(saved.reviews)
      setSaveErrorFor(saved.ok ? null : orderId)
      return
    }
    if (apiRepo === null) return
    void apiRepo.save(orderId, RULE_ID, now().toISOString()).then((saved) => {
      if (saved.ok) {
        setReviews((prev) => new Map(prev).set(reviewKey(orderId, RULE_ID), saved.review))
        setSaveErrorFor(null)
      } else if (saved.error.kind === 'unauthorized') {
        onUnauthorized?.()
      } else if (saved.error.kind === 'forbidden') {
        // No Retry for a permission failure: show the not-in-group screen instead.
        setSaveErrorFor(null)
        setStatus('forbidden')
      } else {
        setSaveErrorFor(orderId)
      }
    })
  }
  return (
    <WorkbenchContext.Provider
      value={{
        result,
        reviews,
        open,
        reviewed,
        saveErrorFor,
        rerun,
        markReviewed,
        mode: apiRepo ? 'api' : 'local',
        status,
        loading,
        errorKind,
        evaluationTime: meta.evaluationTime,
        thresholdHours: meta.thresholdHours,
        reload,
      }}
    >
      {children}
    </WorkbenchContext.Provider>
  )
}
