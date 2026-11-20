/** True when the build-time value has at least one non-whitespace character. */
export function isApiMode(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export interface ApiConfig {
  readonly apiUrl: string
  readonly cognitoDomain: string
  readonly clientId: string
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

/**
 * Reads the build-time values. Returns null in Local mode. No default points at
 * a real resource, and none of these values is a secret.
 */
export function readApiConfig(): ApiConfig | null {
  const env = import.meta.env
  const apiUrl: unknown = env.VITE_API_URL
  if (!isApiMode(typeof apiUrl === 'string' ? apiUrl : undefined)) return null
  return {
    apiUrl: clean(apiUrl),
    cognitoDomain: clean(env.VITE_COGNITO_DOMAIN),
    clientId: clean(env.VITE_COGNITO_CLIENT_ID),
  }
}
