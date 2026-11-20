import { useEffect, useRef } from 'react'
import { documentTitle } from '../view/title.ts'

/**
 * Sets the document title from the page h1 and moves focus to the h1 when
 * the pathname changes. The first run only sets the title.
 */
export function useRouteEffects(pathname: string): void {
  const lastPathname = useRef<string | null>(null)
  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>('main h1')
    if (!h1) return
    document.title = documentTitle(h1.textContent ?? '')
    if (lastPathname.current !== null && lastPathname.current !== pathname) {
      h1.focus()
    }
    lastPathname.current = pathname
  }, [pathname])
}
