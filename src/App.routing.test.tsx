// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { REVIEW_STORAGE_KEY } from './config.ts'
import { DATASET } from './data/orders.ts'
import type { StorageLike } from './storage/reviews.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

beforeEach(() => {
  document.title = ''
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
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

function Probe() {
  const { pathname } = useLocation()
  return <output data-testid="path">{pathname}</output>
}

function renderAt(path: string, storage: StorageLike | null = new FakeStorage()) {
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <App dataset={DATASET} storage={storage} now={FIXED_NOW} />
      <Probe />
    </MemoryRouter>,
  )
  return { user, storage, ...utils }
}

function h1Text(): string {
  return screen.getByRole('heading', { level: 1 }).textContent ?? ''
}

function nav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main' })
}

const ALL_PATHS = ['/', '/reviewed', '/data-quality', '/rule', '/orders/1042', '/nope']

describe('routing: pages by hash path', () => {
  it.each([
    ['/', 'Queue'],
    ['', 'Queue'],
    ['/reviewed', 'Reviewed'],
    ['/data-quality', 'Data quality'],
    ['/rule', 'Rule'],
    ['/orders/1042', '#1042'],
    ['/orders/9999', 'Order not found'],
    ['/unknown/path', 'Page not found'],
  ])('path %j shows h1 %j', (path, heading) => {
    renderAt(path)
    expect(h1Text()).toBe(heading)
  })

  it('the Not found link returns to the queue at /', async () => {
    const { user } = renderAt('/nope')
    expect(h1Text()).toBe('Page not found')
    await user.click(screen.getByRole('link', { name: 'Back to the queue' }))
    expect(h1Text()).toBe('Queue')
    expect(screen.getByTestId('path').textContent).toBe('/')
  })
})

describe('shell on every route', () => {
  it.each(ALL_PATHS)('shows nav, chip, counts and Re-run on %s', (path) => {
    renderAt(path)
    const links = within(nav()).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Queue', 'Reviewed', 'Data quality', 'Rule'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/',
      '/reviewed',
      '/data-quality',
      '/rule',
    ])
    expect(screen.getByText('Evaluated at 2026-11-20 12:00 UTC')).toBeTruthy()
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Re-run evaluation' })).toBeTruthy()
  })

  it('Re-run works from every route', async () => {
    for (const path of ALL_PATHS) {
      const { user, unmount } = renderAt(path)
      await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
      expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
      unmount()
    }
  })
})

describe('focus and title', () => {
  it('sets the title on load without moving focus', () => {
    renderAt('/rule')
    expect(document.title).toBe('Rule - Fulfillment Watch')
    expect(document.activeElement).toBe(document.body)
  })

  it('moves focus to the h1 and sets the title on nav click', async () => {
    const { user } = renderAt('/')
    await user.click(within(nav()).getByRole('link', { name: 'Data quality' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
    expect(document.title).toBe('Data quality - Fulfillment Watch')
  })

  it('clicking the current-route link changes neither focus nor title', async () => {
    const { user } = renderAt('/rule')
    const link = within(nav()).getByRole('link', { name: 'Rule' })
    await user.click(link)
    expect(document.activeElement).toBe(link)
    expect(document.title).toBe('Rule - Fulfillment Watch')
  })
})

describe('marking reviewed', () => {
  it('works by click', async () => {
    const { user } = renderAt('/orders/1042')
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })

  it.each([['Enter', '{Enter}'], ['Space', ' ']])('works by %s', async (_n, keys) => {
    const { user } = renderAt('/orders/1042')
    screen.getByRole('button', { name: 'Mark reviewed' }).focus()
    await user.keyboard(keys)
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('keeps the order open with an alert when the store throws', async () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const { user } = renderAt('/orders/1042', storage)
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not save the review. The order stays open.',
    )
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeTruthy()
  })

  it('reload keeps 1042 in Reviewed, with its time after remount', async () => {
    const storage = new FakeStorage()
    const first = renderAt('/orders/1042', storage)
    await first.user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    first.unmount()

    const second = renderAt('/reviewed', storage)
    const table = screen.getByRole('table')
    expect(within(table).getByRole('link', { name: '#1042' })).toBeTruthy()
    expect(within(table).getByText(/2026-11-20 12:05 UTC/)).toBeTruthy()
    second.unmount()

    renderAt('/orders/1042', storage)
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('takes two clicks from the queue to a reviewed 1042', async () => {
    const storage = new FakeStorage()
    const first = renderAt('/orders/1042', storage)
    await first.user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    first.unmount()

    const { user } = renderAt('/', storage)
    await user.click(within(nav()).getByRole('link', { name: 'Reviewed' }))
    await user.click(screen.getByRole('link', { name: '#1042' }))
    expect(h1Text()).toBe('#1042')
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })
})

describe('Rule page', () => {
  it('shows the rule text, threshold and evaluation time with no controls in main', () => {
    renderAt('/rule')
    const main = screen.getByRole('main')
    const text = main.textContent ?? ''
    expect(text).toContain('A partial refund does not stop an order from being flagged.')
    expect(text).toContain('paid')
    expect(text).toContain('none of its units are fulfilled')
    expect(text).toContain('not canceled')
    expect(text).toContain('not fully refunded')
    expect(text).toContain('24 hours')
    expect(text).toContain('2026-11-20 12:00 UTC')
    expect(main.querySelectorAll('button, input, select, textarea, a')).toHaveLength(0)
  })
})

describe('no writes and no network', () => {
  it('view-only rendering never calls setItem', async () => {
    const setItem = vi.fn()
    const storage: StorageLike = { getItem: () => null, setItem }
    for (const path of ALL_PATHS) {
      const { user, unmount } = renderAt(path, storage)
      await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
      unmount()
    }
    expect(setItem).not.toHaveBeenCalled()
  })

  it('every page still renders with fetch and XMLHttpRequest failing', () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        constructor() {
          throw new Error('offline')
        }
      },
    )
    for (const path of ALL_PATHS) {
      const { unmount } = renderAt(path)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBeTruthy()
      unmount()
    }
  })

  it('uses only the review storage key when marking reviewed', async () => {
    const storage = new FakeStorage()
    const { user } = renderAt('/orders/1042', storage)
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect([...storage.data.keys()]).toEqual([REVIEW_STORAGE_KEY])
  })
})
