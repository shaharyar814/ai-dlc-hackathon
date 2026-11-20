// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { RawOrder } from '../types.ts'
import WorkbenchProvider from '../state/WorkbenchProvider.tsx'
import DataQualityPage from './DataQualityPage.tsx'

afterEach(cleanup)

const good: RawOrder = {
  orderId: '1',
  paymentStatus: 'paid',
  paymentTimestamp: '2026-11-19T12:00:00Z',
  canceled: false,
  refundStatus: 'none',
  orderedQuantity: 1,
  fulfilledQuantity: 0,
}

function renderPage(dataset?: readonly RawOrder[]) {
  render(
    <MemoryRouter>
      <WorkbenchProvider dataset={dataset} storage={null}>
        <DataQualityPage />
      </WorkbenchProvider>
    </MemoryRouter>,
  )
}

describe('DataQualityPage', () => {
  it('shows the heading and the bundled skipped records grouped by reason', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Data quality' })).toBeTruthy()
    expect(screen.getByText('#1053')).toBeTruthy()
    expect(screen.getAllByText('#1043').length).toBeGreaterThan(0)
    expect(screen.queryByText('No records were skipped.')).toBeNull()
  })

  it('shows (no ID) for a record without an ID', () => {
    renderPage([good, { ...good, orderId: undefined } as unknown as RawOrder])
    expect(screen.getByText('(no ID)')).toBeTruthy()
    expect(screen.getByText('Missing orderId')).toBeTruthy()
  })

  it('shows the empty state when nothing was skipped', () => {
    renderPage([good])
    expect(screen.getByText('No records were skipped.')).toBeTruthy()
  })

  it('lists duplicate IDs separately', () => {
    renderPage([good, good, good])
    expect(screen.getAllByText('#1')).toHaveLength(2)
  })
})
