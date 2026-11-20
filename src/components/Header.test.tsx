// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Header from './Header.tsx'

afterEach(cleanup)

function renderHeader(checked: number, skipped: number) {
  const onRerun = vi.fn()
  const onOpenSkipped = vi.fn()
  render(
    <Header
      checkedCount={checked}
      skippedCount={skipped}
      evaluationTime="2026-11-20T12:00:00Z"
      onRerun={onRerun}
      onOpenSkipped={onOpenSkipped}
    />,
  )
  return { onRerun, onOpenSkipped }
}

describe('Header', () => {
  it('shows the counts and the evaluation time in UTC', () => {
    renderHeader(17, 5)
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
    expect(screen.getByText('Evaluated at 2026-11-20 12:00 UTC')).toBeTruthy()
    expect(screen.getByRole('button', { name: '5 skipped' })).toBeTruthy()
  })

  it('shows zero counts', () => {
    renderHeader(0, 0)
    expect(screen.getByText('0 checked, 0 skipped')).toBeTruthy()
    expect(screen.getByRole('button', { name: '0 skipped' })).toBeTruthy()
  })

  it('calls the re-run and skipped callbacks', async () => {
    const user = userEvent.setup()
    const { onRerun, onOpenSkipped } = renderHeader(17, 5)
    await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
    await user.click(screen.getByRole('button', { name: '5 skipped' }))
    expect(onRerun).toHaveBeenCalledTimes(1)
    expect(onOpenSkipped).toHaveBeenCalledTimes(1)
  })
})
