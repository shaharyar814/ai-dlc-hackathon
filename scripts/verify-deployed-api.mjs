// Checks the status codes of a deployed API. Needs a deployed stack, so the operator runs it.
// Environment:
//   API_URL          required. The API base URL, for example https://abc123.execute-api.us-east-1.amazonaws.com
//   TOKEN_NO_SCOPE   optional. A valid access token that lacks the scope fulfillment-watch/api
//   TOKEN_NO_GROUP   optional. A valid access token with the scope, for a user outside fulfillment-lead
//   ORIGIN           optional. The site origin, to check the CORS headers on 401 and 403 responses
// Tokens are only sent in the Authorization header. They are never printed or stored.

const apiUrl = (process.env.API_URL ?? '').trim().replace(/\/+$/, '')
if (apiUrl === '') {
  console.error('API_URL is required.')
  process.exit(2)
}
const tokenNoScope = (process.env.TOKEN_NO_SCOPE ?? '').trim()
const tokenNoGroup = (process.env.TOKEN_NO_GROUP ?? '').trim()
const origin = (process.env.ORIGIN ?? '').trim()

const results = []

function record(name, status, expected, note = '') {
  results.push({ name, status, expected, note })
  const verdict = status === 'skipped' ? 'SKIP' : status === expected ? 'PASS' : 'FAIL'
  const observed = status === 'skipped' ? 'not run' : `observed ${status}, expected ${expected}`
  console.log(`${verdict}  ${name}: ${observed}${note ? ` (${note})` : ''}`)
}

async function call(method, path, token) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (origin) headers.Origin = origin
  const response = await fetch(`${apiUrl}${path}`, { method, headers })
  await response.arrayBuffer()
  return response
}

async function check(name, method, path, token, expected, extra = {}) {
  try {
    const response = await call(method, path, token)
    const note = extra.note ?? ''
    const status = response.status
    if (extra.cors && origin) {
      const allowOrigin = response.headers.get('access-control-allow-origin')
      record(`${name} (CORS header)`, allowOrigin === origin ? expected : -1, expected, `access-control-allow-origin ${allowOrigin ?? 'absent'}`)
    }
    record(name, status, expected, note)
  } catch (error) {
    record(name, -1, expected, `request failed: ${error instanceof Error ? error.name : 'error'}`)
  }
}

function skip(name, expected, reason) {
  results.push({ name, status: 'skipped', expected })
  console.log(`SKIP  ${name}: ${reason}`)
}

await check('GET /queue with no token', 'GET', '/queue', '', 401, { cors: true })
await check('GET /queue with a malformed token', 'GET', '/queue', 'not.a.token', 401, { cors: true })

if (tokenNoScope) {
  await check('GET /queue with a valid token that lacks the scope', 'GET', '/queue', tokenNoScope, 403, {
    cors: true,
    note: 'expected status is unverified',
  })
} else {
  skip('GET /queue with a valid token that lacks the scope', 403, 'TOKEN_NO_SCOPE is not set')
}

if (tokenNoGroup) {
  await check('GET /queue with a valid token for a user outside the group', 'GET', '/queue', tokenNoGroup, 403, {
    cors: true,
  })
} else {
  skip('GET /queue with a valid token for a user outside the group', 403, 'TOKEN_NO_GROUP is not set')
}

await check('GET /reviews (unknown route)', 'GET', '/reviews', '', 404)

if (!origin) console.log('NOTE  ORIGIN is not set, so the CORS headers were not checked.')

const executed = results.filter((r) => r.status !== 'skipped')
const failed = executed.filter((r) => r.status !== r.expected)
const skipped = results.length - executed.length
console.log(`\n${executed.length - failed.length} passed, ${failed.length} failed, ${skipped} skipped.`)
process.exit(failed.length === 0 ? 0 : 1)
