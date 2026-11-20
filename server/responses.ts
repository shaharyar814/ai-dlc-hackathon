export type ErrorCode = 'invalid_request' | 'forbidden' | 'not_found' | 'internal_error'

export interface ApiResult {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export const GENERIC_ERROR_MESSAGE = 'The request could not be completed.'

const JSON_HEADERS = { 'content-type': 'application/json' } as const

export function jsonResponse(statusCode: number, payload: unknown): ApiResult {
  return { statusCode, headers: { ...JSON_HEADERS }, body: JSON.stringify(payload) }
}

export function errorResponse(statusCode: number, code: ErrorCode, message: string): ApiResult {
  return jsonResponse(statusCode, { error: { code, message } })
}

export function invalidRequest(message: string): ApiResult {
  return errorResponse(400, 'invalid_request', message)
}

export function forbidden(): ApiResult {
  return errorResponse(403, 'forbidden', 'Access is not allowed.')
}

export function notFound(): ApiResult {
  return errorResponse(404, 'not_found', 'Route not found')
}

/** The one fixed 500 body. It never carries a cause, a value or a resource name. */
export function internalError(): ApiResult {
  return errorResponse(500, 'internal_error', GENERIC_ERROR_MESSAGE)
}
