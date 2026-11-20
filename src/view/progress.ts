/** fulfilled / ordered, clamped to [0, 1]; 0 when ordered is 0 or less. */
export function progressFraction(fulfilled: number, ordered: number): number {
  if (!(ordered > 0)) return 0
  const f = fulfilled / ordered
  if (Number.isNaN(f)) return 0
  return Math.min(1, Math.max(0, f))
}
