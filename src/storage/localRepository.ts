import { reviewKey } from '../rules/queue.ts'
import type { ReviewMap, ReviewRecord } from '../types.ts'
import type { ReviewRepository, SaveOutcome } from './reviewRepository.ts'
import { loadReviews, saveReview } from './reviews.ts'
import type { StorageLike } from './reviews.ts'

export interface LocalRepository extends ReviewRepository {
  readonly mode: 'local'
  /** Synchronous fast path so Local mode keeps its synchronous first render and click handling. */
  listSync(): ReviewMap
  saveSync(orderId: string, ruleId: string, requestedAt: string): SaveOutcome & { readonly reviews: ReviewMap }
}

/** Wraps the unchanged synchronous local store. */
export function createLocalRepository(storage: StorageLike | null): LocalRepository {
  function listSync(): ReviewMap {
    return loadReviews(storage)
  }

  function saveSync(orderId: string, ruleId: string, requestedAt: string) {
    const before = loadReviews(storage)
    const existing = before.get(reviewKey(orderId, ruleId))
    const saved = saveReview(storage, orderId, ruleId, requestedAt)
    if (!saved.ok) {
      return {
        ok: false as const,
        error: { kind: 'storage' as const, message: saved.error },
        reviews: saved.reviews,
      }
    }
    const review = saved.reviews.get(reviewKey(orderId, ruleId)) as ReviewRecord
    return { ok: true as const, created: existing === undefined, review, reviews: saved.reviews }
  }

  return {
    mode: 'local',
    listSync,
    saveSync,
    get: (orderId, ruleId) => Promise.resolve(listSync().get(reviewKey(orderId, ruleId)) ?? null),
    list: () => Promise.resolve(listSync()),
    save: (orderId, ruleId, requestedAt) => {
      const out = saveSync(orderId, ruleId, requestedAt)
      const plain: SaveOutcome = out.ok
        ? { ok: true, created: out.created, review: out.review }
        : { ok: false, error: out.error }
      return Promise.resolve(plain)
    },
  }
}
