import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME } from '../src/config.ts'
import { parseUtcTimestamp } from '../src/rules/timestamps.ts'

export interface RuntimeConfig {
  readonly evaluationTime: string
  readonly thresholdHours: number
}

export type RuntimeConfigResult = { ok: true; config: RuntimeConfig } | { ok: false }

const DECIMAL = /^\d+(\.\d+)?$/

function readThreshold(raw: string | undefined): number | null {
  if (raw === undefined) return DEFAULT_THRESHOLD_HOURS
  if (!DECIMAL.test(raw)) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function readEvaluationTime(raw: string | undefined): string | null {
  if (raw === undefined) return EVALUATION_TIME
  return parseUtcTimestamp(raw) === null ? null : raw
}

/**
 * Reads the two deploy-time settings. A failure carries no detail so the
 * response cannot leak a variable name or value. Never reads the clock.
 */
export function readRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeConfigResult {
  const thresholdHours = readThreshold(env.FULFILLMENT_THRESHOLD_HOURS)
  const evaluationTime = readEvaluationTime(env.EVALUATION_TIME)
  if (thresholdHours === null || evaluationTime === null) return { ok: false }
  return { ok: true, config: { evaluationTime, thresholdHours } }
}
