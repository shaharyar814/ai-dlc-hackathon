import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./verify-deployed-api.mjs', import.meta.url))
const ORIGIN = 'https://site.example.test'
const NO_SCOPE = 'tok-secret-noscope-0123456789'
const NO_GROUP = 'tok-secret-nogroup-9876543210'

type Handler = (method: string, path: string, authorization: string) => number

const servers: ReturnType<typeof createServer>[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

async function startStub(handler: Handler): Promise<string> {
  const server = createServer((req, res) => {
    const status = handler(req.method ?? '', req.url ?? '', String(req.headers.authorization ?? ''))
    res.writeHead(status, { 'access-control-allow-origin': String(req.headers.origin ?? ''), 'content-type': 'application/json' })
    res.end('{}')
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function run(env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [script], { env: { PATH: process.env.PATH ?? '', ...env } }, (error, stdout, stderr) => {
      const code = error && typeof error.code === 'number' ? error.code : 0
      resolve({ code, out: `${stdout}${stderr}` })
    })
  })
}

const correct: Handler = (_method, path, authorization) => {
  if (path === '/reviews') return 404
  if (authorization === `Bearer ${NO_SCOPE}`) return 403
  if (authorization === `Bearer ${NO_GROUP}`) return 403
  return 401
}

describe('verify-deployed-api.mjs', () => {
  it('exits 0 and passes every check when the API behaves as expected', async () => {
    const url = await startStub(correct)
    const { code, out } = await run({ API_URL: url, TOKEN_NO_SCOPE: NO_SCOPE, TOKEN_NO_GROUP: NO_GROUP, ORIGIN })
    expect(code).toBe(0)
    expect(out).toContain('PASS  GET /queue with no token: observed 401, expected 401')
    expect(out).toContain('PASS  GET /queue with a malformed token')
    expect(out).toContain('PASS  GET /queue with a valid token that lacks the scope: observed 403')
    expect(out).toContain('PASS  GET /reviews (unknown route): observed 404')
    expect(out).toContain('(CORS header)')
    expect(out).toContain('0 failed, 0 skipped')
  })

  it('never prints a token', async () => {
    const url = await startStub(correct)
    const { out } = await run({ API_URL: url, TOKEN_NO_SCOPE: NO_SCOPE, TOKEN_NO_GROUP: NO_GROUP, ORIGIN })
    expect(out).not.toContain(NO_SCOPE)
    expect(out).not.toContain(NO_GROUP)
    expect(out).not.toContain('tok-secret')
  })

  it('marks a check as skipped when its token is missing, and still exits 0', async () => {
    const url = await startStub(correct)
    const { code, out } = await run({ API_URL: url })
    expect(code).toBe(0)
    expect(out).toContain('SKIP  GET /queue with a valid token that lacks the scope: TOKEN_NO_SCOPE is not set')
    expect(out).toContain('SKIP  GET /queue with a valid token for a user outside the group')
    expect(out).toContain('2 skipped')
    expect(out).toContain('ORIGIN is not set')
  })

  it('exits 1 and reports the observed status when the missing-scope status differs', async () => {
    const url = await startStub((m, p, a) => (a === `Bearer ${NO_SCOPE}` ? 401 : correct(m, p, a)))
    const { code, out } = await run({ API_URL: url, TOKEN_NO_SCOPE: NO_SCOPE })
    expect(code).toBe(1)
    expect(out).toContain('FAIL  GET /queue with a valid token that lacks the scope: observed 401, expected 403')
    expect(out).not.toContain(NO_SCOPE)
  })

  it('exits 1 when an unauthenticated request is answered with data', async () => {
    const url = await startStub(() => 200)
    const { code, out } = await run({ API_URL: url })
    expect(code).toBe(1)
    expect(out).toContain('FAIL  GET /queue with no token: observed 200, expected 401')
  })

  it('exits 1 when the CORS header is missing on a 401', async () => {
    const server = createServer((req, res) => {
      res.writeHead(req.url === '/reviews' ? 404 : 401)
      res.end('{}')
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const { code, out } = await run({ API_URL: url, ORIGIN })
    expect(code).toBe(1)
    expect(out).toContain('FAIL  GET /queue with no token (CORS header)')
  })

  it('exits 2 without API_URL', async () => {
    const { code } = await run({})
    expect(code).toBe(2)
  })
})
