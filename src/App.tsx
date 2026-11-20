import { useState } from 'react'
import './App.css'
import Header from './components/Header.tsx'
import OrderDetail from './components/OrderDetail.tsx'
import QueueTable from './components/QueueTable.tsx'
import type { QueueView } from './components/QueueTable.tsx'
import SkippedList from './components/SkippedList.tsx'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME, RULE_ID } from './config.ts'
import { DATASET } from './data/orders.ts'
import { evaluate } from './rules/paidUnfulfilled.ts'
import { buildQueue } from './rules/queue.ts'
import { getBrowserStorage, loadReviews, saveReview } from './storage/reviews.ts'
import type { StorageLike } from './storage/reviews.ts'
import type { EvaluationResult, RawOrder } from './types.ts'

interface AppProps {
  dataset?: readonly RawOrder[]
  storage?: StorageLike | null
  now?: () => Date
}

const SAVE_ERROR = 'Could not save the review. The order stays open.'

function runEvaluation(dataset: readonly RawOrder[]): EvaluationResult {
  return evaluate(dataset, EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS)
}

export default function App({
  dataset = DATASET,
  storage = getBrowserStorage(),
  now = () => new Date(),
}: AppProps) {
  const [result, setResult] = useState(() => runEvaluation(dataset))
  const [reviews, setReviews] = useState(() => loadReviews(storage))
  const [view, setView] = useState<QueueView>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [skippedOpen, setSkippedOpen] = useState(false)

  const { open, reviewed } = buildQueue(result.flagged, reviews, RULE_ID)
  const rows = view === 'open' ? open : reviewed
  const selected = [...open, ...reviewed].find((r) => r.flagged.order.orderId === selectedId)

  function handleRerun() {
    const next = runEvaluation(dataset)
    setResult(next)
    setReviews(loadReviews(storage))
    if (!next.flagged.some((f) => f.order.orderId === selectedId)) setSelectedId(null)
  }

  function handleMarkReviewed(orderId: string) {
    const saved = saveReview(storage, orderId, RULE_ID, now().toISOString())
    setReviews(saved.reviews)
    setSaveError(!saved.ok)
  }

  return (
    <main className="app">
      <Header
        checkedCount={result.checkedCount}
        skippedCount={result.skipped.length}
        evaluationTime={EVALUATION_TIME}
        onRerun={handleRerun}
        onOpenSkipped={() => setSkippedOpen(true)}
      />
      {skippedOpen && (
        <SkippedList skipped={result.skipped} onClose={() => setSkippedOpen(false)} />
      )}
      <div role="group" aria-label="Queue view">
        <button type="button" aria-pressed={view === 'open'} onClick={() => setView('open')}>
          Open
        </button>
        <button
          type="button"
          aria-pressed={view === 'reviewed'}
          onClick={() => setView('reviewed')}
        >
          Reviewed
        </button>
      </div>
      {saveError && <p role="alert">{SAVE_ERROR}</p>}
      <QueueTable
        rows={rows}
        view={view}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMarkReviewed={handleMarkReviewed}
        thresholdHours={DEFAULT_THRESHOLD_HOURS}
      />
      {selected && <OrderDetail flagged={selected.flagged} review={selected.review} />}
    </main>
  )
}
