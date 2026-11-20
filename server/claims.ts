export const LEAD_GROUP = 'fulfillment-lead'

type Claims = Readonly<Record<string, unknown>> | undefined

/** The username claim, or null when it is absent or not a non-empty string. */
export function readUsername(claims: Claims): string | null {
  const value = claims?.username
  return typeof value === 'string' && value !== '' ? value : null
}

function splitBracketed(inner: string): string[] {
  return inner
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function fromString(text: string): string[] {
  const trimmed = text.trim()
  if (trimmed === '') return []
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.filter((g): g is string => typeof g === 'string')
    } catch {
      // Not JSON: HTTP API passes arrays as "[a b]", so fall through.
    }
    return splitBracketed(trimmed.slice(1, -1))
  }
  return [trimmed]
}

/**
 * Group names from the `cognito:groups` claim. Accepts an array, a bracketed
 * string such as "[a b]" or "[a, b]", a JSON array string, or one name.
 * Absent, empty or unparsable gives an empty list.
 */
export function readGroups(claims: Claims): readonly string[] {
  const value = claims?.['cognito:groups']
  if (Array.isArray(value)) return value.filter((g): g is string => typeof g === 'string')
  if (typeof value === 'string') return fromString(value)
  return []
}

export function isLead(claims: Claims): boolean {
  return readGroups(claims).includes(LEAD_GROUP)
}
