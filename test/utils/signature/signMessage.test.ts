import { describe, expect, expectTypeOf, test } from 'vitest'

import type { Address } from '../../../src/types/address.js'
import type { Hex } from '../../../src/types/misc.js'
import { hashMessage } from '../../../src/utils/signature/hashMessage.js'
import {
  parseSignature,
  serializeSignature,
  sign,
} from '../../../src/utils/signature/sign.js'
import { signMessage } from '../../../src/utils/signature/signMessage.js'
import {
  recoverMessageAddress,
  verifyMessage,
} from '../../../src/utils/signature/verifyMessage.js'
import { loadSigMessageFixtures } from '../../fixtures/sig/loader.js'

// Canonical TIP-191 signature for the current package name (pk = 1). Verified
// byte-for-byte against TronWeb's `utils.message.signMessage`.
const pk1 =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as const
const message = 'sign this message'
const messageSignature =
  '9db3012a68317a97618479e218f3ca6849714071c2a8f07c160f1a804b114a8e166364cb124269a0edea614f50ae2acd0fd3a2c97ae89f45b4811427fb6136b71b'

const PRIVATE_KEY = {
  pk1,
  pk2: '0x0000000000000000000000000000000000000000000000000000000000000002',
} as const

describe('signMessage', () => {
  test('signs to the TronWeb-verified signature (…6b71b, v = 27)', () => {
    const signature = signMessage({ message, privateKey: pk1 })
    expect(signature).toBe(`0x${messageSignature}`)
    expect(signature.slice(2)).toBe(messageSignature)
    expect(signature.endsWith('6b71b')).toBe(true)
    expect(parseSignature(signature).v).toBe(27)
  })

  test('returns the 0x-prefixed 65-byte r ++ s ++ v Hex string', () => {
    const signature = signMessage({ message, privateKey: pk1 })
    expectTypeOf(signature).toEqualTypeOf<Hex>()
    expect(typeof signature).toBe('string')
    expect(signature.startsWith('0x')).toBe(true)
    expect(signature).toHaveLength(2 + 130)
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/)
  })

  test('equals sign({ hash: hashMessage(message), to: "hex" })', () => {
    expect(signMessage({ message, privateKey: pk1 })).toBe(
      sign({ hash: hashMessage(message), privateKey: pk1, to: 'hex' }),
    )
  })

  test('parses to the same components as sign({ hash: hashMessage(message) })', () => {
    const parsed = parseSignature(signMessage({ message, privateKey: pk1 }))
    const low = sign({ hash: hashMessage(message), privateKey: pk1 })
    expect(parsed).toStrictEqual(low)
    expect(parsed.r).toBe(low.r)
    expect(parsed.s).toBe(low.s)
    expect(parsed.v).toBe(low.v)
    expect(parsed.yParity).toBe(low.yParity)
    expect(parsed.r).toBe(`0x${messageSignature.slice(0, 64)}`)
    expect(parsed.s).toBe(`0x${messageSignature.slice(64, 128)}`)
    expect(parsed.yParity).toBe(0)
  })

  test('serializeSignature(parseSignature(sig)) round-trips', () => {
    const signature = signMessage({ message, privateKey: pk1 })
    expect(serializeSignature(parseSignature(signature))).toBe(signature)
    // The bare (transaction.signature[]) spelling parses to the same thing.
    expect(serializeSignature(parseSignature(signature.slice(2)))).toBe(
      signature,
    )
  })

  test('the returned Hex feeds verifyMessage / recoverMessageAddress directly', () => {
    const signature = signMessage({ message, privateKey: pk1 })
    const address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
    expect(recoverMessageAddress({ message, signature })).toBe(address)
    expect(verifyMessage({ message, signature, address })).toBe(true)
    expect(
      verifyMessage({
        message,
        signature,
        address: 'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K',
      }),
    ).toBe(false)
  })

  test('accepts a bare (no 0x) private key', () => {
    expect(signMessage({ message, privateKey: pk1.slice(2) }).slice(2)).toBe(
      messageSignature,
    )
  })

  test('is deterministic (RFC 6979) by default', () => {
    expect(signMessage({ message, privateKey: pk1 })).toBe(
      signMessage({ message, privateKey: pk1 }),
    )
  })

  test('extraEntropy randomizes the signature', () => {
    const randomized = signMessage({
      message,
      privateKey: pk1,
      extraEntropy: true,
    })
    expect(randomized.slice(2)).not.toBe(messageSignature)
    expect(randomized).toMatch(/^0x[0-9a-f]{130}$/)
    expect([27, 28]).toContain(parseSignature(randomized).v)
  })

  test('signs { raw } messages', () => {
    const signature = signMessage({
      message: { raw: '0x010203' },
      privateKey: pk1,
    })
    expect(signature.slice(2)).toHaveLength(130)
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/)
  })
})

// TronWeb compatibility: the Hex that signMessage returns is exactly what
// TronWeb's `signMessageV2` (and TronLink) hand back, so it must equal the
// gold-standard fixture strings byte-for-byte — prefix, case and v byte.
describe('signMessage · TronWeb fixture compatibility', () => {
  const fixtures = loadSigMessageFixtures()

  test('the fixture corpus is present', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fixture of fixtures) {
    const input =
      fixture.rawHex !== undefined
        ? { raw: fixture.rawHex as Hex }
        : (fixture.message as string)
    const privateKey = PRIVATE_KEY[fixture.privateKeyLabel]

    test(`${fixture.name}: returns the fixture signature string exactly`, () => {
      const signature = signMessage({ message: input, privateKey })
      expect(signature).toBe(fixture.signature)
      expect(hashMessage(input)).toBe(fixture.digest)
    })

    test(`${fixture.name}: parses to sign({ hash: digest }) and round-trips`, () => {
      const signature = signMessage({ message: input, privateKey })
      const parsed = parseSignature(signature)
      expect(parsed).toStrictEqual(
        sign({ hash: fixture.digest as Hex, privateKey }),
      )
      expect([27, 28]).toContain(parsed.v)
      expect(parsed.yParity).toBe(parsed.v - 27)
      expect(serializeSignature(parsed)).toBe(signature)
      expect(serializeSignature(parseSignature(fixture.signature))).toBe(
        fixture.signature,
      )
    })

    test(`${fixture.name}: verifies and recovers the fixture address`, () => {
      const signature = signMessage({ message: input, privateKey })
      expect(recoverMessageAddress({ message: input, signature })).toBe(
        fixture.address,
      )
      expect(
        verifyMessage({
          message: input,
          signature,
          address: fixture.address as Address,
        }),
      ).toBe(true)
    })
  }
})
