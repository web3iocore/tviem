import { describe, expect, test } from 'vitest'

import { BaseError } from '../../../src/errors/base.js'
import { InvalidHashError } from '../../../src/errors/data.js'
import { hexToBytes } from '../../../src/utils/encoding/toBytes.js'
import {
  parseSignature,
  serializeSignature,
  sign,
} from '../../../src/utils/signature/sign.js'

// §2.3 transaction signing (pk = 1).
const pk1 =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as const
const txId =
  '0x407ec75dad4545890e5788ef78555ecab9dc72d56df29da4ebbd508022bdbaba' as const
const txSignature =
  '4d6f1e54ea593e5118c2d1b3701a4cab4d5235a418e9e46dba8c5f033bc4af0f6c04a08241de23936dffdedc869eac45533f9479a6bf372a38382b168b65ae001c'

// §2.2 TIP-191 message digest for "hello @tronweb3/tviem" (pk = 1).
const messageDigest =
  '0x46971b5b1d980410d80acba57293e39e27ed19dd6ff1015a8ebd9f8e0cc4edd9' as const
const messageSignature =
  '9db3012a68317a97618479e218f3ca6849714071c2a8f07c160f1a804b114a8e166364cb124269a0edea614f50ae2acd0fd3a2c97ae89f45b4811427fb6136b71b'

describe('sign', () => {
  test('§2.3: signs the tx digest to the authoritative signature (…ae001c)', () => {
    const signature = sign({ hash: txId, privateKey: pk1 })
    const serialized = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    expect(serialized.slice(2)).toBe(txSignature)
    expect(serialized).toBe(`0x${txSignature}`)
    expect(serializeSignature(signature)).toBe(`0x${txSignature}`)
    expect(serialized.endsWith('001c')).toBe(true)
    expect(signature.v).toBe(28)
    expect(signature.yParity).toBe(1)
  })

  test('§2.2: signs the TIP-191 message digest (…6b71b, v = 27)', () => {
    const signature = sign({ hash: messageDigest, privateKey: pk1 })
    const serialized = sign({ hash: messageDigest, privateKey: pk1, to: 'hex' })
    expect(serialized.slice(2)).toBe(messageSignature)
    expect(serialized).toBe(`0x${messageSignature}`)
    expect(serializeSignature(signature)).toBe(`0x${messageSignature}`)
    expect(signature.v).toBe(27)
    expect(signature.yParity).toBe(0)
  })

  test('accepts a bytes digest and a bare (no 0x) private key', () => {
    const signature = sign({
      hash: hexToBytes(txId),
      privateKey: pk1.slice(2),
      to: 'hex',
    })
    expect(signature.slice(2)).toBe(txSignature)
  })

  test('is deterministic (RFC 6979) by default', () => {
    const a = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    const b = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    expect(a).toBe(b)
    expect(sign({ hash: txId, privateKey: pk1 })).toEqual(
      sign({ hash: txId, privateKey: pk1 }),
    )
  })

  test('extraEntropy changes the signature (proves the default is deterministic)', () => {
    const deterministic = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    const randomized = sign({ hash: txId, privateKey: pk1, extraEntropy: true })
    const randomizedHex = serializeSignature(randomized)
    expect(randomizedHex).not.toBe(deterministic)
    // Still a valid TRON-form signature (65 bytes = 130 bare hex chars).
    expect(randomizedHex.slice(2)).toHaveLength(130)
    expect([27, 28]).toContain(randomized.v)
    expect(randomized.yParity).toBe(randomized.v - 27)
  })

  test('accepts the advertised 0x-hex form of extraEntropy', () => {
    const deterministic = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    const salted = sign({
      hash: txId,
      privateKey: pk1,
      extraEntropy: '0xdeadbeef',
      to: 'hex',
    })
    expect(salted).not.toBe(deterministic)
    expect(salted.slice(2)).toHaveLength(130)
    // RFC 6979 with fixed extra entropy stays deterministic.
    const again = sign({
      hash: txId,
      privateKey: pk1,
      extraEntropy: '0xdeadbeef',
      to: 'hex',
    })
    expect(again).toBe(salted)
  })

  test('r/s components are 0x-prefixed 32-byte hex', () => {
    const signature = sign({ hash: txId, privateKey: pk1 })
    expect(signature.r).toBe(`0x${txSignature.slice(0, 64)}`)
    expect(signature.s).toBe(`0x${txSignature.slice(64, 128)}`)
  })

  test('the object form carries exactly r, s, v and yParity', () => {
    const signature = sign({ hash: txId, privateKey: pk1 })
    expect(Object.keys(signature).sort()).toEqual(['r', 's', 'v', 'yParity'])
    expect(signature).toEqual({
      r: `0x${txSignature.slice(0, 64)}`,
      s: `0x${txSignature.slice(64, 128)}`,
      v: 28,
      yParity: 1,
    })
    // The removed fields are gone at runtime too.
    expect(signature).not.toHaveProperty('hex')
    expect(signature).not.toHaveProperty('serialized')
    expect(signature).not.toHaveProperty('recovery')
  })

  test('throws on a non-32-byte hash', () => {
    expect(() => sign({ hash: '0xdeadbeef', privateKey: pk1 })).toThrow(
      InvalidHashError,
    )
    expect(() => sign({ hash: new Uint8Array(31), privateKey: pk1 })).toThrow(
      'got 31 bytes',
    )
  })
})

describe('sign: hash input validation', () => {
  const digest = txId.slice(2) // 64 hex characters

  test('accepts upper-case hex and a 32-byte array', () => {
    const expected = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    expect(
      sign({ hash: `0x${digest.toUpperCase()}`, privateKey: pk1, to: 'hex' }),
    ).toBe(expected)
    expect(sign({ hash: hexToBytes(txId), privateKey: pk1, to: 'hex' })).toBe(
      expected,
    )
  })

  test.each([
    ['63 hex characters', `0x${digest.slice(1)}`],
    ['65 hex characters', `0x${digest}0`],
    ['65 hex characters without a prefix', `${digest}0`],
    ['64 hex characters without a prefix', digest],
    ['a non-hex prefix', `zz${digest}`],
    ['a non-hex character', `0x${digest.slice(1)}g`],
    ['an upper-case prefix', `0X${digest}`],
  ])('rejects a string hash of %s', (_, hash) => {
    expect(() =>
      sign({ hash: hash as `0x${string}`, privateKey: pk1 }),
    ).toThrow(InvalidHashError)
  })

  test.each([31, 33, 0])('rejects a %i-byte array', (length) => {
    expect(() =>
      sign({ hash: new Uint8Array(length), privateKey: pk1 }),
    ).toThrow(InvalidHashError)
  })
})

describe('sign: extraEntropy input validation', () => {
  test.each([
    ['odd-length hex', '0xabc'],
    ['no 0x prefix', 'deadbeef'],
    ['empty hex', '0x'],
    ['non-hex characters', '0xzz'],
  ])('rejects %s', (_, extraEntropy) => {
    expect(() =>
      sign({
        hash: txId,
        privateKey: pk1,
        extraEntropy: extraEntropy as `0x${string}`,
      }),
    ).toThrow(/extraEntropy/)
  })

  test('accepts whole-byte hex, bytes and booleans', () => {
    for (const extraEntropy of [
      '0xab',
      '0xdeadbeef',
      new Uint8Array(4),
      true,
      false,
    ] as const)
      expect(
        sign({ hash: txId, privateKey: pk1, extraEntropy, to: 'hex' }),
      ).toMatch(/^0x[0-9a-f]{130}$/)
  })
})

describe('serializeSignature', () => {
  test('composes r ++ s ++ v into the 0x wire form', () => {
    const r = `0x${txSignature.slice(0, 64)}` as const
    const s = `0x${txSignature.slice(64, 128)}` as const
    expect(serializeSignature({ r, s, v: 28 })).toBe(`0x${txSignature}`)
  })

  test('round-trips with sign', () => {
    const { r, s, v } = sign({ hash: txId, privateKey: pk1 })
    const serialized = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    expect(serializeSignature({ r, s, v })).toBe(serialized)
    // The whole object form is a valid input as well.
    expect(serializeSignature(sign({ hash: txId, privateKey: pk1 }))).toBe(
      serialized,
    )
  })
})

// serializeSignature enforces what its JSDoc already promised: r/s exactly
// 32 bytes of hex, v in {27, 28}, output exactly 65 bytes. Short components
// are rejected rather than numerically normalized — the same stance the repo
// took when it removed private-key zero-padding.
describe('serializeSignature input validation', () => {
  const r = `0x${'11'.repeat(32)}` as const
  const s = `0x${'22'.repeat(32)}` as const

  test('rejects a short r', () => {
    expect(() => serializeSignature({ r: '0x01', s, v: 27 })).toThrow(
      'Invalid signature r',
    )
  })
  test('rejects a non-hex s', () => {
    expect(() =>
      serializeSignature({ r, s: `0x${'zz'.repeat(32)}` as never, v: 27 }),
    ).toThrow('Invalid signature s')
  })
  test('rejects v outside {27, 28}', () => {
    expect(() => serializeSignature({ r, s, v: 1 })).toThrow('Invalid v')
    expect(() => serializeSignature({ r, s, v: 29 })).toThrow('Invalid v')
  })
  test('valid components serialize to exactly 65 bytes', () => {
    const out = serializeSignature({ r, s, v: 28 })
    expect(out).toBe(`0x${'11'.repeat(32)}${'22'.repeat(32)}1c`)
  })
})

describe('sign: `to` selects the output form', () => {
  const object = sign({ hash: txId, privateKey: pk1 })

  test("'object' is the default", () => {
    expect(sign({ hash: txId, privateKey: pk1, to: 'object' })).toEqual(object)
  })

  test("'hex' returns the 0x-prefixed 65-byte signature", () => {
    expect(sign({ hash: txId, privateKey: pk1, to: 'hex' })).toBe(
      `0x${txSignature}`,
    )
  })

  test("'bytes' returns the 65 raw bytes", () => {
    const bytes = sign({ hash: txId, privateKey: pk1, to: 'bytes' })
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes).toHaveLength(65)
    expect(bytes).toEqual(hexToBytes(`0x${txSignature}`))
  })

  test('all three forms agree', () => {
    const hex = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    expect(serializeSignature(object)).toBe(hex)
    expect(sign({ hash: txId, privateKey: pk1, to: 'bytes' })).toEqual(
      hexToBytes(hex),
    )
  })

  test('yParity carries the recovery id', () => {
    expect(object.yParity).toBe(1)
    expect(object.yParity).toBe(object.v - 27)
    expect(sign({ hash: messageDigest, privateKey: pk1 }).yParity).toBe(0)
  })
})

describe('parseSignature', () => {
  const components = sign({ hash: txId, privateKey: pk1 })

  test('splits a 0x-prefixed signature into its components', () => {
    const parsed = parseSignature(`0x${txSignature}`)
    expect(parsed).toEqual(components)
    expect(parsed).toEqual({
      r: `0x${txSignature.slice(0, 64)}`,
      s: `0x${txSignature.slice(64, 128)}`,
      v: 28,
      yParity: 1,
    })
    expect(Object.keys(parsed).sort()).toEqual(['r', 's', 'v', 'yParity'])
  })

  test('accepts the bare wire form (as carried by transaction.signature[])', () => {
    expect(parseSignature(txSignature)).toEqual(components)
  })

  test('round-trips with serializeSignature and sign', () => {
    expect(serializeSignature(parseSignature(`0x${txSignature}`))).toBe(
      `0x${txSignature}`,
    )
    const hex = sign({ hash: txId, privateKey: pk1, to: 'hex' })
    const parsed = parseSignature(hex)
    expect(parsed.r).toBe(components.r)
    expect(parsed.s).toBe(components.s)
    expect(parsed.v).toBe(components.v)
    expect(parsed.yParity).toBe(components.yParity)
    expect(parsed).toEqual(components)
    expect(serializeSignature(parsed)).toBe(hex)
  })

  test('normalizes upper-case hex to lower-case components', () => {
    const parsed = parseSignature(txSignature.toUpperCase())
    expect(parsed.r).toBe(components.r)
    expect(parsed.s).toBe(components.s)
    expect(parsed.v).toBe(components.v)
    expect(parsed.yParity).toBe(components.yParity)
    expect(serializeSignature(parsed)).toBe(`0x${txSignature}`)
  })

  test.each([
    ['00', 27, 0],
    ['01', 28, 1],
    ['1b', 27, 0],
    ['1c', 28, 1],
  ])('reads a recovery byte of %s as v=%i / yParity=%i', (byte, v, yParity) => {
    const parsed = parseSignature(`${txSignature.slice(0, 128)}${byte}`)
    expect(parsed.v).toBe(v)
    expect(parsed.yParity).toBe(yParity)
    expect(parsed.v - 27).toBe(yParity)
  })

  test.each([
    ['too short', txSignature.slice(0, 128)],
    ['too long', `${txSignature}00`],
    ['non-hex', `${txSignature.slice(0, 128)}zz`],
    [
      'a recovery byte outside {0, 1, 27, 28}',
      `${txSignature.slice(0, 128)}02`,
    ],
  ])('rejects %s', (_, value) => {
    expect(() => parseSignature(value)).toThrow(BaseError)
    expect(() => parseSignature(`0x${value}`)).toThrow(BaseError)
  })
})

describe('serializeSignature: recovery id input forms', () => {
  const { r, s } = sign({ hash: txId, privateKey: pk1 })

  test('accepts v as a bigint (viem-style components)', () => {
    expect(serializeSignature({ r, s, v: 28n })).toBe(`0x${txSignature}`)
  })

  test('accepts yParity when v is absent', () => {
    expect(serializeSignature({ r, s, yParity: 1 })).toBe(`0x${txSignature}`)
    expect(serializeSignature({ r, s, yParity: 0 }).endsWith('1b')).toBe(true)
  })

  test('v takes precedence over yParity', () => {
    expect(serializeSignature({ r, s, v: 28, yParity: 0 })).toBe(
      `0x${txSignature}`,
    )
  })

  test('rejects a missing recovery id and a yParity outside {0, 1}', () => {
    expect(() => serializeSignature({ r, s })).toThrow(/yParity/)
    expect(() => serializeSignature({ r, s, yParity: 2 })).toThrow(/yParity/)
    expect(() => serializeSignature({ r, s, v: 127n })).toThrow(/Invalid v/)
  })
})
