import fc from 'fast-check'
import { describe, it } from 'vitest'
import { isLead, LEAD_GROUP } from './claims.ts'

// Feature: stalled-orders-aws, Property 3: Group membership decides access
const groupName = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/)
const groupList = fc.array(groupName, { maxLength: 5 })

type Shape = 'array' | 'brackets-space' | 'brackets-comma' | 'json' | 'single' | 'absent'
const shapes: Shape[] = ['array', 'brackets-space', 'brackets-comma', 'json', 'single', 'absent']

function encode(groups: string[], shape: Shape): { claim: unknown; effective: string[] } {
  switch (shape) {
    case 'array':
      return { claim: groups, effective: groups }
    case 'brackets-space':
      return { claim: `[${groups.join(' ')}]`, effective: groups }
    case 'brackets-comma':
      return { claim: `[${groups.join(', ')}]`, effective: groups }
    case 'json':
      return { claim: JSON.stringify(groups), effective: groups }
    case 'single': {
      const first = groups[0]
      return first === undefined ? { claim: '', effective: [] } : { claim: first, effective: [first] }
    }
    case 'absent':
      return { claim: undefined, effective: [] }
  }
}

describe('Property 3: Group membership decides access', () => {
  it('isLead is true if and only if the groups contain fulfillment-lead', () => {
    fc.assert(
      fc.property(
        groupList,
        fc.boolean(),
        fc.constantFrom(...shapes),
        fc.dictionary(fc.stringMatching(/^x-[a-z]{1,6}$/), fc.string(), { maxKeys: 3 }),
        (base, addLead, shape, extra) => {
          const groups = addLead ? [...base, LEAD_GROUP] : base.filter((g) => g !== LEAD_GROUP)
          const { claim, effective } = encode(groups, shape)
          const claims: Record<string, unknown> = { ...extra }
          if (claim !== undefined) claims['cognito:groups'] = claim
          return isLead(claims) === effective.includes(LEAD_GROUP)
        },
      ),
      { numRuns: 200 },
    )
  })
})
