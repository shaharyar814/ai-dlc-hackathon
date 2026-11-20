// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import { REVIEW_STORAGE_KEY } from '../config.ts'
import WorkbenchProvider from '../state/WorkbenchProvider.tsx'
import type { StorageLike } from '../storage/reviews.ts'
import OrderPage from './OrderPage.tsx'

afterEach(cleanup)

function fakeStorage(initial?: string): StorageLike {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(REVIEW_STORAGE_KEY, initial)
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

function renderPage(orderId: string, storage: StorageLike = fakeStorage()) {
  const tree = (id: string) => (
    <MemoryRouter>
      <WorkbenchProvider storage={storage} now={() => new Date('2026-11-20T10:00:00Z')}>
        <OrderPage orderId={id} />
      </WorkbenchProvider>
    </MemoryRouter>
  )
  const result = render(tree(orderId))
  return { ...result, rerenderWith: (id: string) => result.rerender(tree(id)) }
}

describe('OrderPage', () => {
  it('shows the evidence, rule and suggested action for Order #1042', () => {
    renderPage('1042')
    expect(screen.getByText('#1042')).toBeTruthy()
    expect(screen.getByText('2026-11-19 09:00 UTC')).toBeTruthy()
    expect(screen.getByText('27 h 0 min')).toBeTruthy()
    expect(screen.getByText('0 of 2 units fulfilled')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    expect(screen.getByText('Paid and unfulfilled')).toBeTruthy()
    expect(screen.getByText('Confirm pick status with the warehouse.')).toBeTruthy()
  })

  it('shows the Open status and a Mark reviewed button for an open order', () => {
    renderPage('1042')
    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeTruthy()
    expect(screen.queryByText(/^Reviewed 2/)).toBeNull()
  })

  it('shows the Reviewed status and review time for a reviewed order', () => {
    const saved = JSON.stringify([
      { orderId: '1042', ruleId: 'paid-unfulfilled', reviewedAt: '2026-11-20T10:00:00Z' },
    ])
    renderPage('1042', fakeStorage(saved))
    expect(screen.getByText('Reviewed')).toBeTruthy()
    expect(screen.getByText('Reviewed 2026-11-20 10:00 UTC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })

  it('replaces the detail when a different order is rendered', () => {
    const { rerenderWith } = renderPage('1042')
    rerenderWith('1051')
    expect(screen.queryByText('#1042')).toBeNull()
    expect(screen.getByText('#1051')).toBeTruthy()
    expect(screen.getByText('0 of 4 units fulfilled')).toBeTruthy()
    expect(screen.getByText('93 h 0 min')).toBeTruthy()
  })
})

describe('OrderPage not-found (property)', () => {
  // Feature: ui-redesign, Property 11: Unflagged orders show only the not-found message
  it('Feature: ui-redesign, Property 11: Unflagged orders show only the not-found message', () => {
    // Validates: Requirement 8.8
    const flagged = new Set(['998', '1042', '1048', '1049', '1050', '1051'])
    const skipped = ['1045', '1046', '1047', '1053', '1054', '1055', '1056', '1052']
    const ids = fc.oneof(
      fc.string().filter((s) => !flagged.has(s)),
      fc.constantFrom(...skipped),
      fc.integer({ min: 2000, max: 99999 }).map(String),
    )
    fc.assert(
      fc.property(ids, (id) => {
        const { container, unmount } = renderPage(id)
        const h1 = container.querySelectorAll('h1')
        const ok =
          h1.length === 1 &&
          h1[0].textContent === 'Order not found' &&
          container.querySelectorAll('p').length === 1 &&
          container.querySelectorAll('a').length === 1 &&
          container.querySelector('a')!.getAttribute('href') === '/' &&
          screen.queryByRole('progressbar') === null &&
          screen.queryByText('What to check next') === null &&
          screen.queryByRole('button', { name: 'Mark reviewed' }) === null
        unmount()
        return ok
      }),
      { numRuns: 100 },
    )
  })
})
