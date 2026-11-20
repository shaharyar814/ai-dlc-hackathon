import type { ReviewMap, ReviewRecord } from '../types.ts'

/** Why a save failed. `storage` is local storage; the others mirror the API client's error kinds. */
export type RepositoryErrorKind =
  | 'storage'
  | 'unauthorized'
  | 'forbidden'
  | 'timeout'
  | 'network'
  | 'http'

export interface RepositoryError {
  readonly kind: RepositoryErrorKind
  readonly message: string
}

export type SaveOutcome =
  | { readonly ok: true; readonly created: boolean; readonly review: ReviewRecord }
  | { readonly ok: false; readonly error: RepositoryError }

/**
 * Async access to reviews. One review per `reviewKey(orderId, ruleId)`; the
 * first save wins and a repeat returns the stored review.
 */
export interface ReviewRepository {
  readonly mode: 'local' | 'api'
  /** The saved review, or null when there is none. Never rejects for an absent review. */
  get(orderId: string, ruleId: string): Promise<ReviewRecord | null>
  list(): Promise<ReviewMap>
  /** `requestedAt` is the review time for the local store; the API ignores it (the server stamps the time). */
  save(orderId: string, ruleId: string, requestedAt: string): Promise<SaveOutcome>
}
