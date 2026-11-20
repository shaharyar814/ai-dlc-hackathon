// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Header from './Header.tsx'

afterEach(cleanup)

function renderHeader(checked: number, skipped: number, path = '/') {
  const onRerun = vi.fn()
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header
        checkedCount={checked}
        skippedCount={skipped}
        evaluationTime="2026-11-20T12:00:00Z"
        onRerun={onRerun}
      />
    </MemoryRouter>,
  )
  return { onRerun }
}

describe('Header', () => {
  it('shows the counts and the evaluation time in UTC', () => {
    renderHeader(17, 5)
    expect(screen.getByText('17 checked, 5 skipped')).toBeTruthy()
    expect(screen.getByText('Evaluated at 2026-11-20 12:00 UTC')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Data quality' }).getAttribute('href')).toBe(
      '/data-quality',
    )
  })

  it('shows zero counts', () => {
    renderHeader(0, 0)
    expect(screen.getByText('0 checked, 0 skipped')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Data quality' }).getAttribute('href')).toBe(
      '/data-quality',
    )
  })

  it('calls the re-run callback', async () => {
    const user = userEvent.setup()
    const { onRerun } = renderHeader(17, 5)
    await user.click(screen.getByRole('button', { name: 'Re-run evaluation' }))
    expect(onRerun).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '5 skipped' })).toBeNull()
  })

  it('renders nav links in order with their hrefs', () => {
    renderHeader(17, 5)
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Queue', 'Reviewed', 'Data quality', 'Rule'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/',
      '/reviewed',
      '/data-quality',
      '/rule',
    ])
  })

  it('marks only the current route link with aria-current="page"', () => {
    renderHeader(17, 5, '/reviewed')
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('aria-current'))).toEqual([
      null,
      'page',
      null,
      null,
    ])
  })

  it('has no aria-current link on an order detail route', () => {
    renderHeader(17, 5, '/orders/A-1')
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    expect(links.every((l) => l.getAttribute('aria-current') === null)).toBe(true)
  })
})

describe('Header: Sign out link (API mode)', () => {
  function renderWithSignOut(signOutHref?: string, onSignOut?: () => void) {
    return render(
      <MemoryRouter>
        <Header
          checkedCount={1}
          skippedCount={0}
          evaluationTime="2026-11-20T12:00:00Z"
          onRerun={() => {}}
          signOutHref={signOutHref}
          onSignOut={onSignOut}
        />
      </MemoryRouter>,
    )
  }

  it('shows a Sign out link only when the prop is set', () => {
    const { unmount } = renderWithSignOut()
    expect(screen.queryByRole('link', { name: 'Sign out' })).toBeNull()
    unmount()
    renderWithSignOut('https://example.test/logout?client_id=c')
    expect(screen.getByRole('link', { name: 'Sign out' }).getAttribute('href')).toBe(
      'https://example.test/logout?client_id=c',
    )
  })

  it('adds no other element to the header', () => {
    const { container, unmount } = renderWithSignOut()
    const without = container.querySelector('header')?.children.length ?? 0
    unmount()
    const withLink = renderWithSignOut('https://example.test/logout')
    const header = withLink.container.querySelector('header')
    expect(header?.children.length).toBe(without + 1)
    expect(header?.lastElementChild?.tagName).toBe('A')
  })

  it('calls the sign-out handler when selected', async () => {
    const onSignOut = vi.fn()
    renderWithSignOut('#', onSignOut)
    await userEvent.setup().click(screen.getByRole('link', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
