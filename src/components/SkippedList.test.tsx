// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkippedRecord } from '../types.ts'
import SkippedList from './SkippedList.tsx'

afterEach(cleanup)

const skipped: SkippedRecord[] = [
  {
    orderId: '1053',
    index: 13,
    reasons: [{ code: 'invalid-timestamp', field: 'paymentTimestamp', message: 'Payment timestamp is not a valid UTC timestamp' }],
  },
  {
    orderId: null,
    index: 3,
    reasons: [{ code: 'missing-field', field: 'orderId', message: 'Missing orderId' }],
  },
]

describe('SkippedList', () => {
  it('shows each order ID with its reasons', () => {
    render(<SkippedList skipped={skipped} onClose={() => undefined} />)
    expect(screen.getByText('#1053')).toBeTruthy()
    expect(screen.getByText('Payment timestamp is not a valid UTC timestamp')).toBeTruthy()
    expect(screen.getByText('Missing orderId')).toBeTruthy()
  })

  it('shows (no ID) with the input position for a record without an ID', () => {
    render(<SkippedList skipped={skipped} onClose={() => undefined} />)
    expect(screen.getByText('(no ID), record 4')).toBeTruthy()
  })

  it('calls onClose from the close button', async () => {
    const onClose = vi.fn()
    render(<SkippedList skipped={skipped} onClose={onClose} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
