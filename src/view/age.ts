const MS_PER_HOUR = 3_600_000
const VERY_LATE_HOURS = 48

export type AgeTier = 'late' | 'very-late'

export const AGE_TIER_LABEL: Record<AgeTier, string> = {
  late: 'Late',
  'very-late': 'Very late',
}

/** Whole hours, rounded down. */
export function wholeHours(elapsedMs: number): number {
  return Math.floor(elapsedMs / MS_PER_HOUR)
}

/** Display only: under 48 whole hours is late, 48 or more is very late. */
export function ageTier(elapsedMs: number): AgeTier {
  return wholeHours(elapsedMs) >= VERY_LATE_HOURS ? 'very-late' : 'late'
}
