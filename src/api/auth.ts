import { createChallenge, createState, createVerifier, type CryptoLike } from './pkce.ts'

export const TOKEN_KEY = 'fw.token'
export const PKCE_KEY = 'fw.pkce'
export const ROUTE_KEY = 'fw.route'
export const REQUIRED_SCOPE = 'fulfillment-watch/api'
/**
 * Scopes requested at sign-in. Cognito only puts the `cognito:groups` claim in the
 * access token when `openid` is also requested (observed on the deployed pool,
 * 2026-11-20), and the Lambda needs that claim for the group check.
 */
export const SCOPE = `openid ${REQUIRED_SCOPE}`
export const EXPIRY_SKEW_MS = 30_000

export interface SessionStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface AuthDeps {
  readonly cognitoDomain: string
  readonly clientId: string
  readonly storage: SessionStorageLike | null
  /** The current page. `search` and `hash` include their leading `?` and `#`. */
  readonly location: () => { origin: string; pathname: string; search: string; hash: string }
  /** Replaces the URL without navigating (history.replaceState). */
  readonly replaceUrl: (url: string) => void
  /** Navigates the browser (location.assign). */
  readonly redirect: (url: string) => void
  readonly fetch: typeof fetch
  readonly crypto: CryptoLike
  readonly now: () => number
}

export type SignInOutcome = 'signed-in' | 'failed' | 'none'

export interface Auth {
  getValidToken(now: number): string | null
  startSignIn(): Promise<void>
  completeSignIn(): Promise<SignInOutcome>
  signOutUrl(): string
  clearTokens(): void
}

interface StoredToken {
  accessToken: string
  expiresAt: number
}

function safeGet(storage: SessionStorageLike | null, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null
  } catch {
    return null
  }
}

function safeSet(storage: SessionStorageLike | null, key: string, value: string): boolean {
  try {
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemove(storage: SessionStorageLike | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Storage is unavailable: nothing to remove.
  }
}

function isRoute(value: string | null): value is string {
  return value !== null && value.startsWith('#/')
}

function readToken(storage: SessionStorageLike | null): StoredToken | null {
  const raw = safeGet(storage, TOKEN_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { accessToken, expiresAt } = parsed as Record<string, unknown>
    if (typeof accessToken !== 'string' || accessToken === '') return null
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
    return { accessToken, expiresAt }
  } catch {
    return null
  }
}

export function createAuth(deps: AuthDeps): Auth {
  const domain = deps.cognitoDomain.replace(/\/+$/, '')

  function clearTokens(): void {
    safeRemove(deps.storage, TOKEN_KEY)
  }

  function clearSignInState(): void {
    safeRemove(deps.storage, PKCE_KEY)
    safeRemove(deps.storage, ROUTE_KEY)
  }

  function getValidToken(now: number): string | null {
    const token = readToken(deps.storage)
    if (token === null) return null
    if (now >= token.expiresAt) {
      clearTokens()
      return null
    }
    return token.accessToken
  }

  async function startSignIn(): Promise<void> {
    const here = deps.location()
    clearTokens()
    safeSet(deps.storage, ROUTE_KEY, isRoute(here.hash) ? here.hash : '#/')
    const verifier = createVerifier(deps.crypto)
    const state = createState(deps.crypto)
    safeSet(deps.storage, PKCE_KEY, JSON.stringify({ verifier, state }))
    const challenge = await createChallenge(deps.crypto, verifier)
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: deps.clientId,
      redirect_uri: here.origin,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    deps.redirect(`${domain}/oauth2/authorize?${query.toString()}`)
  }

  function finishUrl(route: string): void {
    const here = deps.location()
    deps.replaceUrl(`${here.pathname}${route}`)
  }

  async function exchange(code: string, verifier: string, origin: string): Promise<StoredToken | null> {
    try {
      const response = await deps.fetch(`${domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: deps.clientId,
          code,
          redirect_uri: origin,
          code_verifier: verifier,
        }).toString(),
      })
      if (!response.ok) return null
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null) return null
      const { access_token, expires_in } = body as Record<string, unknown>
      if (typeof access_token !== 'string' || access_token === '') return null
      if (typeof expires_in !== 'number' || !Number.isFinite(expires_in) || expires_in <= 0) return null
      return { accessToken: access_token, expiresAt: deps.now() + expires_in * 1000 - EXPIRY_SKEW_MS }
    } catch {
      return null
    }
  }

  async function completeSignIn(): Promise<SignInOutcome> {
    const here = deps.location()
    const params = new URLSearchParams(here.search)
    const code = params.get('code')
    const error = params.get('error')
    if (code === null && error === null) return 'none'

    const route = safeGet(deps.storage, ROUTE_KEY)
    const restored = isRoute(route) ? route : '#/'
    let pkce: { verifier: string; state: string } | null = null
    try {
      const raw = safeGet(deps.storage, PKCE_KEY)
      const parsed: unknown = raw === null ? null : JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        const { verifier, state } = parsed as Record<string, unknown>
        if (typeof verifier === 'string' && typeof state === 'string') pkce = { verifier, state }
      }
    } catch {
      pkce = null
    }
    clearSignInState()
    clearTokens()
    finishUrl(restored)

    if (error !== null || code === null || pkce === null || params.get('state') !== pkce.state) {
      return 'failed'
    }
    const token = await exchange(code, pkce.verifier, here.origin)
    if (token === null) return 'failed'
    if (!safeSet(deps.storage, TOKEN_KEY, JSON.stringify(token))) return 'failed'
    return 'signed-in'
  }

  function signOutUrl(): string {
    const query = new URLSearchParams({ client_id: deps.clientId, logout_uri: deps.location().origin })
    return `${domain}/logout?${query.toString()}`
  }

  return { getValidToken, startSignIn, completeSignIn, signOutUrl, clearTokens }
}
