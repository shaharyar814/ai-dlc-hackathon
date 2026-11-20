import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isApiMode, readApiConfig } from './config.ts'

// Feature: stalled-orders-aws, Property 15: Mode selection follows the build value
describe('Property 15: Mode selection follows the build value', () => {
  it('is API mode if and only if the value has a non-whitespace character', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), (value) => {
        const expected = value !== undefined && /\S/.test(value)
        expect(isApiMode(value)).toBe(expected)
      }),
      { numRuns: 200 },
    )
  })

  it('treats whitespace-only values as local mode', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[ \t\n\r\u00a0]{0,8}$/), (value) => {
        expect(isApiMode(value)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})

describe('readApiConfig', () => {
  it('returns null when VITE_API_URL is not set in the test build', () => {
    expect(readApiConfig()).toBeNull()
  })
})
