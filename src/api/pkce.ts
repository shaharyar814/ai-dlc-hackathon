export type CryptoLike = Pick<Crypto, 'getRandomValues'> & { subtle: Pick<SubtleCrypto, 'digest'> }

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
const VERIFIER_LENGTH = 64

/** Random text from the unreserved set, without modulo bias. */
function randomText(crypto: CryptoLike, length: number): string {
  const limit = 256 - (256 % UNRESERVED.length)
  let out = ''
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const b of bytes) {
      if (b < limit && out.length < length) out += UNRESERVED[b % UNRESERVED.length]
    }
  }
  return out
}

export function createVerifier(crypto: CryptoLike): string {
  return randomText(crypto, VERIFIER_LENGTH)
}

export function createState(crypto: CryptoLike): string {
  return randomText(crypto, 32)
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url(SHA-256(verifier)) without padding. */
export async function createChallenge(crypto: CryptoLike, verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}
