import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const text = readFileSync(new URL('./cost-estimate.md', import.meta.url), 'utf8')

function summaryRows(): { name: string; without: string; with: string }[] {
  const section = text.split('## Summary')[1].split('## Assumptions')[0]
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length === 3 && !/^-+$/.test(cells[1]) && cells[0] !== 'Service')
    .map(([name, without, withFree]) => ({ name, without, with: withFree }))
}

const cents = (value: string) => Math.round(Number(value) * 100)

describe('cost-estimate.md', () => {
  const rows = summaryRows()
  const total = rows.find((r) => r.name === 'Total')
  const services = rows.filter((r) => r.name !== 'Total')

  it('has a row for every service in the stack and a total row', () => {
    expect(total).toBeDefined()
    expect(services.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Cognito'),
        expect.stringContaining('API Gateway'),
        expect.stringContaining('Lambda'),
        expect.stringContaining('DynamoDB'),
        expect.stringContaining('S3'),
        expect.stringContaining('CloudFront'),
        expect.stringContaining('CloudWatch'),
      ]),
    )
  })

  it('shows every value with exactly two decimals', () => {
    for (const row of rows) {
      expect(row.without).toMatch(/^\d+\.\d{2}$/)
      expect(row.with).toMatch(/^\d+\.\d{2}$/)
    }
  })

  it('has totals equal to the sum of their column', () => {
    const sum = (pick: (r: (typeof services)[number]) => string) =>
      services.reduce((acc, r) => acc + cents(pick(r)), 0)
    expect(cents(total!.without)).toBe(sum((r) => r.without))
    expect(cents(total!.with)).toBe(sum((r) => r.with))
  })

  it('never costs more with the Free Tier than without it', () => {
    for (const row of services) expect(cents(row.with)).toBeLessThanOrEqual(cents(row.without))
  })

  it('names the date the pricing was read as YYYY-MM-DD', () => {
    expect(text).toMatch(/Read on \d{4}-\d{2}-\d{2}/)
    expect(text).toMatch(/\b\d{4}-\d{2}-\d{2}\b/)
  })
})
