import type { ApiClient } from '../api/client.ts'
import { toReviewMap } from '../api/wire.ts'
import type { QueueResponse } from '../api/wire.ts'
import { reviewKey } from '../rules/queue.ts'
import type { ReviewMap, ReviewRecord } from '../types.ts'
import type { ReviewRepository, SaveOutcome } from './reviewRepository.ts'

export interface ApiRepository extends ReviewRepository {
  readonly mode: 'api'
  /** Reads the queue and remembers its reviews for `get` and `list`. Rejects with an ApiError. */
  loadQueue(): Promise<QueueResponse>
}

/** Every call goes through the API client. Writes nothing to local storage. */
export function createApiRepository(client: ApiClient): ApiRepository {
  let reviews: ReviewMap = new Map()

  return {
    mode: 'api',
    async loadQueue() {
      const response = await client.getQueue()
      reviews = toReviewMap(response)
      return response
    },
    get: (orderId, ruleId) => Promise.resolve(reviews.get(reviewKey(orderId, ruleId)) ?? null),
    list: () => Promise.resolve(reviews),
    async save(orderId, ruleId): Promise<SaveOutcome> {
      try {
        const { review, created } = await client.postReview(orderId, ruleId)
        const next = new Map<string, ReviewRecord>(reviews)
        next.set(reviewKey(review.orderId, review.ruleId), review)
        reviews = next
        return { ok: true, created, review }
      } catch (error) {
        const kind =
          typeof error === 'object' && error !== null && 'kind' in error
            ? ((error as { kind: unknown }).kind as string)
            : 'network'
        const known = ['unauthorized', 'forbidden', 'timeout', 'network', 'http'] as const
        const safeKind = known.find((k) => k === kind) ?? 'network'
        return { ok: false, error: { kind: safeKind, message: 'Could not save the review.' } }
      }
    },
  }
}
