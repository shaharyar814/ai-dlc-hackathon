import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const SRC = join(__dirname, '..')

function findCss(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? findCss(p) : p.endsWith('.css') ? [p] : []
  })
}

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const allCss = findCss(SRC)
const nonToken = allCss.filter((f) => basename(f) !== 'tokens.css')
const tokensCss = strip(readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8'))

const NAMED = [
  'white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'orange', 'yellow',
  'purple', 'pink', 'brown', 'silver', 'navy', 'teal', 'maroon', 'lime', 'cyan',
  'magenta', 'gold', 'aqua', 'olive', 'fuchsia',
]

function declarationValues(css: string): string[] {
  const out: string[] = []
  const re = /(?:^|[;{\s])(--?[a-z][\w-]*)\s*:\s*([^;{}]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) out.push(m[2])
  return out
}

function tokens(): Record<string, string> {
  const t: Record<string, string> = {}
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tokensCss))) t[m[1]] = m[2].trim()
  return t
}
const T = tokens()

describe('CSS literals (Req 11.1, 11.2)', () => {
  it('finds css files besides tokens.css', () => {
    expect(nonToken.length).toBeGreaterThan(0)
  })
  for (const file of nonToken) {
    it(`${file.slice(SRC.length + 1)} has no color or px literals`, () => {
      const css = strip(readFileSync(file, 'utf8'))
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(css).not.toMatch(/\brgba?\(/i)
      expect(css).not.toMatch(/\bhsla?\(/i)
      expect(css).not.toMatch(/\d(?:\.\d+)?px\b/)
      const named = new RegExp(`(?<![\\w-])(${NAMED.join('|')})(?![\\w-])`, 'i')
      for (const v of declarationValues(css)) expect(v).not.toMatch(named)
    })
  }
})

describe('tokens.css (Req 11.6)', () => {
  it('defines required tokens', () => {
    const required = [
      '--color-page', '--color-card', '--color-text', '--color-text-muted',
      '--color-border', '--color-accent', '--color-accent-contrast', '--color-accent-bg',
      '--color-reviewed', '--color-reviewed-bg', '--color-late', '--color-late-bg',
      '--color-very-late', '--color-very-late-bg', '--space-1', '--space-4',
      '--radius-md', '--font-size-body', '--size-target', '--focus-ring-width',
    ]
    for (const r of required) expect(T[r], r).toBeDefined()
  })
})

describe('reduced motion (Req 11.10)', () => {
  it('index.css has a prefers-reduced-motion: reduce block', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/)
  })
})

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('contrast (Req 11.7)', () => {
  const pairs: [string, string][] = [
    ['text', 'page'], ['text', 'card'], ['text-muted', 'card'], ['text-muted', 'page'],
    ['accent-contrast', 'accent'], ['accent', 'accent-bg'], ['accent', 'card'],
    ['reviewed', 'reviewed-bg'], ['late', 'late-bg'], ['very-late', 'very-late-bg'],
  ]
  for (const [fg, bg] of pairs) {
    it(`${fg} on ${bg} >= 4.5:1`, () => {
      const f = T[`--color-${fg}`]
      const b = T[`--color-${bg}`]
      expect(f).toMatch(/^#[0-9a-f]{6}$/i)
      expect(b).toMatch(/^#[0-9a-f]{6}$/i)
      expect(contrast(f, b)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('sizes (Req 12.4)', () => {
  const px = (v: string) => (v.endsWith('rem') ? parseFloat(v) * 16 : parseFloat(v))
  it('body font size >= 16px', () => {
    expect(px(T['--font-size-body'])).toBeGreaterThanOrEqual(16)
  })
  it('--size-target >= 40px', () => {
    expect(px(T['--size-target'])).toBeGreaterThanOrEqual(40)
  })
})
