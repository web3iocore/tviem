import { expect, test } from 'vitest'

import { InvalidPrivateKeyError } from '../../src/errors/account.js'
import { BaseError } from '../../src/errors/base.js'

test.each([
  ['type', 'expected a string'],
  ['format', 'expected 64 hex characters, optionally 0x-prefixed'],
  ['range', 'outside the secp256k1 range [1, n - 1]'],
] as const)('InvalidPrivateKeyError (%s) names the reason only', (reason, text) => {
  const err = new InvalidPrivateKeyError({ reason })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('InvalidPrivateKeyError')
  expect(err.shortMessage.startsWith('Invalid private key:')).toBe(true)
  expect(err.shortMessage).toContain(text)
  expect(err.metaMessages ?? []).toEqual([])
})
