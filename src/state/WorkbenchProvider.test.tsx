// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client.ts'
import type { ApiClient } from '../api/client.ts'
import type { QueueResponse } from '../api/wire.ts'
import { RULE_ID } from '../config.ts'
import { createApiRepository } from '../storage/apiRepository.ts'
import { createLocalRepository } from '../storage/localRepository.ts'
import type { StorageLike } from '../storage/reviews.ts'
import WorkbenchProvider from './WorkbenchProvider.tsx'
import { useWorkbench } from './workbenchContext.ts'

const T = '2026-11-20T12:05:00.000Z'
const order = {
  orderId: '1042',
  paymentStatus: 'paid',
  paidAtMs: Date.UTC(2026, 10, 19, 9),
  paidAt: '2026-11-19T09:00:00Z',
  canceled: false,
  refundStatus: 'none' as const,
  orderedQuantity: 2,
  fulfilledQuantity: 0,
}
const queue: QueueResponse = {
  ruleId: RULE_ID,
  evaluationTime: '2026-11-20T12:00:00Z',
  thresholdHours: 24,
  checkedCount: 7,
  rows: [{ order, elapsedMs: 27 * 3_600_000, review: null }],
  skipped: [],
}

function Probe() {
  const w = useWorkbench()
  return (
    <div>
      <p data-testid="mode">{w.mode}</p>
      <p data-testid="status">{w.status}</p>
      <p data-testid="loading">{String(w.loading)}</p>
      <p data-testid="error-kind">{String(w.errorKind)}</p>
      <p data-testid="checked">{w.result.checkedCount}</p>
      <p data-testid="open">{w.open.map((r) => r.flagged.order.orderId).join(',')}</p>
      <p data-testid="reviewed">{w.reviewed.map((r) => `${r.flagged.order.orderId}:${r.review?.reviewer ?? ''}`).join(',')}</p>
      <p data-testid="save-error">{String(w.saveErrorFor)}</p>
      <p data-testid="eval-time">{w.evaluationTime}</p>
      <button type="button" onClick={() => w.markReviewed('1042')}>mark</button>
      <button type="button" onClick={() => w.reload?.()}>reload</button>
      <button type="button" onClick={() => w.rerun()}>rerun</button>
    </div>
  )
}

function text(id: string): string {
  return screen.getByTestId(id).textContent ?? ''
}

function clientWith(overrides: Partial<ApiClient>): ApiClient {
  return {
    getQueue: vi.fn(() => Promise.resolve(queue)),
    postReview: vi.fn(() => Promise.resolve({ review: { orderId: '1042', ruleId: RULE_ID, reviewedAt: T, reviewer: 'lead1' }, created: true })),
    ...overrides,
  }
}

function renderApi(client: ApiClient, onUnauthorized?: () => void) {
  return render(
    <WorkbenchProvider repository={createApiRepository(client)} onUnauthorized={onUnauthorized}>
      <Probe />
    </WorkbenchProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('WorkbenchProvider in API mode', () => {
  it('starts loading and then shows the response, including evaluation time and checked count', async () => {
    renderApi(clientWith({}))
    expect(text('status')).toBe('loading')
    expect(text('loading')).toBe('true')
    await waitFor(() => expect(text('status')).toBe('ready'))
    expect(text('mode')).toBe('api')
    expect(text('checked')).toBe('7')
    expect(text('open')).toBe('1042')
    expect(text('eval-time')).toBe('2026-11-20T12:00:00Z')
    expect(text('loading')).toBe('false')
  })

  it('shows a retryable error for a failed load and recovers on retry, one request per retry', async () => {
    const getQueue = vi
      .fn<ApiClient['getQueue']>()
      .mockRejectedValueOnce(new ApiError('http', 500))
      .mockResolvedValue(queue)
    const user = userEvent.setup()
    renderApi(clientWith({ getQueue }))
    await waitFor(() => expect(text('status')).toBe('error'))
    expect(text('error-kind')).toBe('http')
    await user.click(screen.getByText('reload'))
    await waitFor(() => expect(text('status')).toBe('ready'))
    expect(getQueue).toHaveBeenCalledTimes(2)
  })

  it('ignores a retry while a request is in progress', async () => {
    let resolveSecond: (q: QueueResponse) => void = () => {}
    const getQueue = vi
      .fn<ApiClient['getQueue']>()
      .mockRejectedValueOnce(new ApiError('timeout'))
      .mockImplementationOnce(() => new Promise<QueueResponse>((resolve) => { resolveSecond = resolve }))
    const user = userEvent.setup()
    renderApi(clientWith({ getQueue }))
    await waitFor(() => expect(text('error-kind')).toBe('timeout'))
    await user.click(screen.getByText('reload'))
    expect(text('loading')).toBe('true')
    await user.click(screen.getByText('reload'))
    expect(getQueue).toHaveBeenCalledTimes(2)
    await act(async () => {
      resolveSecond(queue)
    })
    await waitFor(() => expect(text('status')).toBe('ready'))
  })

  it('reports forbidden for a 403 with no error kind to retry', async () => {
    renderApi(clientWith({ getQueue: vi.fn(() => Promise.reject(new ApiError('forbidden', 403))) }))
    await waitFor(() => expect(text('status')).toBe('forbidden'))
    expect(text('error-kind')).toBe('null')
  })

  it('starts sign-in for a 401 and shows no error', async () => {
    const onUnauthorized = vi.fn()
    renderApi(clientWith({ getQueue: vi.fn(() => Promise.reject(new ApiError('unauthorized', 401))) }), onUnauthorized)
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
    expect(text('status')).toBe('loading')
  })

  it('moves the order to Reviewed with the reviewer after a successful save, and writes no local review', async () => {
    const user = userEvent.setup()
    renderApi(clientWith({}))
    await waitFor(() => expect(text('status')).toBe('ready'))
    await user.click(screen.getByText('mark'))
    await waitFor(() => expect(text('reviewed')).toBe('1042:lead1'))
    expect(text('open')).toBe('')
    expect(window.localStorage.length).toBe(0)
  })

  it('keeps the order Open after a failed save and allows a retry for the same order', async () => {
    const postReview = vi
      .fn<ApiClient['postReview']>()
      .mockRejectedValueOnce(new ApiError('network'))
      .mockResolvedValue({ review: { orderId: '1042', ruleId: RULE_ID, reviewedAt: T, reviewer: 'lead1' }, created: true })
    const user = userEvent.setup()
    renderApi(clientWith({ postReview }))
    await waitFor(() => expect(text('status')).toBe('ready'))
    await user.click(screen.getByText('mark'))
    await waitFor(() => expect(text('save-error')).toBe('1042'))
    expect(text('open')).toBe('1042')
    expect(text('status')).toBe('ready')
    await user.click(screen.getByText('mark'))
    await waitFor(() => expect(text('reviewed')).toBe('1042:lead1'))
    expect(text('save-error')).toBe('null')
    expect(postReview).toHaveBeenNthCalledWith(1, '1042', RULE_ID)
    expect(postReview).toHaveBeenNthCalledWith(2, '1042', RULE_ID)
  })

  it('starts sign-in when a save returns 401', async () => {
    const onUnauthorized = vi.fn()
    const user = userEvent.setup()
    renderApi(clientWith({ postReview: vi.fn(() => Promise.reject(new ApiError('unauthorized', 401))) }), onUnauthorized)
    await waitFor(() => expect(text('status')).toBe('ready'))
    await user.click(screen.getByText('mark'))
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
    expect(text('save-error')).toBe('null')
  })

  it('Re-run evaluation loads the queue again', async () => {
    const getQueue = vi.fn<ApiClient['getQueue']>(() => Promise.resolve(queue))
    const user = userEvent.setup()
    renderApi(clientWith({ getQueue }))
    await waitFor(() => expect(text('status')).toBe('ready'))
    await user.click(screen.getByText('rerun'))
    await waitFor(() => expect(getQueue).toHaveBeenCalledTimes(2))
  })
})

describe('WorkbenchProvider in Local mode', () => {
  it('makes no network request, needs no sign-in, and is ready on the first render', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const memory = new Map<string, string>()
    const storage: StorageLike = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) }
    render(
      <WorkbenchProvider storage={storage}>
        <Probe />
      </WorkbenchProvider>,
    )
    expect(text('mode')).toBe('local')
    expect(text('status')).toBe('ready')
    expect(Number(text('checked'))).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('applies a review in the same tick as the click', async () => {
    const memory = new Map<string, string>()
    const storage: StorageLike = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) }
    render(
      <WorkbenchProvider storage={storage} repository={createLocalRepository(storage)} now={() => new Date(T)}>
        <Probe />
      </WorkbenchProvider>,
    )
    await userEvent.setup().click(screen.getByText('mark'))
    expect(text('reviewed')).toBe('1042:')
    expect(memory.size).toBe(1)
  })
})

describe('WorkbenchProvider in API mode: save 403', () => {
  it('reports forbidden and no save error when a save returns 403', async () => {
    const user = userEvent.setup()
    renderApi(clientWith({ postReview: vi.fn(() => Promise.reject(new ApiError('forbidden', 403))) }))
    await waitFor(() => expect(text('status')).toBe('ready'))
    await user.click(screen.getByText('mark'))
    await waitFor(() => expect(text('status')).toBe('forbidden'))
    expect(text('save-error')).toBe('null')
  })
})
