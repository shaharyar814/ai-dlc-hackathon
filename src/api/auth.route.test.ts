import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createAuth, PKCE_KEY, ROUTE_KEY, TOKEN_KEY } from './auth.ts'
import { createFakeBrowser } from './authTestSupport.ts'

const routeArb = fc.oneof(
  fc.constantFrom('#/', '#/orders/1042', '#/rule', '#/data-quality', '#/queue?tab=reviewed'),
  fc.stringMatching(/^[A-Za-z0-9/_-]{0,30}$/).map((s) => `#/${s}`),
)

// Feature: stalled-orders-aws, Property 18: Sign-in preserves the route
describe('Property 18: Sign-in preserves the route', () => {
  it('saves the route, requests PKCE with the scope, then restores the route and drops the query', async () => {
    await fc.assert(
      fc.asyncProperty(routeArb, fc.stringMatching(/^[A-Za-z0-9]{4,20}$/), async (route, code) => {
        const browser = createFakeBrowser({ hash: route })
        const auth = createAuth(browser.deps)

        await auth.startSignIn()
        const redirect = new URL(browser.state.redirectedTo ?? '')
        expect(`${redirect.origin}${redirect.pathname}`).toBe('https://example.auth.us-east-1.amazoncognito.com/oauth2/authorize')
        expect(redirect.searchParams.get('response_type')).toBe('code')
        expect(redirect.searchParams.get('scope')).toBe('fulfillment-watch/api')
        expect(redirect.searchParams.get('code_challenge_method')).toBe('S256')
        expect(redirect.searchParams.get('redirect_uri')).toBe(browser.state.origin)
        expect(redirect.searchParams.get('client_id')).toBe('client123')
        expect(browser.storage.getItem(ROUTE_KEY)).toBe(route)

        const state = redirect.searchParams.get('state')
        browser.state.search = `?code=${code}&state=${state}`
        browser.state.hash = ''
        expect(await auth.completeSignIn()).toBe('signed-in')
        expect(browser.state.hash).toBe(route)
        expect(browser.state.search).toBe('')
        expect(browser.storage.getItem(PKCE_KEY)).toBeNull()
        expect(browser.storage.getItem(ROUTE_KEY)).toBeNull()
        expect(browser.storage.getItem(TOKEN_KEY)).not.toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})

describe('sign-in completion', () => {
  async function started(hash = '#/orders/1042') {
    const browser = createFakeBrowser({ hash })
    const auth = createAuth(browser.deps)
    await auth.startSignIn()
    const state = new URL(browser.state.redirectedTo ?? '').searchParams.get('state') ?? ''
    return { browser, auth, state }
  }

  it('returns none when there is no code or error in the URL', async () => {
    const browser = createFakeBrowser()
    expect(await createAuth(browser.deps).completeSignIn()).toBe('none')
    expect(browser.fetchCalls).toHaveLength(0)
  })

  it('posts a form-encoded code exchange with the verifier and no client secret', async () => {
    const { browser, auth, state } = await started()
    browser.state.search = `?code=abc&state=${state}`
    await auth.completeSignIn()
    expect(browser.fetchCalls).toHaveLength(1)
    const call = browser.fetchCalls[0]
    expect(call.url).toBe('https://example.auth.us-east-1.amazoncognito.com/oauth2/token')
    const form = new URLSearchParams(String(call.init?.body))
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('abc')
    expect(form.get('code_verifier')).toHaveLength(64)
    expect(form.get('redirect_uri')).toBe(browser.state.origin)
    expect(form.has('client_secret')).toBe(false)
  })

  it('fails on a state mismatch without calling the token endpoint and leaves no token', async () => {
    const { browser, auth } = await started()
    browser.state.search = '?code=abc&state=wrong'
    expect(await auth.completeSignIn()).toBe('failed')
    expect(browser.fetchCalls).toHaveLength(0)
    expect(browser.storage.getItem(TOKEN_KEY)).toBeNull()
    expect(browser.state.search).toBe('')
  })

  it('fails on an error redirect', async () => {
    const { browser, auth } = await started()
    browser.state.search = '?error=access_denied'
    expect(await auth.completeSignIn()).toBe('failed')
    expect(browser.storage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('fails when the token exchange is rejected or the network fails', async () => {
    for (const fetchFn of [
      () => Promise.resolve(new Response('{}', { status: 400 })),
      () => Promise.reject(new TypeError('offline')),
      () => Promise.resolve(new Response('not json', { status: 200 })),
      () => Promise.resolve(new Response(JSON.stringify({ expires_in: 10 }), { status: 200 })),
    ]) {
      const browser = createFakeBrowser({ hash: '#/rule', fetch: fetchFn as typeof fetch })
      const auth = createAuth(browser.deps)
      await auth.startSignIn()
      const state = new URL(browser.state.redirectedTo ?? '').searchParams.get('state') ?? ''
      browser.state.search = `?code=abc&state=${state}`
      expect(await auth.completeSignIn()).toBe('failed')
      expect(browser.storage.getItem(TOKEN_KEY)).toBeNull()
    }
  })

  it('uses #/ when no route was saved', async () => {
    const browser = createFakeBrowser({ search: '?code=abc&state=s' })
    const auth = createAuth(browser.deps)
    browser.storage.setItem(PKCE_KEY, JSON.stringify({ verifier: 'v', state: 's' }))
    expect(await auth.completeSignIn()).toBe('signed-in')
    expect(browser.state.hash).toBe('#/')
  })

  it('stores only the access token and its expiry, never a refresh token', async () => {
    const fetchFn = () =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', id_token: 'i', expires_in: 3600 }), { status: 200 }),
      )
    const browser = createFakeBrowser({ hash: '#/', fetch: fetchFn as typeof fetch })
    const auth = createAuth(browser.deps)
    await auth.startSignIn()
    const state = new URL(browser.state.redirectedTo ?? '').searchParams.get('state') ?? ''
    browser.state.search = `?code=abc&state=${state}`
    await auth.completeSignIn()
    const stored = [...browser.storage.data.values()].join(' ')
    expect(stored).not.toContain('"r"')
    expect(stored).not.toContain('refresh')
    expect(browser.storage.data.get(TOKEN_KEY)).toBe(JSON.stringify({ accessToken: 'a', expiresAt: 1_000_000 + 3_600_000 - 30_000 }))
  })

  it('builds the logout URL and clears tokens', async () => {
    const browser = createFakeBrowser()
    const auth = createAuth(browser.deps)
    const url = new URL(auth.signOutUrl())
    expect(url.pathname).toBe('/logout')
    expect(url.searchParams.get('client_id')).toBe('client123')
    expect(url.searchParams.get('logout_uri')).toBe(browser.state.origin)
    browser.storage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'a', expiresAt: 9e12 }))
    auth.clearTokens()
    expect(auth.getValidToken(0)).toBeNull()
  })

  it('does not throw when storage is unavailable', async () => {
    const browser = createFakeBrowser()
    const auth = createAuth({ ...browser.deps, storage: null })
    expect(auth.getValidToken(0)).toBeNull()
    await expect(auth.startSignIn()).resolves.toBeUndefined()
    browser.state.search = '?code=a&state=b'
    expect(await auth.completeSignIn()).toBe('failed')
  })
})
