import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { REVIEW_STORAGE_KEY } from '../config.ts'
import { reviewKey } from '../rules/queue.ts'
import { loadReviews, saveReview } from './reviews.ts'
import type { StorageLike } from './reviews.ts'

const RULE = 'paid-unfulfilled'
const T1 = '2026-11-20T12:05:31.000Z'
const T2 = '2026-11-20T13:00:00.000Z'

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>()
  readonly writes: string[] = []
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.writes.push(key)
    this.data.set(key, value)
  }
}

function withRaw(raw: string): FakeStorage {
  const s = new FakeStorage()
  s.data.set(REVIEW_STORAGE_KEY, raw)
  return s
}

describe('Review_Store', () => {
  it('saves then loads the same record', () => {
    const s = new FakeStorage()
    expect(saveReview(s, '1042', RULE, T1).ok).toBe(true)
    const loaded = loadReviews(s).get(reviewKey('1042', RULE))
    expect(loaded).toEqual({ orderId: '1042', ruleId: RULE, reviewedAt: T1 })
  })

  it('keeps the first timestamp on a second save and does not write again', () => {
    const s = new FakeStorage()
    saveReview(s, '1042', RULE, T1)
    const second = saveReview(s, '1042', RULE, T2)
    expect(second.ok).toBe(true)
    expect(second.reviews.get(reviewKey('1042', RULE))?.reviewedAt).toBe(T1)
    expect(s.writes).toHaveLength(1)
    expect(JSON.parse(s.data.get(REVIEW_STORAGE_KEY) as string)).toHaveLength(1)
  })

  it('writes only the single review key', () => {
    const s = new FakeStorage()
    saveReview(s, '1', RULE, T1)
    saveReview(s, '2', RULE, T1)
    expect([...s.data.keys()]).toEqual([REVIEW_STORAGE_KEY])
    expect(new Set(s.writes)).toEqual(new Set([REVIEW_STORAGE_KEY]))
  })

  it('takes the timestamp from the argument', () => {
    const s = new FakeStorage()
    saveReview(s, '1', RULE, T2)
    expect(loadReviews(s).get(reviewKey('1', RULE))?.reviewedAt).toBe(T2)
  })

  it.each([
    ['corrupt JSON', '{not json'],
    ['a non-array', '{"orderId":"1"}'],
    ['a malformed entry', JSON.stringify([{ orderId: '1', ruleId: RULE, reviewedAt: T1 }, { orderId: 1 }])],
    ['an unparsable timestamp', JSON.stringify([{ orderId: '1', ruleId: RULE, reviewedAt: 'yesterday' }])],
    ['a null entry', 'null'],
  ])('loads %s as empty without throwing', (_label, raw) => {
    expect(loadReviews(withRaw(raw)).size).toBe(0)
  })

  it('loads an absent key, null storage, and a throwing getItem as empty', () => {
    expect(loadReviews(new FakeStorage()).size).toBe(0)
    expect(loadReviews(null).size).toBe(0)
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
    }
    expect(loadReviews(throwing).size).toBe(0)
  })

  it('returns ok false with the previous reviews when setItem throws', () => {
    const s = new FakeStorage()
    saveReview(s, '1', RULE, T1)
    const failing: StorageLike = {
      getItem: (k) => s.getItem(k),
      setItem: () => {
        throw new Error('quota')
      },
    }
    const result = saveReview(failing, '2', RULE, T2)
    expect(result.ok).toBe(false)
    expect([...result.reviews.keys()]).toEqual([reviewKey('1', RULE)])
  })

  it('returns ok false for null storage', () => {
    const result = saveReview(null, '1', RULE, T1)
    expect(result.ok).toBe(false)
    expect(result.reviews.size).toBe(0)
  })

  it('overwrites corrupt data on the next successful save', () => {
    const s = withRaw('{not json')
    expect(saveReview(s, '1', RULE, T1).ok).toBe(true)
    expect(loadReviews(s).size).toBe(1)
  })

  it('keeps the first entry when stored data has duplicate keys', () => {
    const raw = JSON.stringify([
      { orderId: '1', ruleId: RULE, reviewedAt: T1 },
      { orderId: '1', ruleId: RULE, reviewedAt: T2 },
    ])
    const loaded = loadReviews(withRaw(raw))
    expect(loaded.size).toBe(1)
    expect(loaded.get(reviewKey('1', RULE))?.reviewedAt).toBe(T1)
  })
})

// ---------------------------------------------------------------------------
// Property tests (fast-check)
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 }
const isoArb = fc.integer({ min: 0, max: 4_102_444_800_000 }).map((ms) => new Date(ms).toISOString())
const idArb = fc.string({ minLength: 1, maxLength: 8 })

describe('Review_Store properties', () => {
  it('Feature: stalled-orders, Property 9: Review round trip', () => {
    const arb = fc.uniqueArray(fc.record({ orderId: idArb, ruleId: idArb, reviewedAt: isoArb }), {
      selector: (r) => reviewKey(r.orderId, r.ruleId),
      maxLength: 10,
    })
    fc.assert(
      fc.property(arb, (records) => {
        const s = new FakeStorage()
        for (const r of records) expect(saveReview(s, r.orderId, r.ruleId, r.reviewedAt).ok).toBe(true)
        const loaded = loadReviews(s)
        expect(loaded.size).toBe(records.length)
        for (const r of records) expect(loaded.get(reviewKey(r.orderId, r.ruleId))).toEqual(r)
      }),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 10: A second review keeps the first', () => {
    fc.assert(
      fc.property(idArb, idArb, isoArb, isoArb, (orderId, ruleId, first, second) => {
        const s = new FakeStorage()
        saveReview(s, orderId, ruleId, first)
        const result = saveReview(s, orderId, ruleId, second)
        expect(result.ok).toBe(true)
        expect(s.writes).toHaveLength(1)
        const loaded = loadReviews(s)
        expect(loaded.size).toBe(1)
        expect(loaded.get(reviewKey(orderId, ruleId))?.reviewedAt).toBe(first)
      }),
      RUNS,
    )
  })

  it('Feature: stalled-orders, Property 11: Bad storage never breaks loading', () => {
    const storedArb = fc.oneof(
      fc.string(),
      fc.json(),
      fc.array(fc.anything()).map((v) => JSON.stringify(v) ?? ''),
      fc
        .array(fc.record({ orderId: fc.anything(), ruleId: fc.anything(), reviewedAt: fc.anything() }))
        .filter((a) => a.length > 0)
        .map((v) => JSON.stringify(v) ?? ''),
    )
    fc.assert(
      fc.property(storedArb, (raw) => {
        expect(loadReviews(withRaw(raw)).size).toBe(0)
      }),
      RUNS,
    )

    const throwingGet: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
    }
    expect(loadReviews(throwingGet).size).toBe(0)
    expect(loadReviews(null).size).toBe(0)

    fc.assert(
      fc.property(
        fc.uniqueArray(idArb, { maxLength: 5 }),
        idArb,
        isoArb,
        (existing, newId, at) => {
          const s = new FakeStorage()
          for (const id of existing) saveReview(s, id, RULE, at)
          const failing: StorageLike = {
            getItem: (k) => s.getItem(k),
            setItem: () => {
              throw new Error('quota')
            },
          }
          const before = loadReviews(s)
          const result = saveReview(failing, `new-${newId}`, RULE, at)
          expect(result.ok).toBe(false)
          expect([...result.reviews.entries()]).toEqual([...before.entries()])
        },
      ),
      RUNS,
    )
  })
})
