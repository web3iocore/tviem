import { describe, expect, test } from 'vitest'

import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js'
import { InvalidAddressError } from '../../src/errors/address.js'
import { parseAccount } from '../../src/types/account.js'
import { addressToHex } from '../../src/utils/address/addressToHex.js'

// Only pk=1 is a permitted trivial private key.
const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'
const pk1Address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
const pk1Hex41 = '417e5f4552091a69125d5dfcb7b8c2659029395bdf'

describe('parseAccount', () => {
  test('fixture: the 41-hex form is the same address', () => {
    expect(addressToHex(pk1Address)).toBe(pk1Hex41)
    expect(privateKeyToAccount(pk1).address).toBe(pk1Address)
  })

  test('a Base58Check T-address becomes a json-rpc account', () => {
    const account = parseAccount(pk1Address)
    expect(account).toEqual({ address: pk1Address, type: 'json-rpc' })
    expect(Object.keys(account).sort()).toEqual(['address', 'type'])
  })

  test('each call returns a fresh plain object', () => {
    const a = parseAccount(pk1Address)
    const b = parseAccount(pk1Address)
    expect(a).not.toBe(b)
    expect(Object.getPrototypeOf(a)).toBe(Object.prototype)
  })

  test('an account object passes through by identity', () => {
    const local = privateKeyToAccount(pk1)
    expect(parseAccount(local)).toBe(local)
    const jsonRpc = { address: pk1Address, type: 'json-rpc' } as const
    expect(parseAccount(jsonRpc)).toBe(jsonRpc)
  })

  // A bad-checksum T-address: last character changed.
  const badChecksum = `${pk1Address.slice(0, -1)}D`

  const invalid: [string, string][] = [
    ['a 41-prefixed hex address', pk1Hex41],
    ['a 0x EVM address', `0x${pk1Hex41.slice(2)}`],
    ['a 0x 32-byte private key', pk1],
    ['a bare 64-hex private key', pk1.slice(2)],
    ['an empty string', ''],
    ['a T-address with a bad checksum', badChecksum],
  ]

  for (const [name, value] of invalid)
    test(`${name} throws InvalidAddressError without echoing the input`, () => {
      let caught: unknown
      try {
        parseAccount(value as never)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(InvalidAddressError)
      const { message, shortMessage } = caught as InvalidAddressError
      expect(shortMessage).toBe('Address is invalid.')
      if (value) {
        expect(message).not.toContain(value)
        expect(message).not.toContain(value.slice(0, 4))
      }
      expect(message).toContain('privateKeyToAccount')
    })
})
