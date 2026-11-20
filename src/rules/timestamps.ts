const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?Z$/

/**
 * Parses `YYYY-MM-DDTHH:MM[:SS[.fff]]Z` as UTC and returns epoch milliseconds,
 * or null for anything else. Never throws and never reads the clock.
 */
export function parseUtcTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = PATTERN.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute, second, millis] = [
    match[1],
    match[2],
    match[3],
    match[4],
    match[5],
    match[6] ?? '0',
    match[7] ?? '0',
  ].map(Number)
  const ms = Date.UTC(year, month - 1, day, hour, minute, second, millis)
  const check = new Date(ms)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second ||
    check.getUTCMilliseconds() !== millis
  ) {
    return null
  }
  return ms
}
