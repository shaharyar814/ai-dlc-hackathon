// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { REVIEW_STORAGE_KEY } from './config.ts'
import { DATASET } from './data/orders.ts'
import type { StorageLike } from './storage/reviews.ts'
import type { RawOrder } from './types.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

const FIXED_NOW = () => new Date(Date.UTC(2026, 10, 20, 12, 5, 31))
const FLAGGED_ORDER = ['#1051', '#1049', '#1050', '#998', '#1042', '#1043']

function renderApp(
  storage: StorageLike | null = new FakeStorage(),
  dataset: readonly RawOrder[] = DATASET,
  initialEntry = '/',
) {
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App dataset={dataset} storage={storage} now={FIXED_NOW} />
    </MemoryRouter>,
  )
  return { user, storage, ...utils }
}

function orderButtons(): string[] {
  return screen
    .queryAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('link')[0].textContent ?? '')
}

describe('App', () => {
  it('loads and shows the header and flagged rows in queue order', () => {
    renderApp()
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
    expect(orderButtons()).toEqual(FLAGGED_ORDER)
  })

  it('switches between Open and Reviewed views', async () => {
    const { user } = renderApp()
    const openTab = screen.getByRole('link', { name: 'Open (6)' })
    const reviewedTab = screen.getByRole('link', { name: 'Reviewed (0)' })
    expect(openTab.getAttribute('aria-current')).toBe('page')
    expect(reviewedTab.getAttribute('aria-current')).toBeNull()
    await user.click(reviewedTab)
    expect(screen.getByRole('link', { name: 'Reviewed (0)' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('link', { name: 'Open (6)' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('No reviewed orders yet.')
    await user.click(screen.getByRole('link', { name: 'Open (6)' }))
    expect(orderButtons()).toEqual(FLAGGED_ORDER)
  })

  it('shows the detail of the order link and replaces it on another navigation', async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole('link', { name: '#1042' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('#1042')
    expect(screen.getByText('27 h 0 min')).toBeTruthy()
    expect(screen.getByText('0 of 2 units fulfilled')).toBeTruthy()
    expect(screen.getByText('Confirm pick status with the warehouse.')).toBeTruthy()
    await user.click(screen.getByRole('link', { name: /Back to queue/ }))
    expect(orderButtons()).toEqual(FLAGGED_ORDER)
    await user.click(screen.getByRole('link', { name: '#1051' }))
    expect(screen.queryByText('0 of 2 units fulfilled')).toBeNull()
    expect(screen.getByText('0 of 4 units fulfilled')).toBeTruthy()
  })

  it('opens an order directly from its initial entry', () => {
    renderApp(new FakeStorage(), DATASET, '/orders/1042')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('#1042')
    expect(screen.getByText('0 of 2 units fulfilled')).toBeTruthy()
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
  })

  it('marks #1042 reviewed with the injected timestamp and hides its button', async () => {
    const { user } = renderApp()
    const row = screen.getByRole('link', { name: '#1042' }).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Mark reviewed' }))
    expect(orderButtons()).not.toContain('#1042')
    await user.click(screen.getByRole('link', { name: /^Reviewed \(\d+\)$/ }))
    expect(orderButtons()).toEqual(['#1042'])
    expect(screen.getByText('2026-11-20 12:05 UTC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })

  it('keeps one row per order and the same views and timestamps on re-run', async () => {
    const { user } = renderApp()
    await user.click(
      within(screen.getByRole('link', { name: '#1042' }).closest('tr') as HTMLElement).getByRole(
        'button',
        { name: 'Mark reviewed' },
      ),
    )
    const openBefore = orderButtons()
    await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
    expect(orderButtons()).toEqual(openBefore)
    expect(new Set(orderButtons()).size).toBe(orderButtons().length)
    await user.click(screen.getByRole('link', { name: /^Reviewed \(\d+\)$/ }))
    expect(orderButtons()).toEqual(['#1042'])
    expect(screen.getByText('2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('shows the skipped records on the Data quality page', async () => {
    const { user } = renderApp()
    expect(screen.queryByText('Missing paymentTimestamp')).toBeNull()
    await user.click(screen.getByRole('link', { name: 'Data quality' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Data quality')
    expect(screen.getByText('#1053')).toBeTruthy()
    expect(screen.getByText('Missing paymentTimestamp')).toBeTruthy()
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
  })

  it('writes the review to the single storage key', async () => {
    const { user, storage } = renderApp()
    await user.click(screen.getAllByRole('button', { name: 'Mark reviewed' })[0])
    expect([...(storage as FakeStorage).data.keys()]).toEqual([REVIEW_STORAGE_KEY])
  })
})

async function markReviewed(user: ReturnType<typeof userEvent.setup>, id: string) {
  const row = screen.getByRole('link', { name: id }).closest('tr') as HTMLElement
  await user.click(within(row).getByRole('button', { name: 'Mark reviewed' }))
}

describe('App: remaining behavior', () => {
  it('Operator marks #1042 reviewed and reloads: #1042 remains in Reviewed with its timestamp', async () => {
    const storage = new FakeStorage()
    const first = renderApp(storage)
    await markReviewed(first.user, '#1042')
    first.unmount()

    const second = renderApp(storage)
    expect(orderButtons()).not.toContain('#1042')
    await second.user.click(screen.getByRole('link', { name: /^Reviewed \(\d+\)$/ }))
    expect(orderButtons()).toEqual(['#1042'])
    expect(screen.getByText('2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it.each([
    ['corrupt JSON', (() => {
      const s = new FakeStorage()
      s.data.set(REVIEW_STORAGE_KEY, '{not json')
      return s
    })()],
    ['a throwing getItem', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
    } satisfies StorageLike],
    ['null storage', null],
  ])('does not crash with %s and shows every order as Open', (_label, storage) => {
    renderApp(storage)
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
    expect(orderButtons()).toEqual(FLAGGED_ORDER)
    expect(screen.getAllByRole('button', { name: 'Mark reviewed' })).toHaveLength(6)
  })

  it('keeps the order Open and shows an alert when setItem throws', async () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const { user } = renderApp(storage)
    await markReviewed(user, '#1042')
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not save the review. The order stays open.',
    )
    expect(orderButtons()).toContain('#1042')
    // The app stays usable.
    await user.click(screen.getByRole('link', { name: '#1043' }))
    expect(screen.getByText('24 h 0 min')).toBeTruthy()
  })

  it('clears the alert after the next successful save', async () => {
    const storage = new FakeStorage()
    let fail = true
    const flaky: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (fail) throw new Error('quota')
        storage.setItem(k, v)
      },
    }
    const { user } = renderApp(flaky)
    await markReviewed(user, '#1042')
    expect(screen.getByRole('alert')).toBeTruthy()
    fail = false
    await markReviewed(user, '#1042')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('drops a stale review from both views but keeps it saved, and restores it on a match', async () => {
    const storage = new FakeStorage()
    const first = renderApp(storage)
    await markReviewed(first.user, '#1042')
    first.unmount()
    const savedBefore = storage.data.get(REVIEW_STORAGE_KEY)

    const fulfilled = DATASET.map((r) =>
      r.orderId === '1042' ? { ...r, fulfilledQuantity: 2 } : r,
    )
    const stale = renderApp(storage, fulfilled)
    expect(orderButtons()).not.toContain('#1042')
    await stale.user.click(screen.getByRole('link', { name: /^Reviewed \(\d+\)$/ }))
    expect(screen.getByRole('status').textContent).toBe('No reviewed orders yet.')
    expect(storage.data.get(REVIEW_STORAGE_KEY)).toBe(savedBefore)
    stale.unmount()

    const again = renderApp(storage)
    await again.user.click(screen.getByRole('link', { name: /^Reviewed \(\d+\)$/ }))
    expect(orderButtons()).toEqual(['#1042'])
    expect(screen.getByText('2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('handles an empty dataset', () => {
    renderApp(new FakeStorage(), [])
    expect(screen.getByText('0 checked, 0 skipped')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('No stalled orders. Nothing needs review.')
  })

  it('makes no fetch or XMLHttpRequest calls', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, 'send')
    const { user } = renderApp()
    await user.click(screen.getByRole('link', { name: '#1042' }))
    await user.click(screen.getByRole('link', { name: /Back to queue/ }))
    await markReviewed(user, '#1042')
    await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('writes only the review key and leaves the dataset unchanged', async () => {
    const before = structuredClone(DATASET)
    const keys: string[] = []
    const storage = new FakeStorage()
    const tracking: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        keys.push(k)
        storage.setItem(k, v)
      },
    }
    const { user } = renderApp(tracking)
    await markReviewed(user, '#1042')
    await markReviewed(user, '#1043')
    await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
    expect(new Set(keys)).toEqual(new Set([REVIEW_STORAGE_KEY]))
    expect(DATASET).toEqual(before)
  })

  it('marks an order reviewed from its order page', async () => {
    const { user } = renderApp(new FakeStorage(), DATASET, '/orders/1042')
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
    await user.click(screen.getByRole('link', { name: /Back to queue/ }))
    expect(orderButtons()).not.toContain('#1042')
  })

  it('supports opening an order and marking it reviewed with the keyboard only', async () => {
    const { user } = renderApp()
    for (let i = 0; i < 30; i++) {
      await user.tab()
      if (document.activeElement?.textContent === '#1042') break
    }
    expect(document.activeElement?.textContent).toBe('#1042')
    await user.keyboard('{Enter}')
    expect(screen.getByText('0 of 2 units fulfilled')).toBeTruthy()
    for (let i = 0; i < 10; i++) {
      await user.tab()
      if (document.activeElement?.textContent === 'Mark reviewed') break
    }
    expect(document.activeElement?.textContent).toBe('Mark reviewed')
    await user.keyboard('{Enter}')
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
  })
})
