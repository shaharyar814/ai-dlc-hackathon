import { describe, expect, it } from 'vitest'
import { reviewKey } from '../src/rules/queue.ts'
import { DynamoReviewStore, ReviewStoreError } from './reviewStore.ts'
import { createFakeDynamo } from './testSupport.ts'

const T1 = '2026-11-20T12:05:31.000Z'
const T2 = '2026-11-20T12:09:00.000Z'

describe('DynamoReviewStore.save', () => {
  it('writes the first review with a conditional put', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    const out = await store.save('1042', 'paid-unfulfilled', T1, 'lead1')
    expect(out).toEqual({
      created: true,
      review: { orderId: '1042', ruleId: 'paid-unfulfilled', reviewedAt: T1, reviewer: 'lead1' },
    })
    expect(db.writes).toBe(1)
  })

  it('returns the existing review and writes nothing for a repeat', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    await store.save('1042', 'paid-unfulfilled', T1, 'lead1')
    const out = await store.save('1042', 'paid-unfulfilled', T2, 'lead2')
    expect(out.created).toBe(false)
    expect(out.review).toMatchObject({ reviewedAt: T1, reviewer: 'lead1' })
    expect(db.writes).toBe(1)
    expect(db.snapshot()).toHaveLength(1)
  })

  it('throws a save error and leaves earlier reviews unchanged when the put fails', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    await store.save('1', 'paid-unfulfilled', T1, 'lead1')
    const before = db.snapshot()
    db.failOn.put = true
    const err = await store.save('2', 'paid-unfulfilled', T2, 'lead1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReviewStoreError)
    expect((err as ReviewStoreError).operation).toBe('save')
    expect(db.snapshot()).toEqual(before)
  })

  it('throws a save error when the read after a conditional failure fails', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    await store.save('1', 'paid-unfulfilled', T1, 'lead1')
    db.failOn.get = true
    await expect(store.save('1', 'paid-unfulfilled', T2, 'lead2')).rejects.toMatchObject({ operation: 'save' })
    expect(db.snapshot()).toHaveLength(1)
  })
})

describe('DynamoReviewStore.getMany', () => {
  it('returns existing reviews keyed by reviewKey and nothing for unsaved pairs', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    await store.save('1', 'paid-unfulfilled', T1, 'lead1')
    const found = await store.getMany([
      { orderId: '1', ruleId: 'paid-unfulfilled' },
      { orderId: '2', ruleId: 'paid-unfulfilled' },
    ])
    expect([...found.keys()]).toEqual([reviewKey('1', 'paid-unfulfilled')])
  })

  it('splits more than 100 keys into chunks of at most 100', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    const keys = Array.from({ length: 250 }, (_, i) => ({ orderId: `o${i}`, ruleId: 'paid-unfulfilled' }))
    for (const k of keys.filter((_, i) => i % 50 === 0)) db.seed({ ...k, reviewedAt: T1, reviewer: 'lead1' })
    const found = await store.getMany(keys)
    expect(found.size).toBe(5)
    expect(db.batchCalls).toBe(3)
    expect(db.largestBatch).toBeLessThanOrEqual(100)
  })

  it('retries unprocessed keys and still returns every review', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    const keys = Array.from({ length: 10 }, (_, i) => ({ orderId: `o${i}`, ruleId: 'paid-unfulfilled' }))
    for (const k of keys) db.seed({ ...k, reviewedAt: T1, reviewer: 'lead1' })
    db.unprocessedRounds = 2
    const found = await store.getMany(keys)
    expect(found.size).toBe(10)
    expect(db.batchCalls).toBeGreaterThan(1)
  })

  it('fails with a get error when keys stay unprocessed, and writes nothing', async () => {
    const db = createFakeDynamo()
    const store = new DynamoReviewStore(db)
    db.seed({ orderId: 'a', ruleId: 'paid-unfulfilled', reviewedAt: T1, reviewer: 'lead1' })
    db.alwaysUnprocessed = true
    await expect(store.getMany([{ orderId: 'a', ruleId: 'paid-unfulfilled' }])).rejects.toMatchObject({
      name: 'ReviewStoreError',
      operation: 'get',
    })
    expect(db.writes).toBe(0)
    expect(db.snapshot()).toHaveLength(1)
  })

  it('fails with a get error when the batch read fails', async () => {
    const db = createFakeDynamo()
    db.failOn.batchGet = true
    await expect(
      new DynamoReviewStore(db).getMany([{ orderId: 'a', ruleId: 'paid-unfulfilled' }]),
    ).rejects.toMatchObject({ operation: 'get' })
  })

  it('makes no call for an empty key list', async () => {
    const db = createFakeDynamo()
    expect((await new DynamoReviewStore(db).getMany([])).size).toBe(0)
    expect(db.batchCalls).toBe(0)
  })
})
