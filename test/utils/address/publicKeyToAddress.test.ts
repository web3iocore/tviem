import { describe, expect, test } from 'vitest'
import { BaseError } from '../../../src/errors/base.js'
import { InvalidParameterError } from '../../../src/errors/parameter.js'
import { publicKeyToAddress } from '../../../src/utils/address/publicKeyToAddress.js'
import { hexToBytes } from '../../../src/utils/encoding/toBytes.js'

// §2.1 V1 (pk = 1, the "famous private key").
const v1PublicKey =
  '0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8' as const
const v1Address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'

describe('publicKeyToAddress', () => {
  test('§2.1: publicKeyToAddress(V1.pubkey) === TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC', () => {
    expect(publicKeyToAddress(v1PublicKey)).toBe(v1Address)
  })

  test('accepts the 64-byte body (04 prefix stripped)', () => {
    expect(publicKeyToAddress(`0x${v1PublicKey.slice(4)}`)).toBe(v1Address)
  })

  test('accepts Uint8Array input (65 and 64 bytes)', () => {
    expect(publicKeyToAddress(hexToBytes(v1PublicKey))).toBe(v1Address)
    expect(publicKeyToAddress(hexToBytes(v1PublicKey).subarray(1))).toBe(
      v1Address,
    )
  })

  test('throws on invalid public key length', () => {
    expect(() => publicKeyToAddress('0x0479be66')).toThrow(BaseError)
    expect(() => publicKeyToAddress(new Uint8Array(63))).toThrow(
      'Invalid public key length: 63 bytes.',
    )
  })

  test('throws on a 65-byte key without the 04 prefix', () => {
    const bytes = hexToBytes(v1PublicKey)
    bytes[0] = 0x02
    expect(() => publicKeyToAddress(bytes)).toThrow(
      'must start with the `0x04` prefix byte',
    )
  })
})

describe('publicKeyToAddress error classes', () => {
  function errorOf(fn: () => unknown): unknown {
    try {
      fn()
    } catch (error) {
      return error
    }
    return undefined
  }

  test('a wrong-length key throws an InvalidParameterError', () => {
    const error = errorOf(() => publicKeyToAddress(new Uint8Array(63)))
    expect(error).toBeInstanceOf(InvalidParameterError)
    expect(error).toMatchObject({
      name: 'InvalidParameterError',
      param: 'publicKey',
      reason: 'format',
    })
  })

  test('a 65-byte key without the 04 prefix throws an InvalidParameterError', () => {
    const bytes = hexToBytes(v1PublicKey)
    bytes[0] = 0x02
    const error = errorOf(() => publicKeyToAddress(bytes))
    expect(error).toBeInstanceOf(InvalidParameterError)
    expect(error).toMatchObject({
      name: 'InvalidParameterError',
      param: 'publicKey',
      reason: 'format',
    })
  })

  test.each([
    ['a point off the curve', `${v1PublicKey.slice(4, -2)}b9`],
    ['zero coordinates', '00'.repeat(64)],
    [
      'an x coordinate outside the field',
      // x = p + 1 and this y coordinate would be valid at x = 1.
      'fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc30' +
        '4218f20ae6c646b363db68605822fb14264ca8d2587fdd6fbc750d587e76a7ee',
    ],
  ])('%s throws an InvalidParameterError in all supported forms', (_, body) => {
    const prefixed = `0x04${body}` as const
    const coordinates = `0x${body}` as const
    for (const key of [
      prefixed,
      coordinates,
      hexToBytes(prefixed),
      hexToBytes(coordinates),
    ]) {
      const error = errorOf(() => publicKeyToAddress(key))
      expect(error).toBeInstanceOf(InvalidParameterError)
      expect(error).toMatchObject({
        param: 'publicKey',
        reason: 'format',
        shortMessage:
          'Invalid public key. Expected a valid secp256k1 curve point.',
      })
    }
  })
})
