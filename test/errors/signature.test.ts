import { expect, test } from 'vitest'

import { BaseError } from '../../src/errors/base.js'
import { InvalidSignatureError } from '../../src/errors/signature.js'
import { version } from '../../src/errors/version.js'

test('InvalidSignatureError', () => {
  const err = new InvalidSignatureError(
    'Invalid recovery value: 5. Expected 0, 1, 27 or 28.',
  )
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('InvalidSignatureError')
  expect(err.shortMessage).toBe(
    'Invalid recovery value: 5. Expected 0, 1, 27 or 28.',
  )
  expect(err.message).toBe(`Invalid recovery value: 5. Expected 0, 1, 27 or 28.

Version: @tronweb3/tviem@${version}`)
})

test('InvalidSignatureError passes cause and metaMessages through', () => {
  const cause = new Error('boom')
  const err = new InvalidSignatureError('Invalid signature.', {
    cause,
    metaMessages: ['meta'],
  })
  expect(err.cause).toBe(cause)
  expect(err.details).toBe('boom')
  expect(err.metaMessages).toEqual(['meta'])
})
