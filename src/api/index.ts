import { browserAuth } from './browserAuth.ts'
import { createApiClient, type ApiClient } from './client.ts'
import { readApiConfig } from './config.ts'

export { ApiError, type ApiErrorKind, type ApiClient, type ReviewResult } from './client.ts'
export { isApiMode, readApiConfig } from './config.ts'
export { browserAuth } from './browserAuth.ts'
export type { QueueResponse } from './wire.ts'

let cached: ApiClient | null = null

/** The API client bound to the real browser. Only used in API mode. */
export function browserApiClient(): ApiClient {
  if (cached) return cached
  const config = readApiConfig()
  if (config === null) throw new Error('API mode is not enabled')
  const auth = browserAuth()
  cached = createApiClient({
    baseUrl: config.apiUrl,
    fetch: (input, init) => window.fetch(input, init),
    getToken: () => auth.getValidToken(Date.now()),
  })
  return cached
}
