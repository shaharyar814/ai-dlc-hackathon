// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QueueRow } from '../rules/queue.ts'
import QueueTable from './QueueTable.tsx'

afterEach(cleanup)

function row(orderId: string, reviewedAt: string | null = null): QueueRow {
  return {
    flagged: {
      order: {
        orderId,
        paymentStatus: 'paid',
        paidAtMs: Date.UTC(2026, 10, 19, 9),
        paidAt: '2026-11-19T09:00:00Z',
        canceled: false,
        refundStatus: 'none',
        orderedQuantity: 2,
        fulfilledQuantity: 0,
      },
      elapsedMs: 27 * 3_600_000,
    },
    review: reviewedAt ? { orderId, ruleId: 'paid-unfulfilled', reviewedAt } : null,
  }
}

function renderTable(overrides: Partial<Parameters<typeof QueueTable>[0]> = {}) {
  const props = {
    rows: [row('1042')],
    view: 'open' as const,
    selectedId: null,
    onSelect: vi.fn(),
    onMarkReviewed: vi.fn(),
    thresholdHours: 24,
    ...overrides,
  }
  render(<QueueTable {...props} />)
  return props
}

describe('QueueTable', () => {
  it('exposes a table with column headers', () => {
    renderTable()
    expect(screen.getByRole('table')).toBeTruthy()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Order', 'Hours since payment', 'Reason', 'Review status', 'Action'])
  })

  it('shows order, hours, reason, and review status in a row', () => {
    renderTable()
    const tableRow = screen.getByRole('button', { name: '#1042' }).closest('tr') as HTMLElement
    expect(within(tableRow).getByText('27 h')).toBeTruthy()
    expect(
      within(tableRow).getByText('Paid 27 h ago, 0 of 2 units fulfilled (threshold 24 h)'),
    ).toBeTruthy()
    expect(within(tableRow).getByText('Open')).toBeTruthy()
  })

  it('shows the review timestamp for reviewed rows', () => {
    renderTable({ rows: [row('1042', '2026-11-20T12:05:31.000Z')], view: 'reviewed' })
    expect(screen.getByText('Reviewed 2026-11-20 12:05 UTC')).toBeTruthy()
  })

  it('marks the selected order with aria-current', () => {
    renderTable({ selectedId: '1042' })
    expect(screen.getByRole('button', { name: '#1042' }).getAttribute('aria-current')).toBe('true')
  })

  it('shows Mark reviewed in Open and hides it in Reviewed', () => {
    renderTable()
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeTruthy()
    cleanup()
    renderTable({ rows: [row('1042', '2026-11-20T12:05:31.000Z')], view: 'reviewed' })
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })

  it('announces the empty state for each view', () => {
    renderTable({ rows: [] })
    expect(screen.getByRole('status').textContent).toBe('No stalled orders. Nothing needs review.')
    expect(screen.queryByRole('table')).toBeNull()
    cleanup()
    renderTable({ rows: [], view: 'reviewed' })
    expect(screen.getByRole('status').textContent).toBe('No reviewed orders yet.')
  })

  it('works with the keyboard only', async () => {
    const user = userEvent.setup()
    const props = renderTable()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '#1042' }))
    await user.keyboard('{Enter}')
    expect(props.onSelect).toHaveBeenCalledWith('1042')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark reviewed' }))
    await user.keyboard('{Enter}')
    expect(props.onMarkReviewed).toHaveBeenCalledWith('1042')
  })
})
