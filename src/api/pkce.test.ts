import { createHash, webcrypto } from 'node:crypto'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createChallenge, createState, createVerifier, type CryptoLike } from './pkce.ts'

const crypto = webcrypto as unknown as CryptoLike
const UNRESERVED = /^[A-Za-z0-9\-._~]+$/

// Feature: stalled-orders-aws, Property 17: PKCE challenge matches the verifier
describe('Property 17: PKCE challenge matches the verifier', () => {
  it('builds a 64-character verifier whose challenge is base64url(SHA-256(verifier)) without padding', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const verifier = createVerifier(crypto)
        expect(verifier).toHaveLength(64)
        expect(verifier).toMatch(UNRESERVED)
        const challenge = await createChallenge(crypto, verifier)
        expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
        expect(challenge).not.toContain('=')
        expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
      }),
      { numRuns: 100 },
    )
  })

  it('matches the RFC 7636 test vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(await createChallenge(crypto, verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('gives different verifiers and a url-safe state', () => {
    expect(createVerifier(crypto)).not.toBe(createVerifier(crypto))
    expect(createState(crypto)).toMatch(UNRESERVED)
  })
})
