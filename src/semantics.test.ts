import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const tsxFiles = walk(SRC).filter(
  (f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'),
)

describe('static semantics scan', () => {
  it('finds source files to scan', () => {
    expect(tsxFiles.length).toBeGreaterThan(0)
  })

  it('has no onClick on div or span (Req 11.8)', () => {
    const offenders: string[] = []
    for (const f of tsxFiles) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/<(div|span)\b[^>]*?\bonClick\s*=/gs)) {
        offenders.push(`${f}: <${m[1]}> with onClick`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every inline svg is aria-hidden or has a text alternative (Req 12.7)', () => {
    const offenders: string[] = []
    for (const f of tsxFiles) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/<svg\b([\s\S]*?)>([\s\S]*?)<\/svg/g)) {
        const attrs = m[1]
        const body = m[2]
        const hidden = /aria-hidden\s*=\s*(\{?\s*["']true["']|\{true\})/.test(attrs)
        const labelled =
          /role\s*=\s*["']img["']/.test(attrs) &&
          /aria-label(ledby)?\s*=/.test(attrs)
        const titled = /<title\b/.test(body)
        // Spread props (e.g. Icon.tsx `{...a11y}`): the file must define both
        // the hidden variant and the labelled variant of the spread object.
        const spread = /\{\.\.\.(\w+)\}/.exec(attrs)
        let viaSpread = false
        if (spread) {
          const def = new RegExp(`const\\s+${spread[1]}\\b[\\s\\S]*?;?\\n\\s*return`).exec(src)
          const text = def ? def[0] : ''
          viaSpread =
            /'aria-hidden'\s*:\s*'true'/.test(text) &&
            /role\s*:\s*'img'/.test(text) &&
            /'aria-label'\s*:/.test(text)
        }
        if (!(hidden || labelled || titled || viaSpread)) {
          offenders.push(`${f}: <svg> lacks aria-hidden or text alternative`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('package.json pins react-router-dom and has no UI library or CSS framework (Req 1.7, 12.8)', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const deps: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }
    const router = deps['react-router-dom']
    expect(router).toBeDefined()
    expect(router).not.toMatch(/[\^~]/)

    const banned = [
      /^@mui\//, /^@chakra-ui\//, /^@mantine\//, /^antd$/, /^@ant-design\//,
      /^react-bootstrap$/, /^bootstrap$/, /^@radix-ui\//, /^@headlessui\//,
      /^semantic-ui/, /^@blueprintjs\//, /^@fluentui\//, /^primereact$/,
      /^styled-components$/, /^@emotion\//, /^tailwindcss$/, /^@tailwindcss\//,
      /^bulma$/, /^foundation-sites$/, /^daisyui$/, /^@shadcn/, /^react-aria/,
      /^unocss$/, /^windicss$/,
    ]
    const found = Object.keys(deps).filter((n) => banned.some((re) => re.test(n)))
    expect(found).toEqual([])
  })
})
