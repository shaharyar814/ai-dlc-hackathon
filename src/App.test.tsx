// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App.tsx'
import { REVIEW_STORAGE_KEY } from './config.ts'
import type { StorageLike } from './storage/reviews.ts'

afterEach(cleanup)

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

function renderApp(storage: StorageLike | null = new FakeStorage()) {
  const user = userEvent.setup()
  const utils = render(<App storage={storage} now={FIXED_NOW} />)
  return { user, storage, ...utils }
}

function orderButtons(): string[] {
  return screen
    .queryAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('button')[0].textContent ?? '')
}

describe('App', () => {
  it('loads and shows the header and flagged rows in queue order', () => {
    renderApp()
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
    expect(orderButtons()).toEqual(FLAGGED_ORDER)
  })

  it('switches between Open and Reviewed views', async () => {
    const { user } = renderApp()
    const openBtn = screen.getByRole('button', { name: 'Open' })
    const reviewedBtn = screen.getByRole('button', { name: 'Reviewed' })
    expect(openBtn.getAttribute('aria-pressed')).toBe('true')
    expect(reviewedBtn.getAttribute('aria-pressed')).toBe('false')
    await user.click(reviewedBtn)
    expect(reviewedBtn.getAttribute('aria-pressed')).toBe('true')
    expect(openBtn.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('status').textContent).toBe('No reviewed orders yet.')
    await user.click(openBtn)
    expect(orderButtons()).toEqual(FLAGGED_ORDER)
  })

  it('shows the detail of the selected row and replaces it on another selection', async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole('button', { name: '#1042' }))
    expect(screen.getByText('27 h 0 min')).toBeTruthy()
    expect(screen.getByText('0 of 2 units fulfilled')).toBeTruthy()
    expect(screen.getByText('Confirm pick status with the warehouse.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '#1051' }))
    expect(screen.queryByText('0 of 2 units fulfilled')).toBeNull()
    expect(screen.getByText('0 of 4 units fulfilled')).toBeTruthy()
  })

  it('marks #1042 reviewed with the injected timestamp and hides its button', async () => {
    const { user } = renderApp()
    const row = screen.getByRole('button', { name: '#1042' }).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Mark reviewed' }))
    expect(orderButtons()).not.toContain('#1042')
    await user.click(screen.getByRole('button', { name: 'Reviewed' }))
    expect(orderButtons()).toEqual(['#1042'])
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })

  it('keeps one row per order and the same views and timestamps on re-run', async () => {
    const { user } = renderApp()
    await user.click(
      within(screen.getByRole('button', { name: '#1042' }).closest('tr') as HTMLElement).getByRole(
        'button',
        { name: 'Mark reviewed' },
      ),
    )
    const openBefore = orderButtons()
    await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
    expect(orderButtons()).toEqual(openBefore)
    expect(new Set(orderButtons()).size).toBe(orderButtons().length)
    await user.click(screen.getByRole('button', { name: 'Reviewed' }))
    expect(orderButtons()).toEqual(['#1042'])
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('opens the skipped list from the summary', async () => {
    const { user } = renderApp()
    expect(screen.queryByRole('region', { name: 'Skipped records' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '5 skipped' }))
    const list = screen.getByRole('region', { name: 'Skipped records' })
    expect(within(list).getByText('#1053')).toBeTruthy()
    expect(within(list).getByText('Missing paymentTimestamp')).toBeTruthy()
    await user.click(within(list).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Skipped records' })).toBeNull()
  })

  it('writes the review to the single storage key', async () => {
    const { user, storage } = renderApp()
    await user.click(screen.getAllByRole('button', { name: 'Mark reviewed' })[0])
    expect([...(storage as FakeStorage).data.keys()]).toEqual([REVIEW_STORAGE_KEY])
  })
})
