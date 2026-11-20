import { createAuth, type Auth, type SessionStorageLike } from './auth.ts'
import { readApiConfig } from './config.ts'

function browserSessionStorage(): SessionStorageLike | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

let cached: Auth | null = null

/** The Auth bound to the real browser. Only used in API mode. */
export function browserAuth(): Auth {
  if (cached) return cached
  const config = readApiConfig()
  if (config === null) throw new Error('API mode is not enabled')
  cached = createAuth({
    cognitoDomain: config.cognitoDomain,
    clientId: config.clientId,
    storage: browserSessionStorage(),
    location: () => ({
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    }),
    replaceUrl: (url) => {
      window.history.replaceState(null, '', url)
    },
    redirect: (url) => {
      window.location.assign(url)
    },
    fetch: (input, init) => window.fetch(input, init),
    crypto: window.crypto,
    now: () => Date.now(),
  })
  return cached
}
