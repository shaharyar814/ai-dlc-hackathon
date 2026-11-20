import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createAuth, EXPIRY_SKEW_MS, TOKEN_KEY } from './auth.ts'
import { createFakeBrowser } from './authTestSupport.ts'

// Feature: stalled-orders-aws, Property 19: Expired tokens are discarded
describe('Property 19: Expired tokens are discarded', () => {
  it('returns the token before its expiry and discards it at or after the expiry', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        fc.integer({ min: 31, max: 86_400 }),
        fc.integer({ min: -100_000, max: 100_000_000 }),
        (issuedAt, expiresIn, elapsedMs) => {
          const expiresAt = issuedAt + expiresIn * 1000 - EXPIRY_SKEW_MS
          const browser = createFakeBrowser()
          browser.storage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'tok', expiresAt }))
          const auth = createAuth(browser.deps)
          const now = issuedAt + elapsedMs
          if (now < expiresAt) {
            expect(auth.getValidToken(now)).toBe('tok')
            expect(browser.storage.getItem(TOKEN_KEY)).not.toBeNull()
          } else {
            expect(auth.getValidToken(now)).toBeNull()
            expect(browser.storage.getItem(TOKEN_KEY)).toBeNull()
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('treats a stored value that is not a token as no token', () => {
    for (const bad of ['', 'x', '[]', '{}', '{"accessToken":"","expiresAt":1}', '{"accessToken":"a","expiresAt":"1"}']) {
      const browser = createFakeBrowser()
      browser.storage.setItem(TOKEN_KEY, bad)
      expect(createAuth(browser.deps).getValidToken(0)).toBeNull()
    }
  })
})
