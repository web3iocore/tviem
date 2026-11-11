// New test file for @tronweb3/tviem: constructibility checks for the typed
// data error classes.
import { expect, test } from 'vitest'

import { BaseError } from '../../src/errors/base.js'
import {
  InvalidDomainError,
  InvalidPrimaryTypeError,
  InvalidStructTypeError,
  TypedDataError,
} from '../../src/errors/typedData.js'
import { version } from '../../src/errors/version.js'

test('InvalidDomainError', () => {
  const err = new InvalidDomainError({ domain: 'x' })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('InvalidDomainError')
  expect(err.shortMessage).toBe('Invalid domain ""x"".')
  expect(err.metaMessages).toEqual(['Must be a valid TIP-712 domain object.'])
})

test('InvalidPrimaryTypeError', () => {
  const err = new InvalidPrimaryTypeError({
    primaryType: 'Foo',
    types: { Mail: [] },
  })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('InvalidPrimaryTypeError')
  expect(err.shortMessage).toBe(
    'Invalid primary type `Foo` must be one of `["Mail"]`.',
  )
})

test('InvalidStructTypeError', () => {
  const err = new InvalidStructTypeError({ type: 'address' })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('InvalidStructTypeError')
  expect(err.shortMessage).toBe('Struct type "address" is invalid.')
})

test('TypedDataError carries path', () => {
  const err = new TypedDataError(
    'Missing Person.wallet value (declared as "address").',
    { path: 'Mail.to.wallet' },
  )
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('TypedDataError')
  expect(err.path).toBe('Mail.to.wallet')
  expect(err.message).toBe(`Missing Person.wallet value (declared as "address").

Version: @tronweb3/tviem@${version}`)
})

test('TypedDataError without a path', () => {
  const err = new TypedDataError('Unsupported TIP-712 field type: "bytes33".')
  expect(err.name).toBe('TypedDataError')
  expect(err.path).toBeUndefined()
  expect(err.shortMessage).toBe('Unsupported TIP-712 field type: "bytes33".')
})

test('TypedDataError passes cause and metaMessages through', () => {
  const cause = new Error('boom')
  const err = new TypedDataError('Invalid uint8 value.', {
    cause,
    metaMessages: ['meta'],
    path: 'Mail.count',
  })
  expect(err.cause).toBe(cause)
  expect(err.details).toBe('boom')
  expect(err.metaMessages).toEqual(['meta'])
  expect(err.path).toBe('Mail.count')
})
