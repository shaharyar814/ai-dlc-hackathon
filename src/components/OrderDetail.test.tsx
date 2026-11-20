// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FlaggedOrder } from '../types.ts'
import OrderDetail from './OrderDetail.tsx'

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

describe('OrderDetail', () => {
  it('shows the evidence for #1042', () => {
    render(<OrderDetail flagged={flagged('1042', 2, 27)} review={null} />)
    expect(screen.getByText('#1042')).toBeTruthy()
    expect(screen.getByText('2026-11-19 09:00 UTC')).toBeTruthy()
    expect(screen.getByText('27 h 0 min')).toBeTruthy()
    expect(screen.getByText('0 of 2 units fulfilled')).toBeTruthy()
    expect(screen.getByText('Paid and unfulfilled')).toBeTruthy()
    expect(screen.getByText('Confirm pick status with the warehouse.')).toBeTruthy()
  })

  it('is read-only', () => {
    render(<OrderDetail flagged={flagged('1042', 2, 27)} review={null} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('replaces the detail when a different order is rendered', () => {
    const { rerender } = render(<OrderDetail flagged={flagged('1042', 2, 27)} review={null} />)
    rerender(<OrderDetail flagged={flagged('1051', 4, 92)} review={null} />)
    expect(screen.queryByText('#1042')).toBeNull()
    expect(screen.getByText('#1051')).toBeTruthy()
    expect(screen.getByText('0 of 4 units fulfilled')).toBeTruthy()
    expect(screen.getByText('92 h 0 min')).toBeTruthy()
  })
})
