import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { navCurrent, orderPath, resolveRoute, type NavKey, type RouteMatch } from './routes'

const RUNS = { numRuns: 100 }

// Independent oracle for Property 1.
function expected(p: string): RouteMatch {
  if (p === '' || p === '/') return { kind: 'queue-open' }
  if (p === '/reviewed') return { kind: 'queue-reviewed' }
  if (p === '/data-quality') return { kind: 'data-quality' }
  if (p === '/rule') return { kind: 'rule' }
  const m = /^\/orders\/([^/]+)$/.exec(p)
  if (m) {
    try {
      return { kind: 'order', orderId: decodeURIComponent(m[1]) }
    } catch {
      return { kind: 'not-found' }
    }
  }
  return { kind: 'not-found' }
}

const known = ['', '/', '/reviewed', '/data-quality', '/rule', '/orders', '/orders/']
const pathnames = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.string().map((s) => '/' + s),
  fc.string().map((s) => '/orders/' + s),
  fc.string({ unit: 'binary' }).map((s) => '/orders/' + s),
  fc.string({ unit: 'binary' }).map((s) => '/orders/' + encodeURIComponent(s)),
  fc.constantFrom(...known),
  fc.constantFrom(...known).map((s) => s + '/'),
  fc.constantFrom('/orders/a/b', '/orders/%', '/orders/%E0%A4%A', '/orders//'),
)

describe('routes properties', () => {
  it('Feature: ui-redesign, Property 1: Route resolution is total and exact', () => {
    fc.assert(
      fc.property(pathnames, (p) => {
        expect(resolveRoute(p)).toEqual(expected(p))
      }),
      RUNS,
    )
  })

  it('Feature: ui-redesign, Property 2: Order path round trip', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', minLength: 1 }), (id) => {
        expect(resolveRoute(orderPath(id))).toEqual({ kind: 'order', orderId: id })
      }),
      RUNS,
    )
  })

  it('Feature: ui-redesign, Property 3: Navigation current item', () => {
    const navFor: Partial<Record<RouteMatch['kind'], NavKey>> = {
      'queue-open': 'queue',
      'queue-reviewed': 'reviewed',
      'data-quality': 'data-quality',
      rule: 'rule',
    }
    fc.assert(
      fc.property(pathnames, (p) => {
        const match = resolveRoute(p)
        expect(navCurrent(match)).toBe(navFor[match.kind] ?? null)
        if (match.kind === 'order' || match.kind === 'not-found') {
          expect(navCurrent(match)).toBeNull()
        }
      }),
      RUNS,
    )
  })
})
