import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THRESHOLD_HOURS,
  EVALUATION_TIME,
  RULE_NAME,
  SUGGESTED_ACTION,
} from './config.ts'

describe('config', () => {
  it('uses the fixed evaluation time', () => {
    expect(EVALUATION_TIME).toBe('2026-11-20T12:00:00Z')
  })
  it('defaults the threshold to 24 hours', () => {
    expect(DEFAULT_THRESHOLD_HOURS).toBe(24)
  })
  it('names the rule', () => {
    expect(RULE_NAME).toBe('Paid and unfulfilled')
  })
  it('suggests the warehouse check', () => {
    expect(SUGGESTED_ACTION).toBe('Confirm pick status with the warehouse.')
  })
})
