import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EVALUATION_TIME, RULE_ID } from '../../src/config.ts'
import { evaluate } from '../../src/rules/paidUnfulfilled.ts'
import { handleRequest } from '../handleRequest.ts'
import { bodyOf, createHarness, getQueueEvent, rawDatasetArb } from '../handlerTestSupport.ts'

// Feature: stalled-orders-aws, Property 1: Queue response equals the Stage A evaluator
describe('Property 1: Queue response equals the Stage A evaluator', () => {
  it('returns the same rows, order, checked count and skipped records as evaluate, twice over', async () => {
    await fc.assert(
      fc.asyncProperty(
        rawDatasetArb,
        fc.constantFrom('1', '12', '24', '24.5', '48', '100'),
        async (dataset, threshold) => {
          const h = createHarness(dataset, {
            env: { EVALUATION_TIME, FULFILLMENT_THRESHOLD_HOURS: threshold },
          })
          const expected = evaluate(dataset, EVALUATION_TIME, Number(threshold))
          const first = await handleRequest(getQueueEvent(), h.deps)
          const second = await handleRequest(getQueueEvent(), h.deps)
          expect(first.statusCode).toBe(200)
          expect(second.body).toBe(first.body)
          const body = bodyOf(first)
          const rows = body.rows as { order: unknown; elapsedMs: number; review: unknown }[]
          expect(rows.map((r) => ({ order: r.order, elapsedMs: r.elapsedMs }))).toEqual(
            JSON.parse(JSON.stringify(expected.flagged)),
          )
          expect(rows.every((r) => r.review === null)).toBe(true)
          expect(body.skipped).toEqual(JSON.parse(JSON.stringify(expected.skipped)))
          expect(body.checkedCount).toBe(expected.checkedCount)
          expect(body.evaluationTime).toBe(EVALUATION_TIME)
          expect(body.thresholdHours).toBe(Number(threshold))
          expect(body.ruleId).toBe(RULE_ID)
          const ids = rows.map((r) => (r.order as { orderId: string }).orderId)
          expect(new Set(ids).size).toBe(ids.length)
        },
      ),
      { numRuns: 150 },
    )
  })
})
