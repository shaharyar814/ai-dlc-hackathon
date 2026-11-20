import { describe, expect, it } from 'vitest'
import { isLead, readGroups, readUsername } from './claims.ts'
import { errorResponse, internalError, notFound, GENERIC_ERROR_MESSAGE } from './responses.ts'

describe('readGroups', () => {
  it('reads a real array', () => {
    expect(readGroups({ 'cognito:groups': ['a', 'fulfillment-lead'] })).toEqual(['a', 'fulfillment-lead'])
  })
  it('reads a bracketed string separated by spaces', () => {
    expect(readGroups({ 'cognito:groups': '[a fulfillment-lead]' })).toEqual(['a', 'fulfillment-lead'])
  })
  it('reads a bracketed string separated by commas', () => {
    expect(readGroups({ 'cognito:groups': '[a, fulfillment-lead]' })).toEqual(['a', 'fulfillment-lead'])
  })
  it('reads a JSON array string', () => {
    expect(readGroups({ 'cognito:groups': '["a","fulfillment-lead"]' })).toEqual(['a', 'fulfillment-lead'])
  })
  it('reads a single name', () => {
    expect(readGroups({ 'cognito:groups': 'fulfillment-lead' })).toEqual(['fulfillment-lead'])
  })
  it('gives an empty list for an absent claim', () => {
    expect(readGroups({})).toEqual([])
    expect(readGroups(undefined)).toEqual([])
  })
  it('gives an empty list for empty claims', () => {
    expect(readGroups({ 'cognito:groups': '' })).toEqual([])
    expect(readGroups({ 'cognito:groups': '[]' })).toEqual([])
    expect(readGroups({ 'cognito:groups': [] })).toEqual([])
  })
  it('gives an empty list for a value of the wrong type', () => {
    expect(readGroups({ 'cognito:groups': 5 })).toEqual([])
  })
})

describe('isLead', () => {
  it('is true only for the lead group', () => {
    expect(isLead({ 'cognito:groups': '[fulfillment-lead]' })).toBe(true)
    expect(isLead({ 'cognito:groups': '[fulfillment-leader]' })).toBe(false)
    expect(isLead({ 'cognito:groups': 'fulfillment-lead-2' })).toBe(false)
    expect(isLead({})).toBe(false)
  })
})

describe('readUsername', () => {
  it('returns a non-empty string', () => {
    expect(readUsername({ username: 'lead1' })).toBe('lead1')
  })
  it('returns null for absent, empty and non-string values', () => {
    expect(readUsername({})).toBeNull()
    expect(readUsername(undefined)).toBeNull()
    expect(readUsername({ username: '' })).toBeNull()
    expect(readUsername({ username: 7 })).toBeNull()
  })
})

describe('responses', () => {
  it('builds the error body shape', () => {
    const r = errorResponse(400, 'invalid_request', 'bad')
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body)).toEqual({ error: { code: 'invalid_request', message: 'bad' } })
  })
  it('uses one fixed 500 message', () => {
    expect(JSON.parse(internalError().body).error.message).toBe(GENERIC_ERROR_MESSAGE)
    expect(internalError().statusCode).toBe(500)
  })
  it('builds a 404', () => {
    expect(notFound().statusCode).toBe(404)
    expect(JSON.parse(notFound().body).error.code).toBe('not_found')
  })
})
