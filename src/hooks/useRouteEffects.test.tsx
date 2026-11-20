// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRouteEffects } from './useRouteEffects.ts'

afterEach(cleanup)

function Page({ pathname, title, withH1 = true }: { pathname: string; title: string; withH1?: boolean }) {
  useRouteEffects(pathname)
  return <main>{withH1 ? <h1 tabIndex={-1}>{title}</h1> : <p>none</p>}</main>
}

describe('useRouteEffects', () => {
  it('sets the title on first load without moving focus (StrictMode)', () => {
    document.title = ''
    render(
      <StrictMode>
        <Page pathname="/" title="Queue" />
      </StrictMode>,
    )
    expect(document.title).toBe('Queue - Fulfillment Watch')
    expect(document.activeElement).toBe(document.body)
  })

  it('sets title and focuses the h1 when the pathname changes', () => {
    const { rerender } = render(
      <StrictMode>
        <Page pathname="/" title="Queue" />
      </StrictMode>,
    )
    rerender(
      <StrictMode>
        <Page pathname="/rule" title="Rule" />
      </StrictMode>,
    )
    expect(document.title).toBe('Rule - Fulfillment Watch')
    expect(document.activeElement?.tagName).toBe('H1')
  })

  it('leaves title and focus alone when the pathname is unchanged', () => {
    const { rerender } = render(<Page pathname="/" title="Queue" />)
    rerender(<Page pathname="/" title="Other" />)
    expect(document.title).toBe('Queue - Fulfillment Watch')
    expect(document.activeElement).toBe(document.body)
  })

  it('does nothing when there is no h1', () => {
    document.title = 'keep'
    render(<Page pathname="/" title="x" withH1={false} />)
    expect(document.title).toBe('keep')
  })
})
