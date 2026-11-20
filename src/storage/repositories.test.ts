import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client.ts'
import type { ApiClient } from '../api/client.ts'
import type { QueueResponse } from '../api/wire.ts'
import { REVIEW_STORAGE_KEY, RULE_ID } from '../config.ts'
import { createApiRepository } from './apiRepository.ts'
import { createLocalRepository } from './localRepository.ts'
import type { StorageLike } from './reviews.ts'

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const T1 = '2026-11-20T12:05:00.000Z'
const T2 = '2026-11-20T12:09:00.000Z'

describe('LocalRepository', () => {
  it('wraps the unchanged store and keeps the first review', async () => {
    const storage = memory()
    const repo = createLocalRepository(storage)
    const first = await repo.save('1042', RULE_ID, T1)
    expect(first).toEqual({ ok: true, created: true, review: { orderId: '1042', ruleId: RULE_ID, reviewedAt: T1 } })
    const again = await repo.save('1042', RULE_ID, T2)
    expect(again).toMatchObject({ ok: true, created: false, review: { reviewedAt: T1 } })
    expect((await repo.list()).size).toBe(1)
    expect(JSON.parse(storage.data.get(REVIEW_STORAGE_KEY) ?? '[]')).toHaveLength(1)
  })

  it('returns null, not an error, for an absent review', async () => {
    const repo = createLocalRepository(memory())
    expect(await repo.get('nope', RULE_ID)).toBeNull()
  })

  it('reports a storage failure and keeps the order unreviewed', async () => {
    const repo = createLocalRepository(null)
    const out = await repo.save('1', RULE_ID, T1)
    expect(out).toMatchObject({ ok: false, error: { kind: 'storage' } })
    expect(repo.listSync().size).toBe(0)
  })

  it('offers a synchronous fast path with the same result', () => {
    const repo = createLocalRepository(memory())
    const out = repo.saveSync('1', RULE_ID, T1)
    expect(out.ok).toBe(true)
    expect(out.reviews.size).toBe(1)
    expect(repo.listSync().size).toBe(1)
  })
})

const queue: QueueResponse = {
  ruleId: RULE_ID,
  evaluationTime: '2026-11-20T12:00:00Z',
  thresholdHours: 24,
  checkedCount: 1,
  rows: [
    {
      order: { orderId: '1', paymentStatus: 'paid', paidAtMs: 0, paidAt: '2026-11-19T00:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
      elapsedMs: 1,
      review: { reviewedAt: T1, reviewer: 'lead1' },
    },
  ],
  skipped: [],
}

describe('ApiRepository', () => {
  it('derives get and list from the latest queue and writes nothing to local storage', async () => {
    const storage = memory()
    const client: ApiClient = { getQueue: vi.fn(() => Promise.resolve(queue)), postReview: vi.fn() }
    const repo = createApiRepository(client)
    expect(await repo.get('1', RULE_ID)).toBeNull()
    await repo.loadQueue()
    expect(await repo.get('1', RULE_ID)).toEqual({ orderId: '1', ruleId: RULE_ID, reviewedAt: T1, reviewer: 'lead1' })
    expect((await repo.list()).size).toBe(1)
    expect(storage.data.size).toBe(0)
  })

  it('saves through the client, ignores requestedAt, and remembers the review', async () => {
    const review = { orderId: '2', ruleId: RULE_ID, reviewedAt: T2, reviewer: 'lead2' }
    const postReview = vi.fn(() => Promise.resolve({ review, created: true }))
    const repo = createApiRepository({ getQueue: vi.fn(), postReview })
    const out = await repo.save('2', RULE_ID, '1999-01-01T00:00:00.000Z')
    expect(out).toEqual({ ok: true, created: true, review })
    expect(postReview).toHaveBeenCalledWith('2', RULE_ID)
    expect(await repo.get('2', RULE_ID)).toEqual(review)
  })

  it('turns a client failure into a failed outcome with the error kind', async () => {
    const repo = createApiRepository({
      getQueue: vi.fn(),
      postReview: vi.fn(() => Promise.reject(new ApiError('timeout'))),
    })
    expect(await repo.save('2', RULE_ID, T1)).toEqual({
      ok: false,
      error: { kind: 'timeout', message: 'Could not save the review.' },
    })
  })
})
