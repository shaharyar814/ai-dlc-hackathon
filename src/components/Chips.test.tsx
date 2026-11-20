// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import AgeChip from './AgeChip.tsx'
import StatusChip from './StatusChip.tsx'

afterEach(cleanup)

const HOUR = 3_600_000
const MINUTE = 60_000
const NUM_RUNS = 100

type State =
  | { kind: 'status'; status: 'open' | 'reviewed'; label: string }
  | { kind: 'age'; elapsedMs: number; label: string }

const stateArb: fc.Arbitrary<State> = fc.oneof(
  fc.constantFrom<State>(
    { kind: 'status', status: 'open', label: 'Open' },
    { kind: 'status', status: 'reviewed', label: 'Reviewed' },
  ),
  fc
    .oneof(
      fc.integer({ min: 0, max: 48 * HOUR - 1 }),
      fc.constantFrom(48 * HOUR - MINUTE),
    )
    .map((elapsedMs): State => ({ kind: 'age', elapsedMs, label: 'Late' })),
  fc
    .oneof(
      fc.integer({ min: 48 * HOUR, max: 400 * HOUR }),
      fc.constantFrom(48 * HOUR),
    )
    .map((elapsedMs): State => ({ kind: 'age', elapsedMs, label: 'Very late' })),
)

describe('chips', () => {
  // Feature: ui-redesign, Property 14: Status and urgency always have icon and label
  // **Validates: Requirements 12.6, 12.8**
  it('Feature: ui-redesign, Property 14: Status and urgency always have icon and label', () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        const { container, unmount } = render(
          state.kind === 'status' ? (
            <StatusChip status={state.status} />
          ) : (
            <AgeChip elapsedMs={state.elapsedMs} />
          ),
        )
        const svg = container.querySelector('svg')
        const hasIcon = svg !== null && svg.getAttribute('aria-hidden') === 'true'
        const hasLabel = (container.textContent ?? '').includes(state.label)
        unmount()
        return hasIcon && hasLabel
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('AgeChip at 47 h 59 min shows "47 h" and "Late"', () => {
    const { container } = render(<AgeChip elapsedMs={48 * HOUR - MINUTE} />)
    expect(container.textContent).toContain('47 h')
    expect(container.textContent).toContain('Late')
    expect(container.textContent).not.toContain('Very late')
  })

  it('AgeChip at 48 h 0 min shows "48 h" and "Very late"', () => {
    const { container } = render(<AgeChip elapsedMs={48 * HOUR} />)
    expect(container.textContent).toContain('48 h')
    expect(container.textContent).toContain('Very late')
  })
})
