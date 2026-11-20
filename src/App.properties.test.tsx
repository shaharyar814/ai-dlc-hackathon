// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import fc from 'fast-check'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, it, expect } from 'vitest'
import App from './App.tsx'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME, REVIEW_STORAGE_KEY, RULE_ID } from './config.ts'
import { evaluate } from './rules/paidUnfulfilled.ts'
import { buildQueue, reviewKey } from './rules/queue.ts'
import type { StorageLike } from './storage/reviews.ts'
import type { RawOrder } from './types.ts'
import { orderPath } from './view/routes.ts'
import { documentTitle } from './view/title.ts'

afterEach(cleanup)

const NUM_RUNS = 100
const FIXED_NOW = () => new Date(Date.UTC(2026, 10, 20, 12, 5, 31))
const EVAL_MS = Date.parse(EVALUATION_TIME)

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

interface OrderSpec {
  hoursAgo: number
  paid: boolean
  fulfilled: boolean
  canceled: boolean
  invalid: boolean
  reviewed: boolean
}

const orderSpecArb: fc.Arbitrary<OrderSpec> = fc.record({
  hoursAgo: fc.integer({ min: 0, max: 100 }),
  paid: fc.boolean(),
  fulfilled: fc.boolean(),
  canceled: fc.boolean(),
  invalid: fc.boolean(),
  reviewed: fc.boolean(),
})

// Small dataset: unique IDs "o<i>", some invalid records (skipped), some saved reviews.
const scenarioArb = fc.array(orderSpecArb, { minLength: 0, maxLength: 8 }).map((specs) => {
  const dataset: RawOrder[] = specs.map((s, i) => ({
    orderId: `o${i}`,
    paymentStatus: s.paid ? 'paid' : 'pending',
    paymentTimestamp: s.invalid
      ? 'not-a-time'
      : new Date(EVAL_MS - s.hoursAgo * 3_600_000).toISOString(),
    canceled: s.canceled,
    refundStatus: 'none',
    orderedQuantity: 2,
    fulfilledQuantity: s.fulfilled ? 1 : 0,
  }))
  const result = evaluate(dataset, EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS)
  const flaggedIds = new Set(result.flagged.map((f) => f.order.orderId))
  const reviews = specs
    .map((s, i) => ({ s, id: `o${i}` }))
    .filter(({ s, id }) => s.reviewed && flaggedIds.has(id))
    .map(({ id }) => ({ orderId: id, ruleId: RULE_ID, reviewedAt: '2026-11-20T12:01:00Z' }))
  const storage = new FakeStorage()
  if (reviews.length > 0) storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviews))
  const queue = buildQueue(result.flagged, new Map(reviews.map((r) => [reviewKey(r.orderId, r.ruleId), r])), RULE_ID)
  return { dataset, storage, result, reviewedIds: new Set(reviews.map((r) => r.orderId)), queue }
})

function renderAt(path: string, dataset: readonly RawOrder[], storage: StorageLike) {
  cleanup()
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App dataset={dataset} storage={storage} now={FIXED_NOW} />
    </MemoryRouter>,
  )
}

function bodyRows(): HTMLElement[] {
  return screen.queryAllByRole('row').slice(1)
}

function cardValue(label: string): string {
  const card = screen.getByText(label, { selector: '.summary-card-label' }).closest('.summary-card')
  return card?.querySelector('.summary-card-value')?.textContent ?? ''
}

const NAV_BY_PATH: Record<string, string> = {
  '/': 'Queue',
  '/reviewed': 'Reviewed',
  '/data-quality': 'Data quality',
  '/rule': 'Rule',
}

const safeText = fc.string({ maxLength: 12 }).filter((s) => !/[?#]/.test(s))

describe('App properties', () => {
  // Feature: ui-redesign, Property 3: Navigation current item
  // **Validates: Requirements 2.4, 2.5**
  it('Feature: ui-redesign, Property 3: Navigation current item', () => {
    const pathArb = fc.oneof(
      fc.constantFrom('/', '/reviewed', '/data-quality', '/rule'),
      fc.string({ minLength: 1, maxLength: 8 }).map((id) => orderPath(id)),
      safeText.map((s) => `/${s}`),
    )
    fc.assert(
      fc.property(pathArb, (path) => {
        const { dataset, storage } = { dataset: [] as RawOrder[], storage: new FakeStorage() }
        renderAt(path, dataset, storage)
        const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
        const current = links.filter((l) => l.getAttribute('aria-current') === 'page')
        const expected = NAV_BY_PATH[path]
        if (expected === undefined) {
          expect(current).toHaveLength(0)
        } else {
          expect(current.map((l) => l.textContent)).toEqual([expected])
        }
        expect(links.filter((l) => l.hasAttribute('aria-current') && l.getAttribute('aria-current') !== 'page')).toHaveLength(0)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: ui-redesign, Property 4: Every page has one non-empty h1, and the title matches it
  // **Validates: Requirements 3.1, 3.3, 3.4, 3.5**
  it('Feature: ui-redesign, Property 4: Every page has one non-empty h1, and the title matches it', () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.nat({ max: 7 }),
        fc.oneof(
          fc.constantFrom('/', '/reviewed', '/data-quality', '/rule'),
          fc.constant('dataset-order'),
          fc.string({ maxLength: 8 }).map((id) => orderPath(id)),
          safeText.map((s) => `/${s}`),
        ),
        ({ dataset, storage }, pick, choice) => {
          const path =
            choice === 'dataset-order'
              ? orderPath(dataset.length > 0 ? String(dataset[pick % dataset.length].orderId) : 'none')
              : choice
          renderAt(path, dataset, storage)
          const h1s = document.querySelectorAll('h1')
          expect(h1s).toHaveLength(1)
          const text = h1s[0].textContent ?? ''
          expect(text.trim()).not.toBe('')
          expect(document.title).toBe(documentTitle(text))
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: ui-redesign, Property 6: Queue partition and counts
  // **Validates: Requirements 4.2, 4.3, 4.4, 5.1, 5.3, 5.4**
  it('Feature: ui-redesign, Property 6: Queue partition and counts', () => {
    fc.assert(
      fc.property(scenarioArb, ({ dataset, storage, result, queue }) => {
        const openIds = queue.open.map((r) => r.flagged.order.orderId)
        const reviewedIds = queue.reviewed.map((r) => r.flagged.order.orderId)
        expect(openIds.length + reviewedIds.length).toBe(result.flagged.length)
        expect(openIds.filter((id) => reviewedIds.includes(id))).toEqual([])

        renderAt('/', dataset, storage)
        expect(cardValue('Open')).toBe(String(queue.open.length))
        expect(cardValue('Reviewed')).toBe(String(queue.reviewed.length))
        expect(cardValue('Skipped')).toBe(String(result.skipped.length))
        const tabs = within(screen.getByRole('navigation', { name: 'Queue views' }))
        expect(tabs.getByRole('link', { name: /^Open/ }).textContent).toBe(`Open (${queue.open.length})`)
        expect(tabs.getByRole('link', { name: /^Reviewed/ }).textContent).toBe(
          `Reviewed (${queue.reviewed.length})`,
        )
        expect(bodyRows()).toHaveLength(queue.open.length)

        renderAt('/reviewed', dataset, storage)
        expect(cardValue('Open')).toBe(String(queue.open.length))
        expect(cardValue('Reviewed')).toBe(String(queue.reviewed.length))
        expect(bodyRows()).toHaveLength(queue.reviewed.length)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: ui-redesign, Property 9: Mark reviewed button appears only on open rows
  // **Validates: Requirements 7.1, 7.4**
  it('Feature: ui-redesign, Property 9: Mark reviewed button appears only on open rows', () => {
    fc.assert(
      fc.property(scenarioArb, ({ dataset, storage, queue }) => {
        renderAt('/', dataset, storage)
        const openRows = bodyRows()
        expect(openRows).toHaveLength(queue.open.length)
        for (const row of openRows) {
          expect(within(row).getAllByRole('button', { name: 'Mark reviewed' })).toHaveLength(1)
        }
        expect(screen.queryAllByRole('button', { name: 'Mark reviewed' })).toHaveLength(queue.open.length)

        renderAt('/reviewed', dataset, storage)
        expect(screen.queryAllByRole('button', { name: 'Mark reviewed' })).toHaveLength(0)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
