import fc from 'fast-check'
import { EVALUATION_TIME, RULE_ID } from '../src/config.ts'
import type { RawOrder } from '../src/types.ts'
import type { ApiEvent, ApiResult, HandlerDeps } from './handleRequest.ts'
import { DynamoReviewStore, type ReviewStore } from './reviewStore.ts'
import { createFakeDynamo, type FakeDynamo } from './testSupport.ts'

export const FIXED_REVIEW_TIME = '2026-11-20T12:05:31.000Z'
export const LEAD_CLAIMS: Record<string, unknown> = {
  username: 'lead1',
  'cognito:groups': '[fulfillment-lead]',
}

export function getQueueEvent(
  claims: Record<string, unknown> | null = LEAD_CLAIMS,
  extra: { path?: string; method?: string } = {},
): ApiEvent {
  return {
    requestContext: {
      http: { method: extra.method ?? 'GET', path: extra.path ?? '/queue' },
      authorizer: claims === null ? undefined : { jwt: { claims, scopes: ['fulfillment-watch/api'] } },
    },
  }
}

export function postReviewEvent(
  body: unknown,
  claims: Record<string, unknown> | null = LEAD_CLAIMS,
  options: { raw?: boolean; base64?: boolean } = {},
): ApiEvent {
  let text: string | null
  if (options.raw === true) text = body as string | null
  else text = JSON.stringify(body)
  const encoded = options.base64 === true && text !== null ? Buffer.from(text, 'utf8').toString('base64') : text
  return {
    body: encoded,
    isBase64Encoded: options.base64 === true,
    requestContext: {
      http: { method: 'POST', path: '/reviews' },
      authorizer: claims === null ? undefined : { jwt: { claims, scopes: ['fulfillment-watch/api'] } },
    },
  }
}

/** A clock that returns a fixed timestamp and records how often it was called. */
export function createCountingClock(value: string = FIXED_REVIEW_TIME): { clock: () => string; calls: () => number } {
  let calls = 0
  return {
    clock: () => {
      calls += 1
      return value
    },
    calls: () => calls,
  }
}

export interface Harness {
  deps: HandlerDeps
  db: FakeDynamo
  store: ReviewStore
  clock: { calls: () => number }
  logs: Record<string, unknown>[]
}

export function createHarness(
  dataset: readonly RawOrder[],
  options: {
    env?: Record<string, string | undefined>
    db?: FakeDynamo
    store?: ReviewStore
    reviewTime?: string
  } = {},
): Harness {
  const db = options.db ?? createFakeDynamo()
  const store = options.store ?? new DynamoReviewStore(db)
  const counting = createCountingClock(options.reviewTime)
  const logs: Record<string, unknown>[] = []
  return {
    deps: {
      store,
      env: options.env ?? { EVALUATION_TIME, FULFILLMENT_THRESHOLD_HOURS: '24' },
      clock: counting.clock,
      dataset,
      log: (entry) => {
        logs.push(entry)
      },
    },
    db,
    store,
    clock: counting,
    logs,
  }
}

export function bodyOf(result: ApiResult): Record<string, unknown> {
  return JSON.parse(result.body) as Record<string, unknown>
}

/** A valid synthetic order. `paymentTimestamp` is 24 hours before the evaluation time by default. */
export function rawOrder(overrides: Record<string, unknown> = {}): RawOrder {
  return {
    orderId: '1',
    paymentStatus: 'paid',
    paymentTimestamp: '2026-11-19T12:00:00Z',
    canceled: false,
    refundStatus: 'none',
    orderedQuantity: 1,
    fulfilledQuantity: 0,
    ...overrides,
  }
}

// --- fast-check arbitraries ---

const MS_PER_HOUR = 3_600_000
const EVAL_MS = Date.parse(EVALUATION_TIME)

function iso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

const validRecord = fc
  .record({
    paidHoursAgo: fc.integer({ min: 0, max: 100 }),
    extraMinutes: fc.integer({ min: -2, max: 2 }),
    paymentStatus: fc.constantFrom('paid', ' PAID ', 'pending'),
    canceled: fc.boolean(),
    refundStatus: fc.constantFrom('none', 'partial', 'full'),
    orderedQuantity: fc.integer({ min: 1, max: 5 }),
    fulfilledQuantity: fc.integer({ min: 0, max: 2 }),
  })
  .map((r) => ({
    paymentStatus: r.paymentStatus,
    paymentTimestamp: iso(EVAL_MS - r.paidHoursAgo * MS_PER_HOUR - r.extraMinutes * 60_000 * (r.paidHoursAgo > 0 ? 1 : 0)),
    canceled: r.canceled,
    refundStatus: r.refundStatus,
    orderedQuantity: r.orderedQuantity,
    fulfilledQuantity: r.fulfilledQuantity,
  }))

const invalidRecord = fc.constantFrom<Record<string, unknown>>(
  { paymentStatus: 'paid', paymentTimestamp: 'yesterday', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  { paymentStatus: 'paid', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
  { paymentStatus: 'paid', paymentTimestamp: '2026-11-19T12:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: -1 },
  { paymentStatus: 'paid', paymentTimestamp: '2030-01-01T00:00:00Z', canceled: false, refundStatus: 'none', orderedQuantity: 1, fulfilledQuantity: 0 },
)

/** Raw datasets with valid, invalid and duplicate-ID records. IDs come from a small pool so duplicates occur. */
export const rawDatasetArb: fc.Arbitrary<RawOrder[]> = fc.array(
  fc.record({
    orderId: fc.constantFrom('1', '2', '3', '10', '11', '042', 'A7', 'b'),
    body: fc.oneof({ weight: 4, arbitrary: validRecord }, { weight: 1, arbitrary: invalidRecord }),
  }),
  { maxLength: 12 },
).map((items) => items.map(({ orderId, body }) => ({ orderId, ...body })))

export const nonLeadClaimsArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  fc.constant({ username: 'lead1' }),
  fc.constant({ username: 'lead1', 'cognito:groups': '[]' }),
  fc.constant({ username: 'lead1', 'cognito:groups': '[other-group]' }),
  fc.constant({ username: 'lead1', 'cognito:groups': ['other-group', 'x'] }),
  fc.constant({}),
)

export const usernameArb = fc.stringMatching(/^[a-z][a-z0-9_.-]{0,11}$/)

export function leadClaims(username: string): Record<string, unknown> {
  return { username, 'cognito:groups': '[fulfillment-lead]' }
}

export { RULE_ID }
