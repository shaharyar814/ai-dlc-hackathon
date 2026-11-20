import { webcrypto } from 'node:crypto'
import type { AuthDeps, SessionStorageLike } from './auth.ts'
import type { CryptoLike } from './pkce.ts'

export function memorySession(): SessionStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}

export interface FakeBrowser {
  deps: AuthDeps
  storage: ReturnType<typeof memorySession>
  state: { origin: string; pathname: string; search: string; hash: string; redirectedTo: string | null }
  fetchCalls: { url: string; init: RequestInit | undefined }[]
}

export function createFakeBrowser(options: {
  hash?: string
  search?: string
  now?: () => number
  fetch?: typeof fetch
} = {}): FakeBrowser {
  const storage = memorySession()
  const state = {
    origin: 'https://d111111abcdef8.cloudfront.net',
    pathname: '/',
    search: options.search ?? '',
    hash: options.hash ?? '#/',
    redirectedTo: null as string | null,
  }
  const fetchCalls: FakeBrowser['fetchCalls'] = []
  const defaultFetch: typeof fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }), { status: 200 }))
  const fetchFn = options.fetch ?? defaultFetch
  const deps: AuthDeps = {
    cognitoDomain: 'https://example.auth.us-east-1.amazoncognito.com/',
    clientId: 'client123',
    storage,
    location: () => ({ origin: state.origin, pathname: state.pathname, search: state.search, hash: state.hash }),
    replaceUrl: (url) => {
      const hashAt = url.indexOf('#')
      const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt)
      state.hash = hashAt === -1 ? '' : url.slice(hashAt)
      const queryAt = beforeHash.indexOf('?')
      state.search = queryAt === -1 ? '' : beforeHash.slice(queryAt)
      state.pathname = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)
    },
    redirect: (url) => {
      state.redirectedTo = url
    },
    fetch: (input, init) => {
      fetchCalls.push({ url: String(input), init })
      return fetchFn(input, init)
    },
    crypto: webcrypto as unknown as CryptoLike,
    now: options.now ?? (() => 1_000_000),
  }
  return { deps, storage, state, fetchCalls }
}
