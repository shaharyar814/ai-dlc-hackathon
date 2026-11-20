import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient, REQUEST_TIMEOUT_MS } from './client.ts'

const BASE = 'https://api.example.test'
const queueBody = { ruleId: 'paid-unfulfilled', evaluationTime: '2026-11-20T12:00:00Z', thresholdHours: 24, checkedCount: 0, rows: [], skipped: [] }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('API client', () => {
  it('sends the Authorization header and decodes the queue', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(json(queueBody)))
    const client = createApiClient({ baseUrl: `${BASE}/`, fetch: fetchFn, getToken: () => 'tok123' })
    expect(await client.getQueue()).toEqual(queueBody)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(`${BASE}/queue`)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok123')
    expect(init?.method).toBe('GET')
  })

  it('posts the order and rule and reports created for 201 and not for 200', async () => {
    const review = { orderId: '1042', ruleId: 'paid-unfulfilled', reviewedAt: '2026-11-20T12:05:00.000Z', reviewer: 'lead1' }
    for (const [status, created] of [[201, true], [200, false]] as const) {
      const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(json(review, status)))
      const client = createApiClient({ baseUrl: BASE, fetch: fetchFn, getToken: () => 't' })
      expect(await client.postReview('1042', 'paid-unfulfilled')).toEqual({ review, created })
      expect(fetchFn.mock.calls[0][1]?.body).toBe(JSON.stringify({ orderId: '1042', ruleId: 'paid-unfulfilled' }))
    }
  })

  it('fails with unauthorized without a request when there is no token', async () => {
    const fetchFn = vi.fn()
    const client = createApiClient({ baseUrl: BASE, fetch: fetchFn as unknown as typeof fetch, getToken: () => null })
    expect((await failure(client.getQueue())).kind).toBe('unauthorized')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps 401, 403 and other statuses to typed errors', async () => {
    const cases: [number, string][] = [[401, 'unauthorized'], [403, 'forbidden'], [500, 'http'], [404, 'http'], [429, 'http']]
    for (const [status, kind] of cases) {
      const client = createApiClient({
        baseUrl: BASE,
        fetch: (() => Promise.resolve(json({ error: { message: 'secret internal text' } }, status))) as typeof fetch,
        getToken: () => 't',
      })
      const error = await failure(client.getQueue())
      expect(error.kind).toBe(kind)
      expect(error.status).toBe(status)
      expect(error.message).not.toContain('secret internal text')
    }
  })

  it('maps a network failure to network', async () => {
    const client = createApiClient({
      baseUrl: BASE,
      fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch,
      getToken: () => 't',
    })
    expect((await failure(client.getQueue())).kind).toBe('network')
  })

  it('times out after 10 seconds', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    const client = createApiClient({ baseUrl: BASE, fetch: fetchFn, getToken: () => 't' })
    const pending = failure(client.getQueue())
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).kind).toBe('timeout')
  })

  it('turns a malformed success body into an http error without the body in the message', async () => {
    const client = createApiClient({
      baseUrl: BASE,
      fetch: (() => Promise.resolve(json({ rows: 'nope', secret: 'leak-me' }))) as typeof fetch,
      getToken: () => 't',
    })
    const error = await failure(client.getQueue())
    expect(error.kind).toBe('http')
    expect(error.message).not.toContain('leak-me')
  })

  it('turns a non-JSON success body into an http error', async () => {
    const client = createApiClient({
      baseUrl: BASE,
      fetch: (() => Promise.resolve(new Response('<html>', { status: 200 }))) as typeof fetch,
      getToken: () => 't',
    })
    expect((await failure(client.getQueue())).kind).toBe('http')
  })

  it('turns a malformed review response into an http error', async () => {
    const client = createApiClient({
      baseUrl: BASE,
      fetch: (() => Promise.resolve(json({ orderId: 1 }, 201))) as typeof fetch,
      getToken: () => 't',
    })
    expect((await failure(client.postReview('1', 'paid-unfulfilled'))).kind).toBe('http')
  })
})
