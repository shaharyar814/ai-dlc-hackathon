export type RouteMatch =
  | { kind: 'queue-open' }
  | { kind: 'queue-reviewed' }
  | { kind: 'order'; orderId: string }
  | { kind: 'data-quality' }
  | { kind: 'rule' }
  | { kind: 'not-found' }

export type NavKey = 'queue' | 'reviewed' | 'data-quality' | 'rule'

export const NAV_ITEMS: readonly { key: NavKey; label: string; to: string }[] = [
  { key: 'queue', label: 'Queue', to: '/' },
  { key: 'reviewed', label: 'Reviewed', to: '/reviewed' },
  { key: 'data-quality', label: 'Data quality', to: '/data-quality' },
  { key: 'rule', label: 'Rule', to: '/rule' },
]

const ORDER_PREFIX = '/orders/'

export function resolveRoute(pathname: string): RouteMatch {
  switch (pathname) {
    case '':
    case '/':
      return { kind: 'queue-open' }
    case '/reviewed':
      return { kind: 'queue-reviewed' }
    case '/data-quality':
      return { kind: 'data-quality' }
    case '/rule':
      return { kind: 'rule' }
  }
  if (pathname.startsWith(ORDER_PREFIX)) {
    const segment = pathname.slice(ORDER_PREFIX.length)
    if (segment !== '' && !segment.includes('/')) {
      try {
        return { kind: 'order', orderId: decodeURIComponent(segment) }
      } catch {
        return { kind: 'not-found' }
      }
    }
  }
  return { kind: 'not-found' }
}

export function navCurrent(match: RouteMatch): NavKey | null {
  switch (match.kind) {
    case 'queue-open':
      return 'queue'
    case 'queue-reviewed':
      return 'reviewed'
    case 'data-quality':
      return 'data-quality'
    case 'rule':
      return 'rule'
    default:
      return null
  }
}

export function orderPath(orderId: string): string {
  return ORDER_PREFIX + encodeURIComponent(orderId)
}
