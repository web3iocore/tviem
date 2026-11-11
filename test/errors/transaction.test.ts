// New test file for @tronweb3/tviem: constructibility checks for the
// transaction error classes.
import { expect, test } from 'vitest'

import { BaseError } from '../../src/errors/base.js'
import {
  InvalidBlockHeaderError,
  PermissionError,
  TransactionIntegrityError,
  UnknownContractTypeError,
} from '../../src/errors/transaction.js'
import { version } from '../../src/errors/version.js'

test('UnknownContractTypeError: type URL with payload', () => {
  const error = new UnknownContractTypeError({
    type: 'type.googleapis.com/protocol.FooBarContract',
    value: 'deadbeef',
  })
  expect(error).toBeInstanceOf(BaseError)
  expect(error.name).toBe('UnknownContractTypeError')
  expect(error.type).toBe('type.googleapis.com/protocol.FooBarContract')
  expect(error.value).toBe('deadbeef')
  expect(error.shortMessage).toBe(
    'Contract type "type.googleapis.com/protocol.FooBarContract" is not supported.',
  )
  // The raw payload is preserved on the rendered message for inspection.
  expect(error.message).toContain('Any.value (hex): deadbeef')
})

test('UnknownContractTypeError: numeric type without payload', () => {
  const error = new UnknownContractTypeError({ type: 999 })
  expect(error).toBeInstanceOf(BaseError)
  expect(error.type).toBe(999)
  expect(error.value).toBeUndefined()
  expect(error.shortMessage).toBe('Contract type 999 is not supported.')
  expect(error.message).not.toContain('Any.value')
})

test('InvalidBlockHeaderError', () => {
  const error = new InvalidBlockHeaderError(
    'Cannot derive TaPoS reference fields from an incomplete block: a positive number, a positive timestamp and a 32-byte blockID are required.',
  )
  expect(error).toBeInstanceOf(BaseError)
  expect(error.name).toBe('InvalidBlockHeaderError')
  expect(
    error.message,
  ).toBe(`Cannot derive TaPoS reference fields from an incomplete block: a positive number, a positive timestamp and a 32-byte blockID are required.

Version: @tronweb3/tviem@${version}`)
})

test('InvalidBlockHeaderError passes cause and metaMessages through', () => {
  const cause = new Error('boom')
  const error = new InvalidBlockHeaderError('Incomplete block.', {
    cause,
    metaMessages: ['meta'],
  })
  expect(error.cause).toBe(cause)
  expect(error.details).toBe('boom')
  expect(error.metaMessages).toEqual(['meta'])
})

test('PermissionError carries permissionId', () => {
  const error = new PermissionError(
    'Permission id mismatch: the transaction is bound to permission 2, but 3 was supplied.',
    { permissionId: 3 },
  )
  expect(error).toBeInstanceOf(BaseError)
  expect(error.name).toBe('PermissionError')
  expect(error.permissionId).toBe(3)
  expect(
    error.message,
  ).toBe(`Permission id mismatch: the transaction is bound to permission 2, but 3 was supplied.

Version: @tronweb3/tviem@${version}`)
})

test('PermissionError without a permissionId, with cause and metaMessages', () => {
  expect(new PermissionError('x').permissionId).toBeUndefined()
  const cause = new Error('boom')
  const error = new PermissionError('x', { cause, metaMessages: ['meta'] })
  expect(error.name).toBe('PermissionError')
  expect(error.permissionId).toBeUndefined()
  expect(error.cause).toBe(cause)
  expect(error.details).toBe('boom')
  expect(error.metaMessages).toEqual(['meta'])
})

test('TransactionIntegrityError carries field', () => {
  const error = new TransactionIntegrityError(
    'The transaction has no readable owner_address.',
    { field: 'owner_address' },
  )
  expect(error).toBeInstanceOf(BaseError)
  expect(error.name).toBe('TransactionIntegrityError')
  expect(error.field).toBe('owner_address')
  expect(error.message).toBe(`The transaction has no readable owner_address.

Version: @tronweb3/tviem@${version}`)
})

test('TransactionIntegrityError without a field, with cause and metaMessages', () => {
  const plain = new TransactionIntegrityError(
    'The transaction failed its integrity check (txCheck).',
  )
  expect(plain.name).toBe('TransactionIntegrityError')
  expect(plain.field).toBeUndefined()
  expect(plain.shortMessage).toBe(
    'The transaction failed its integrity check (txCheck).',
  )
  const cause = new Error('boom')
  const error = new TransactionIntegrityError('x', {
    cause,
    metaMessages: ['meta'],
  })
  expect(error.cause).toBe(cause)
  expect(error.details).toBe('boom')
  expect(error.metaMessages).toEqual(['meta'])
})
