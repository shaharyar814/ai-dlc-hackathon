// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { ApiError } from './api/client.ts'
import type { ApiClient } from './api/client.ts'
import type { QueueResponse } from './api/wire.ts'
import SignInMessage from './components/SignInMessage.tsx'
import { RULE_ID } from './config.ts'
import { DATASET } from './data/orders.ts'
import { evaluate } from './rules/paidUnfulfilled.ts'
import { createApiRepository } from './storage/apiRepository.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const T = '2026-11-20T12:05:00.000Z'
const evaluated = evaluate(DATASET, '2026-11-20T12:00:00Z', 24)

function response(reviewedIds: readonly string[] = []): QueueResponse {
  return {
    ruleId: RULE_ID,
    evaluationTime: '2026-11-20T12:00:00Z',
    thresholdHours: 24,
    checkedCount: evaluated.checkedCount,
    rows: evaluated.flagged.map((f) => ({
      order: f.order,
      elapsedMs: f.elapsedMs,
      review: reviewedIds.includes(f.order.orderId) ? { reviewedAt: T, reviewer: 'lead1' } : null,
    })),
    skipped: evaluated.skipped,
  }
}

function client(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getQueue: vi.fn(() => Promise.resolve(response())),
    postReview: vi.fn((orderId: string) =>
      Promise.resolve({ review: { orderId, ruleId: RULE_ID, reviewedAt: T, reviewer: 'lead1' }, created: true }),
    ),
    ...overrides,
  }
}

function renderApi(c: ApiClient, initialEntry = '/', signOut?: { href: string; onSignOut: () => void }) {
  const user = userEvent.setup()
  const utils = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App repository={createApiRepository(c)} signOut={signOut} />
    </MemoryRouter>,
  )
  return { user, ...utils }
}

describe('App in API mode', () => {
  it('shows the loading state and then the queue with the response values', async () => {
    renderApi(client())
    expect(screen.getByText('Loading the queue…')).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 1, name: 'Queue' })).toBeTruthy()
    expect(screen.getByText(`${evaluated.checkedCount} checked, ${evaluated.skipped.length} skipped`)).toBeTruthy()
    expect(screen.getByText('Evaluated at 2026-11-20 12:00 UTC')).toBeTruthy()
  })

  it('shows the evaluation time and checked count exactly as returned', async () => {
    const odd: QueueResponse = { ...response(), evaluationTime: '2026-12-01T08:30:00Z', checkedCount: 99, skipped: [] }
    renderApi(client({ getQueue: vi.fn(() => Promise.resolve(odd)) }))
    expect(await screen.findByText('Evaluated at 2026-12-01 08:30 UTC')).toBeTruthy()
    expect(screen.getByText('99 checked, 0 skipped')).toBeTruthy()
  })

  it('shows an error with Retry, disables Retry while loading, and recovers', async () => {
    let resolveSecond: (q: QueueResponse) => void = () => {}
    const getQueue = vi
      .fn<ApiClient['getQueue']>()
      .mockRejectedValueOnce(new ApiError('http', 500))
      .mockImplementationOnce(() => new Promise<QueueResponse>((resolve) => { resolveSecond = resolve }))
    const { user } = renderApi(client({ getQueue }))
    expect(await screen.findByText('Could not load the queue.')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Retry' })
    await user.click(retry)
    await waitFor(() => expect((screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText('Loading the queue…')).toBeTruthy()
    resolveSecond(response())
    expect(await screen.findByRole('heading', { level: 1, name: 'Queue' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(getQueue).toHaveBeenCalledTimes(2)
  })

  it('shows the not-in-group message for a 403, with no Retry and no queue data', async () => {
    renderApi(client({ getQueue: vi.fn(() => Promise.reject(new ApiError('forbidden', 403))) }))
    expect(await screen.findByText(/not in the fulfillment-lead group/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('#1042')).toBeNull()
  })

  it('shows the reviewer in the existing review status text', async () => {
    renderApi(client({ getQueue: vi.fn(() => Promise.resolve(response(['1042']))) }), '/orders/1042')
    expect(await screen.findByText('Reviewed by lead1 2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('shows the reviewer in the queue row of the Reviewed view', async () => {
    renderApi(client({ getQueue: vi.fn(() => Promise.resolve(response(['1042']))) }), '/reviewed')
    const row = (await screen.findByRole('link', { name: '#1042' })).closest('tr') as HTMLElement
    expect(within(row).getByText('by lead1 2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('marks an order reviewed through the API from the order page', async () => {
    const c = client()
    const { user } = renderApi(c, '/orders/1042')
    await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))
    expect(await screen.findByText('Reviewed by lead1 2026-11-20 12:05 UTC')).toBeTruthy()
    expect(c.postReview).toHaveBeenCalledWith('1042', RULE_ID)
  })

  it('keeps the order open after a failed review, shows an inline Retry, and repeats the same order and rule', async () => {
    const postReview = vi
      .fn<ApiClient['postReview']>()
      .mockRejectedValueOnce(new ApiError('timeout'))
      .mockResolvedValue({ review: { orderId: '1042', ruleId: RULE_ID, reviewedAt: T, reviewer: 'lead1' }, created: true })
    const { user } = renderApi(client({ postReview }), '/orders/1042')
    await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: '#1042' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Reviewed by lead1 2026-11-20 12:05 UTC')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(postReview).toHaveBeenNthCalledWith(1, '1042', RULE_ID)
    expect(postReview).toHaveBeenNthCalledWith(2, '1042', RULE_ID)
  })

  it('shows an inline Retry next to the failed row in the queue and keeps the page', async () => {
    const postReview = vi.fn<ApiClient['postReview']>().mockRejectedValue(new ApiError('network'))
    const { user } = renderApi(client({ postReview }))
    const row = (await screen.findByRole('link', { name: '#1042' })).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Mark reviewed' }))
    await waitFor(() => expect(within(row).getByRole('button', { name: 'Retry' })).toBeTruthy())
    expect(screen.getByRole('heading', { level: 1, name: 'Queue' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
  })

  it('uses the same layout and labels as Local mode, plus the Sign out link', async () => {
    renderApi(client(), '/', { href: 'https://example.test/logout', onSignOut: () => {} })
    await screen.findByRole('heading', { level: 1, name: 'Queue' })
    const header = document.querySelector('header') as HTMLElement
    expect(within(header).getByRole('navigation', { name: 'Main' })).toBeTruthy()
    expect(within(header).getByRole('button', { name: 'Re-run evaluation' })).toBeTruthy()
    expect(within(header).getByRole('link', { name: 'Sign out' }).getAttribute('href')).toBe('https://example.test/logout')
    expect(screen.getByRole('link', { name: 'Open (6)' })).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Order',
      'Hours since payment',
      'Reason',
      'Review status',
      'Action',
    ])
  })
})

describe('SignInMessage', () => {
  it('shows a sign-in failed message with a restart control and no queue data', async () => {
    const onRestart = vi.fn()
    render(<SignInMessage kind="failed" onRestart={onRestart} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sign-in failed' })).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(onRestart).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows the not-in-group message with no Retry', () => {
    render(<SignInMessage kind="not-in-group" />)
    expect(screen.getByText(/not in the fulfillment-lead group/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('App in API mode: permission failures', () => {
  it('shows the not-in-group screen with no Retry when a save returns 403', async () => {
    const postReview = vi.fn<ApiClient['postReview']>().mockRejectedValue(new ApiError('forbidden', 403))
    const { user } = renderApi(client({ postReview }), '/orders/1042', { href: 'https://example.test/logout', onSignOut: () => {} })
    await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'No access' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText('#1042')).toBeNull()
  })

  it('offers Sign out on the not-in-group screen', async () => {
    const onSignOut = vi.fn()
    const { user } = renderApi(
      client({ getQueue: vi.fn(() => Promise.reject(new ApiError('forbidden', 403))) }),
      '/',
      { href: '#', onSignOut },
    )
    await screen.findByRole('heading', { level: 1, name: 'No access' })
    await user.click(screen.getByRole('link', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
