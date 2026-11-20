import type { ReviewRecord } from '../types.ts'
import { decodeQueueResponse, WireFormatError, type QueueResponse } from './wire.ts'

export const REQUEST_TIMEOUT_MS = 10_000

export type ApiErrorKind = 'unauthorized' | 'forbidden' | 'timeout' | 'network' | 'http'

const MESSAGES: Record<ApiErrorKind, string> = {
  unauthorized: 'Sign-in is required.',
  forbidden: 'You do not have permission.',
  timeout: 'The request timed out.',
  network: 'The network request failed.',
  http: 'The server returned an error.',
}

/** A failed API call. The message never includes a response body. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  constructor(kind: ApiErrorKind, status?: number) {
    super(MESSAGES[kind])
    this.name = 'ApiError'
    this.kind = kind
    if (status !== undefined) this.status = status
  }
}

export interface ApiClientDeps {
  readonly baseUrl: string
  readonly fetch: typeof fetch
  /** The current access token, or null when there is none. */
  readonly getToken: () => string | null
  readonly timeoutMs?: number
}

export interface ReviewResult {
  readonly review: ReviewRecord
  readonly created: boolean
}

export interface ApiClient {
  getQueue(): Promise<QueueResponse>
  postReview(orderId: string, ruleId: string): Promise<ReviewResult>
}

function decodeReview(value: unknown): ReviewRecord {
  if (typeof value !== 'object' || value === null) throw new WireFormatError('review')
  const { orderId, ruleId, reviewedAt, reviewer } = value as Record<string, unknown>
  if (
    typeof orderId !== 'string' ||
    typeof ruleId !== 'string' ||
    typeof reviewedAt !== 'string' ||
    typeof reviewer !== 'string'
  ) {
    throw new WireFormatError('review')
  }
  return { orderId, ruleId, reviewedAt, reviewer }
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const baseUrl = deps.baseUrl.replace(/\/+$/, '')
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS

  async function request(
    path: string,
    init: { method: string; body?: string },
  ): Promise<{ status: number; json: unknown }> {
    const token = deps.getToken()
    if (token === null) throw new ApiError('unauthorized')
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      if (init.body !== undefined) headers['Content-Type'] = 'application/json'
      const response = await deps.fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal: controller.signal,
      })
      if (response.status === 401) throw new ApiError('unauthorized', 401)
      if (response.status === 403) throw new ApiError('forbidden', 403)
      if (!response.ok) throw new ApiError('http', response.status)
      let json: unknown
      try {
        json = await response.json()
      } catch (error) {
        if (timedOut) throw new ApiError('timeout')
        if (error instanceof TypeError) throw new ApiError('network')
        throw new ApiError('http', response.status)
      }
      return { status: response.status, json }
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (timedOut) throw new ApiError('timeout')
      throw new ApiError('network')
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async getQueue() {
      const { json } = await request('/queue', { method: 'GET' })
      try {
        return decodeQueueResponse(json)
      } catch (error) {
        if (error instanceof WireFormatError) throw new ApiError('http')
        throw error
      }
    },
    async postReview(orderId, ruleId) {
      const { status, json } = await request('/reviews', {
        method: 'POST',
        body: JSON.stringify({ orderId, ruleId }),
      })
      try {
        return { review: decodeReview(json), created: status === 201 }
      } catch (error) {
        if (error instanceof WireFormatError) throw new ApiError('http', status)
        throw error
      }
    },
  }
}
