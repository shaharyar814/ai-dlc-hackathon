import { reviewKey } from '../src/rules/queue.ts'

export interface StoredReview {
  orderId: string
  ruleId: string
  reviewedAt: string
  reviewer: string
}

export interface ReviewKey {
  orderId: string
  ruleId: string
}

export interface SaveOutcome {
  created: boolean
  review: StoredReview
}

export interface ReviewStore {
  /** Reviews for the given keys, keyed by `reviewKey`. Never writes. */
  getMany(keys: readonly ReviewKey[]): Promise<ReadonlyMap<string, StoredReview>>
  /** First write wins. A repeat returns the stored review with `created: false`. */
  save(orderId: string, ruleId: string, reviewedAt: string, reviewer: string): Promise<SaveOutcome>
}

export class ReviewStoreError extends Error {
  readonly operation: 'save' | 'get'
  constructor(operation: 'save' | 'get', options?: { cause?: unknown }) {
    super(`Review store ${operation} failed`, options)
    this.name = 'ReviewStoreError'
    this.operation = operation
  }
}

/** The minimal DynamoDB surface the store needs, so tests can inject a fake. */
export interface DynamoLike {
  /** Writes the item only if no item has the same key. Returns false when one exists. */
  putIfAbsent(item: StoredReview): Promise<boolean>
  /** Consistent read of one item, or null. */
  get(key: ReviewKey): Promise<StoredReview | null>
  /** Consistent read of up to 100 items. Keys the service did not process come back as `unprocessed`. */
  batchGet(keys: readonly ReviewKey[]): Promise<{ items: StoredReview[]; unprocessed: ReviewKey[] }>
}

const BATCH_SIZE = 100
const MAX_BATCH_ATTEMPTS = 5

export class DynamoReviewStore implements ReviewStore {
  private readonly db: DynamoLike

  constructor(db: DynamoLike) {
    this.db = db
  }

  async save(
    orderId: string,
    ruleId: string,
    reviewedAt: string,
    reviewer: string,
  ): Promise<SaveOutcome> {
    const review: StoredReview = { orderId, ruleId, reviewedAt, reviewer }
    try {
      if (await this.db.putIfAbsent(review)) return { created: true, review }
      const existing = await this.db.get({ orderId, ruleId })
      if (existing === null) throw new Error('Existing review not found after a conditional failure')
      return { created: false, review: existing }
    } catch (cause) {
      throw new ReviewStoreError('save', { cause })
    }
  }

  async getMany(keys: readonly ReviewKey[]): Promise<ReadonlyMap<string, StoredReview>> {
    const found = new Map<string, StoredReview>()
    try {
      for (let start = 0; start < keys.length; start += BATCH_SIZE) {
        let pending: ReviewKey[] = keys.slice(start, start + BATCH_SIZE)
        for (let attempt = 0; pending.length > 0; attempt += 1) {
          if (attempt >= MAX_BATCH_ATTEMPTS) throw new Error('Unprocessed keys remain after retries')
          const { items, unprocessed } = await this.db.batchGet(pending)
          for (const item of items) found.set(reviewKey(item.orderId, item.ruleId), item)
          pending = unprocessed
        }
      }
    } catch (cause) {
      throw new ReviewStoreError('get', { cause })
    }
    return found
  }
}
