// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FlaggedOrder } from '../types.ts'
import EvidencePanel from './EvidencePanel.tsx'

afterEach(cleanup)

function flagged(orderId: string, ordered: number, hours: number): FlaggedOrder {
  return {
    order: {
      orderId,
      paymentStatus: 'paid',
      paidAtMs: Date.UTC(2026, 10, 19, 9),
      paidAt: '2026-11-19T09:00:00Z',
      canceled: false,
      refundStatus: 'none',
      orderedQuantity: ordered,
      fulfilledQuantity: 0,
    },
    elapsedMs: hours * 3_600_000,
  }
}

describe('EvidencePanel', () => {
  it('shows the evidence for Order #1042', () => {
    render(<EvidencePanel flagged={flagged('1042', 2, 27)} />)
    expect(screen.getByText('Paid at')).toBeTruthy()
    expect(screen.getByText('2026-11-19 09:00 UTC')).toBeTruthy()
    expect(screen.getByText('27 h 0 min')).toBeTruthy()
    expect(screen.getByText('0 of 2 units fulfilled')).toBeTruthy()
    expect(screen.getByText('Paid and unfulfilled')).toBeTruthy()
  })

  it('shows an empty progress bar when nothing is fulfilled', () => {
    render(<EvidencePanel flagged={flagged('1042', 2, 27)} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('1')
  })

  it('is read-only', () => {
    render(<EvidencePanel flagged={flagged('1042', 2, 27)} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('replaces the evidence when a different order is rendered', () => {
    const { rerender } = render(<EvidencePanel flagged={flagged('1042', 2, 27)} />)
    rerender(<EvidencePanel flagged={flagged('1051', 4, 92)} />)
    expect(screen.queryByText('0 of 2 units fulfilled')).toBeNull()
    expect(screen.queryByText('27 h 0 min')).toBeNull()
    expect(screen.getByText('0 of 4 units fulfilled')).toBeTruthy()
    expect(screen.getByText('92 h 0 min')).toBeTruthy()
  })
})
