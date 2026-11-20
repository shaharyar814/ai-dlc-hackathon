interface LoadStatusProps {
  state: 'loading' | 'error'
  /** True while a request is in progress. Disables Retry. */
  busy: boolean
  onRetry: () => void
}
export default function LoadStatus({ state, busy, onRetry }: LoadStatusProps) {
  return (
    <div>
      {state === 'error' && <p role="alert">Could not load the queue.</p>}
      {(state === 'loading' || busy) && <p role="status">Loading the queue…</p>}
      {state === 'error' && (
        <button type="button" onClick={onRetry} disabled={busy}>
          Retry
        </button>
      )}
    </div>
  )
}
