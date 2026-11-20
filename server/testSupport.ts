import type { DynamoLike, ReviewKey, StoredReview } from './reviewStore.ts'
import { reviewKey } from '../src/rules/queue.ts'

export interface FakeDynamo extends DynamoLike {
  /** Number of items actually written. */
  writes: number
  /** Make the named operation throw until reset. */
  failOn: { put: boolean; get: boolean; batchGet: boolean }
  /** The next N batchGet calls leave about half of their keys unprocessed. */
  unprocessedRounds: number
  /** Every batchGet leaves at least one key unprocessed. */
  alwaysUnprocessed: boolean
  /** Number of batchGet calls and the size of the largest request. */
  batchCalls: number
  largestBatch: number
  /** A copy of the stored items. */
  snapshot(): StoredReview[]
  /** Put an item in without counting it as a write. */
  seed(item: StoredReview): void
}

/** In-memory stand-in for the DynamoDB table. The conditional put is atomic (no await between check and set). */
export function createFakeDynamo(): FakeDynamo {
  const table = new Map<string, StoredReview>()
  const fake: FakeDynamo = {
    writes: 0,
    failOn: { put: false, get: false, batchGet: false },
    unprocessedRounds: 0,
    alwaysUnprocessed: false,
    batchCalls: 0,
    largestBatch: 0,
    snapshot: () => [...table.values()].map((r) => ({ ...r })),
    seed(item) {
      table.set(reviewKey(item.orderId, item.ruleId), { ...item })
    },
    async putIfAbsent(item) {
      await Promise.resolve()
      if (fake.failOn.put) throw new Error('simulated put failure')
      const key = reviewKey(item.orderId, item.ruleId)
      if (table.has(key)) return false
      table.set(key, { ...item })
      fake.writes += 1
      return true
    },
    async get(key: ReviewKey) {
      await Promise.resolve()
      if (fake.failOn.get) throw new Error('simulated get failure')
      const found = table.get(reviewKey(key.orderId, key.ruleId))
      return found ? { ...found } : null
    },
    async batchGet(keys) {
      await Promise.resolve()
      fake.batchCalls += 1
      fake.largestBatch = Math.max(fake.largestBatch, keys.length)
      if (fake.failOn.batchGet) throw new Error('simulated batch failure')
      if (keys.length > 100) throw new Error('batch too large')
      let processed = keys
      let unprocessed: ReviewKey[] = []
      if (fake.alwaysUnprocessed || fake.unprocessedRounds > 0) {
        if (fake.unprocessedRounds > 0) fake.unprocessedRounds -= 1
        const cut = fake.alwaysUnprocessed ? 0 : Math.ceil(keys.length / 2)
        processed = keys.slice(0, cut)
        unprocessed = keys.slice(cut)
      }
      const items: StoredReview[] = []
      for (const k of processed) {
        const found = table.get(reviewKey(k.orderId, k.ruleId))
        if (found) items.push({ ...found })
      }
      return { items, unprocessed }
    },
  }
  return fake
}
