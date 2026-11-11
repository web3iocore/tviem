import { expect, test } from 'vitest'

import { BaseError } from '../../src/errors/base.js'
import {
  InvalidParameterError,
  type InvalidParameterReason,
  MissingFieldError,
} from '../../src/errors/parameter.js'
import { version } from '../../src/errors/version.js'

test('InvalidParameterError carries param and reason', () => {
  const err = new InvalidParameterError(
    'Invalid timeout: -1. Expected a finite, non-negative number of milliseconds.',
    { param: 'timeout', reason: 'range' },
  )
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('InvalidParameterError')
  expect(err.param).toBe('timeout')
  expect(err.reason).toBe('range')
  expect(err.shortMessage).toBe(
    'Invalid timeout: -1. Expected a finite, non-negative number of milliseconds.',
  )
  expect(
    err.message,
  ).toBe(`Invalid timeout: -1. Expected a finite, non-negative number of milliseconds.

Version: @tronweb3/tviem@${version}`)
  expect(err.metaMessages).toBeUndefined()
  expect(err.cause).toBeUndefined()
})

test.each([
  'type',
  'format',
  'range',
  'unknown-field',
  'conflict',
] as const satisfies readonly InvalidParameterReason[])('InvalidParameterError accepts the reason %s', (reason) => {
  const err = new InvalidParameterError('x', { param: 'p', reason })
  expect(err.reason).toBe(reason)
  expect(err.name).toBe('InvalidParameterError')
})

test('InvalidParameterError passes cause, details and metaMessages through', () => {
  const cause = new Error('boom')
  const err = new InvalidParameterError('Invalid memo.', {
    cause,
    metaMessages: ['Expected hex.'],
    param: 'memo',
    reason: 'format',
  })
  expect(err.cause).toBe(cause)
  expect(err.details).toBe('boom')
  expect(err.metaMessages).toEqual(['Expected hex.'])
  expect(err.message).toBe(`Invalid memo.

Expected hex.

Details: boom
Version: @tronweb3/tviem@${version}`)
  expect(
    new InvalidParameterError('x', {
      details: 'more',
      param: 'p',
      reason: 'type',
    }).details,
  ).toBe('more')
})

test('MissingFieldError carries field', () => {
  const err = new MissingFieldError(
    'Missing required field "owner_address" (unset, or set to its proto3 default).',
    { field: 'owner_address' },
  )
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('MissingFieldError')
  expect(err.field).toBe('owner_address')
  expect(
    err.message,
  ).toBe(`Missing required field "owner_address" (unset, or set to its proto3 default).

Version: @tronweb3/tviem@${version}`)
})

test('MissingFieldError passes cause and metaMessages through', () => {
  const cause = new BaseError('inner', { details: 'inner details' })
  const err = new MissingFieldError('Missing x.', {
    cause,
    field: 'x',
    metaMessages: ['meta'],
  })
  expect(err.cause).toBe(cause)
  expect(err.details).toBe('inner details')
  expect(err.metaMessages).toEqual(['meta'])
  expect(err.walk()).toBe(cause)
})
