import { RULE_ID } from '../src/config.ts'
import { encodeQueueResponse } from '../src/api/wire.ts'
import { evaluate } from '../src/rules/paidUnfulfilled.ts'
import type { EvaluationResult, RawOrder } from '../src/types.ts'
import { isLead, readUsername } from './claims.ts'
import type { ReviewStore } from './reviewStore.ts'
import {
  forbidden,
  internalError,
  invalidRequest,
  jsonResponse,
  notFound,
  type ApiResult,
} from './responses.ts'
import { readRuntimeConfig, type RuntimeConfig } from './runtimeConfig.ts'

export type { ApiResult } from './responses.ts'

export interface ApiEvent {
  routeKey?: string
  rawPath?: string
  body?: string | null
  isBase64Encoded?: boolean
  requestContext: {
    http: { method: string; path: string }
    authorizer?: { jwt?: { claims?: Record<string, unknown>; scopes?: string[] | null } }
  }
}

export interface HandlerDeps {
  store: ReviewStore
  env: Readonly<Record<string, string | undefined>>
  /** ISO 8601 UTC with milliseconds and Z. Called once per POST /reviews. */
  clock: () => string
  dataset: readonly RawOrder[]
  log: (entry: Record<string, unknown>) => void
}

class RequestError extends Error {
  readonly result: ApiResult
  constructor(result: ApiResult) {
    super('request rejected')
    this.result = result
  }
}

function evaluateDataset(deps: HandlerDeps, config: RuntimeConfig): EvaluationResult {
  return evaluate(deps.dataset, config.evaluationTime, config.thresholdHours)
}

async function getQueue(deps: HandlerDeps, config: RuntimeConfig): Promise<ApiResult> {
  const result = evaluateDataset(deps, config)
  const keys = result.flagged.map((f) => ({ orderId: f.order.orderId, ruleId: RULE_ID }))
  const reviews = await deps.store.getMany(keys)
  return jsonResponse(
    200,
    encodeQueueResponse({
      ruleId: RULE_ID,
      evaluationTime: config.evaluationTime,
      thresholdHours: config.thresholdHours,
      result,
      reviews,
    }),
  )
}

function decodeBody(event: ApiEvent): string | null {
  const body = event.body
  if (typeof body !== 'string' || body === '') return null
  return event.isBase64Encoded === true ? Buffer.from(body, 'base64').toString('utf8') : body
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function parseReviewRequest(event: ApiEvent): { orderId: string; ruleId: string } {
  const text = decodeBody(event)
  if (text === null) throw new RequestError(invalidRequest('Request body is missing or empty'))
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new RequestError(invalidRequest('Request body is not valid JSON'))
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RequestError(invalidRequest('Request body must be a JSON object'))
  }
  const { orderId, ruleId } = parsed as Record<string, unknown>
  if (!nonEmptyString(orderId)) throw new RequestError(invalidRequest('orderId must be a non-empty string'))
  if (!nonEmptyString(ruleId)) throw new RequestError(invalidRequest('ruleId must be a non-empty string'))
  return { orderId, ruleId }
}

async function postReview(
  event: ApiEvent,
  deps: HandlerDeps,
  config: RuntimeConfig,
  reviewer: string,
): Promise<ApiResult> {
  const { orderId, ruleId } = parseReviewRequest(event)
  if (ruleId !== RULE_ID) throw new RequestError(invalidRequest('rule ID is not supported'))
  const inQueue = evaluateDataset(deps, config).flagged.some((f) => f.order.orderId === orderId)
  if (!inQueue) throw new RequestError(invalidRequest('order is not in the queue'))
  const reviewedAt = deps.clock()
  const { created, review } = await deps.store.save(orderId, ruleId, reviewedAt, reviewer)
  return jsonResponse(created ? 201 : 200, {
    orderId: review.orderId,
    ruleId: review.ruleId,
    reviewedAt: review.reviewedAt,
    reviewer: review.reviewer,
  })
}

function logFailure(deps: HandlerDeps, operation: string, error: unknown): void {
  const cause = error instanceof Error ? error.cause : undefined
  deps.log({
    level: 'error',
    operation,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Unknown error',
    ...(cause instanceof Error ? { causeName: cause.name, causeMessage: cause.message } : {}),
  })
}

/**
 * Routes one request. Never reads the system clock except for the single
 * `deps.clock()` call in POST /reviews. Never logs the event or its claims.
 */
export async function handleRequest(event: ApiEvent, deps: HandlerDeps): Promise<ApiResult> {
  const method = event.requestContext.http.method
  const path = event.requestContext.http.path
  const operation = `${method} ${path}`
  try {
    const isQueue = method === 'GET' && path === '/queue'
    const isReview = method === 'POST' && path === '/reviews'
    if (!isQueue && !isReview) return notFound()

    const claims = event.requestContext.authorizer?.jwt?.claims
    if (!isLead(claims)) return forbidden()

    const reviewer = isReview ? readUsername(claims) : null
    if (isReview && reviewer === null) return forbidden()

    const parsedConfig = readRuntimeConfig(deps.env)
    if (!parsedConfig.ok) {
      logFailure(deps, operation, new Error('Invalid runtime configuration'))
      return internalError()
    }
    if (isQueue) return await getQueue(deps, parsedConfig.config)
    return await postReview(event, deps, parsedConfig.config, reviewer ?? '')
  } catch (error) {
    if (error instanceof RequestError) return error.result
    logFailure(deps, operation, error)
    return internalError()
  }
}

