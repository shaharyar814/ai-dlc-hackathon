import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME } from '../src/config.ts'
import { readRuntimeConfig } from './runtimeConfig.ts'

describe('readRuntimeConfig defaults', () => {
  it('uses the Stage A defaults when both variables are unset', () => {
    expect(readRuntimeConfig({})).toEqual({
      ok: true,
      config: { evaluationTime: EVALUATION_TIME, thresholdHours: DEFAULT_THRESHOLD_HOURS },
    })
  })
})

// Feature: stalled-orders-aws, Property 5: Valid configuration is used as given
describe('Property 5: Valid configuration is used as given', () => {
  it('returns the threshold and evaluation time that were set', () => {
    const threshold = fc
      .tuple(fc.integer({ min: 0, max: 100000 }), fc.option(fc.integer({ min: 0, max: 999 }), { nil: undefined }))
      .map(([whole, frac]) => (frac === undefined ? `${whole}` : `${whole}.${frac}`))
      .filter((s) => Number(s) > 0)
    const time = fc
      .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2100-01-01T00:00:00Z'), noInvalidDate: true })
      .map((d) => d.toISOString())
    fc.assert(
      fc.property(threshold, time, (t, e) => {
        const result = readRuntimeConfig({ FULFILLMENT_THRESHOLD_HOURS: t, EVALUATION_TIME: e })
        expect(result).toEqual({ ok: true, config: { evaluationTime: e, thresholdHours: Number(t) } })
      }),
      { numRuns: 200 },
    )
  })
})

describe('invalid configuration', () => {
  const badThresholds = ['', ' ', '   ', 'abc', '0', '0.0', '-1', '-0.5', 'NaN', 'Infinity', '1e2', ' 24', '24 ', '0x10', '.5', '5.']
  for (const value of badThresholds) {
    it(`rejects FULFILLMENT_THRESHOLD_HOURS=${JSON.stringify(value)}`, () => {
      expect(readRuntimeConfig({ FULFILLMENT_THRESHOLD_HOURS: value })).toEqual({ ok: false })
    })
  }
  const badTimes = [
    '',
    ' ',
    'tomorrow',
    '2026-11-20T12:00:00',
    '2026-11-20T12:00:00+02:00',
    '2026-11-20T12:00:00-00:00',
    '2026-02-30T00:00:00Z',
    ' 2026-11-20T12:00:00Z',
    '2026-11-20T12:00:00Z ',
  ]
  for (const value of badTimes) {
    it(`rejects EVALUATION_TIME=${JSON.stringify(value)}`, () => {
      expect(readRuntimeConfig({ EVALUATION_TIME: value })).toEqual({ ok: false })
    })
  }
  it('carries no detail on failure', () => {
    expect(Object.keys(readRuntimeConfig({ FULFILLMENT_THRESHOLD_HOURS: 'x' }))).toEqual(['ok'])
  })
})
