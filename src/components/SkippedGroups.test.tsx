// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME, RULE_ID } from '../config.ts'
import { DATASET } from '../data/orders.ts'
import { evaluate } from '../rules/paidUnfulfilled.ts'
import { buildQueue } from '../rules/queue.ts'
import type { SkippedRecord } from '../types.ts'
import QueueTable from './QueueTable.tsx'
import SkippedGroups from './SkippedGroups.tsx'

afterEach(cleanup)

const TS_MESSAGE = 'Payment timestamp is not a valid UTC timestamp'
const skipped: SkippedRecord[] = [
  {
    orderId: '1053',
    index: 13,
    reasons: [{ code: 'invalid-timestamp', field: 'paymentTimestamp', message: TS_MESSAGE }],
  },
  {
    orderId: null,
    index: 3,
    reasons: [{ code: 'missing-field', field: 'orderId', message: 'Missing orderId' }],
  },
]

describe('SkippedGroups', () => {
  it('shows each order ID under its reason message', () => {
    render(<SkippedGroups skipped={skipped} />)
    const group = screen.getByRole('region', { name: TS_MESSAGE })
    expect(within(group).getByText('#1053')).toBeTruthy()
    expect(screen.getByText(TS_MESSAGE)).toBeTruthy()
    expect(screen.getByText('Missing orderId')).toBeTruthy()
  })

  it('shows (no ID) for a record without an ID', () => {
    render(<SkippedGroups skipped={skipped} />)
    const group = screen.getByRole('region', { name: 'Missing orderId' })
    expect(within(group).getByText('(no ID)')).toBeTruthy()
  })

  it('lists duplicate IDs separately', () => {
    const dup: SkippedRecord[] = [3, 7].map((index) => ({
      orderId: '1043',
      index,
      reasons: [{ code: 'duplicate-order-id', field: 'orderId', message: 'Duplicate orderId' }],
    }))
    render(<SkippedGroups skipped={dup} />)
    expect(screen.getAllByText('#1043')).toHaveLength(2)
    expect(screen.getByText('2 records')).toBeTruthy()
  })

  it('shows skipped duplicate 1043 in a group while the queue still shows it', () => {
    const result = evaluate(DATASET, EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS)
    const { open } = buildQueue(result.flagged, new Map(), RULE_ID)
    render(
      <MemoryRouter>
        <SkippedGroups skipped={result.skipped} />
        <QueueTable rows={open} view="open" onMarkReviewed={() => undefined} thresholdHours={24} />
      </MemoryRouter>,
    )
    const groups = screen.getAllByRole('region')
    expect(groups.some((g) => within(g).queryByText('#1043') !== null)).toBe(true)
    const table = screen.getByRole('table')
    expect(within(table).getByText('#1043')).toBeTruthy()
  })
})
