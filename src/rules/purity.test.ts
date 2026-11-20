import { describe, expect, it } from 'vitest'

// Source text of the pure modules: src/rules/*.ts (no tests) and src/format.ts.
const sources = import.meta.glob(['./*.ts', '!./*.test.ts', '../format.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const FORBIDDEN: readonly [string, RegExp][] = [
  ['import from react', /from\s+['"]react['"]/],
  ['import from react-dom', /from\s+['"]react-dom(\/[^'"]*)?['"]/],
  ['import from storage', /from\s+['"]\.\.\/storage/],
  ['import from components', /from\s+['"]\.\.\/components/],
  ['Date.now', /Date\.now/],
  ['new Date() with no arguments', /new Date\(\s*\)/],
  ['localStorage', /localStorage/],
  ['document', /\bdocument\b/],
]

describe('pure modules stay pure', () => {
  it('finds the evaluator modules', () => {
    const names = Object.keys(sources)
    for (const expected of ['queue', 'timestamps', 'validateOrder', 'paidUnfulfilled']) {
      expect(names).toContain(`./${expected}.ts`)
    }
    expect(names.some((n) => n.endsWith('.test.ts'))).toBe(false)
  })

  for (const [name, rule] of FORBIDDEN) {
    it(`has no ${name}`, () => {
      const offenders = Object.entries(sources)
        .filter(([, text]) => rule.test(text))
        .map(([file]) => file)
      expect(offenders).toEqual([])
    })
  }
})
