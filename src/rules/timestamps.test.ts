import { describe, expect, it } from 'vitest'
import { parseUtcTimestamp } from './timestamps.ts'

describe('parseUtcTimestamp', () => {
  it('returns epoch ms for a valid timestamp', () => {
    expect(parseUtcTimestamp('2026-11-20T12:00:00Z')).toBe(Date.UTC(2026, 10, 20, 12, 0, 0))
  })
  it('accepts a timestamp without seconds', () => {
    expect(parseUtcTimestamp('2026-11-20T12:05Z')).toBe(Date.UTC(2026, 10, 20, 12, 5))
  })
  it('accepts milliseconds', () => {
    expect(parseUtcTimestamp('2026-11-20T12:05:31.250Z')).toBe(
      Date.UTC(2026, 10, 20, 12, 5, 31, 250),
    )
  })
  it('rejects a missing Z', () => {
    expect(parseUtcTimestamp('2026-11-20T12:00:00')).toBeNull()
  })
  it('rejects an offset', () => {
    expect(parseUtcTimestamp('2026-11-20T12:00:00+02:00')).toBeNull()
  })
  it('rejects free text', () => {
    expect(parseUtcTimestamp('yesterday')).toBeNull()
  })
  it('rejects an empty string', () => {
    expect(parseUtcTimestamp('')).toBeNull()
  })
  it('rejects non-strings', () => {
    expect(parseUtcTimestamp(1763640000000)).toBeNull()
    expect(parseUtcTimestamp(null)).toBeNull()
    expect(parseUtcTimestamp(undefined)).toBeNull()
  })
  it('rejects Feb 30', () => {
    expect(parseUtcTimestamp('2026-02-30T00:00:00Z')).toBeNull()
  })
  it('rejects an hour of 24', () => {
    expect(parseUtcTimestamp('2026-11-20T24:00:00Z')).toBeNull()
  })
})
