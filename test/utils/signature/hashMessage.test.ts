import { describe, expect, test } from 'vitest'

import { InvalidParameterError } from '../../../src/errors/parameter.js'
import { stringToBytes } from '../../../src/utils/encoding/toBytes.js'
import { keccak256 } from '../../../src/utils/hash/keccak256.js'
import {
  hashMessage,
  presignMessagePrefix,
} from '../../../src/utils/signature/hashMessage.js'

// Canonical TIP-191 digest for the current package name (pk = 1). Verified
// byte-for-byte against TronWeb's `utils.message.hashMessage`. (The pre-rename
// spec constant 0xdd7bd740… is stale: it is the digest of the former message,
// not of the string below.)
const message = 'sign this message'
const digest =
  '0x46971b5b1d980410d80acba57293e39e27ed19dd6ff1015a8ebd9f8e0cc4edd9'

describe('hashMessage', () => {
  test('matches the TronWeb-verified TIP-191 digest', () => {
    expect(hashMessage(message)).toBe(digest)
  })

  test('uses the TIP-191 prefix (0x19 "TRON Signed Message:\\n")', () => {
    expect(presignMessagePrefix).toBe('\x19TRON Signed Message:\n')
  })

  test('empty string uses a length of 0', () => {
    expect(hashMessage('')).toBe(
      keccak256(stringToBytes(`${presignMessagePrefix}0`)),
    )
  })

  test('measures length in UTF-8 bytes, not code points', () => {
    // "é" is 1 code point but 2 UTF-8 bytes; "🚀" is 1 code point but 4 bytes.
    const multibyte = 'é🚀'
    const messageBytes = stringToBytes(multibyte)
    expect(messageBytes.length).toBe(6)
    const expected = keccak256(
      new Uint8Array([
        ...stringToBytes(`${presignMessagePrefix}${messageBytes.length}`),
        ...messageBytes,
      ]),
    )
    expect(hashMessage(multibyte)).toBe(expected)
  })

  test('accepts { raw } bytes and hashes them as-is', () => {
    const raw = new Uint8Array([1, 2, 3])
    const expected = keccak256(
      new Uint8Array([...stringToBytes(`${presignMessagePrefix}3`), ...raw]),
    )
    expect(hashMessage({ raw })).toBe(expected)
    expect(hashMessage({ raw: '0x010203' })).toBe(expected)
  })

  test('can return bytes', () => {
    const bytes = hashMessage(message, 'bytes')
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(32)
  })

  // A raw hex string is bytes: `hexToBytes` would left-pad an odd nibble
  // count ("0x123" hashing identically to "0x0123") and silently drop the
  // leading byte of an unprefixed string (`slice(2)`), so both are refused —
  // a digest over bytes the caller never wrote must not be signable.
  test('rejects a raw hex string with an odd nibble count', () => {
    expect(() => hashMessage({ raw: '0x123' })).toThrow()
  })

  test('rejects a raw hex string without the 0x prefix', () => {
    expect(() => hashMessage({ raw: '010203' as `0x${string}` })).toThrow()
  })
})

test('reads a raw message once: the validated bytes are the hashed bytes', () => {
  // The hex guards exist to keep the digest over the caller's exact bytes.
  // An accessor answering the guards with one string and the decode with
  // another would produce a signable digest nothing validated.
  let reads = 0
  const message = {
    get raw() {
      reads++
      return reads <= 3 ? '0x1111' : '0x2222'
    },
  } as { raw: `0x${string}` }
  expect(hashMessage(message)).toBe(hashMessage({ raw: '0x1111' }))
})

test('an unprefixed raw hex string throws an InvalidParameterError', () => {
  let error: unknown
  try {
    hashMessage({ raw: 'abcd' as never })
  } catch (error_) {
    error = error_
  }
  expect(error).toBeInstanceOf(InvalidParameterError)
  expect(error).toMatchObject({
    name: 'InvalidParameterError',
    param: 'message.raw',
    reason: 'format',
  })
  expect((error as InvalidParameterError).shortMessage).toBe(
    'Invalid raw message: expected a 0x-prefixed hex string, got "abcd".',
  )
})

describe('hashMessage with { raw } bytes', () => {
  const bytes = new Uint8Array([1, 2, 3, 250, 255])
  const expected = hashMessage({ raw: bytes })

  test('the digest is keccak256(prefix ++ length ++ bytes)', () => {
    const prefix = stringToBytes(`${presignMessagePrefix}${bytes.length}`)
    const whole = new Uint8Array(prefix.length + bytes.length)
    whole.set(prefix)
    whole.set(bytes, prefix.length)
    expect(expected).toBe(keccak256(whole))
    // The same bytes as hex give the same digest.
    expect(hashMessage({ raw: '0x010203faff' })).toBe(expected)
  })

  test('a number array, a Buffer and other typed arrays hash like the same Uint8Array', () => {
    for (const raw of [
      [1, 2, 3, 250, 255],
      Buffer.from(bytes),
      new Uint16Array([1, 2, 3, 250, 255]),
      { length: 5, 0: 1, 1: 2, 2: 3, 3: 250, 4: 255 },
    ])
      expect(hashMessage({ raw: raw as never })).toBe(expected)
  })

  test('an empty byte array hashes as the empty message', () => {
    expect(hashMessage({ raw: new Uint8Array(0) })).toBe(hashMessage(''))
  })

  test('takes a single snapshot of the length and indexed bytes', () => {
    let lengthReads = 0
    let byteReads = 0
    const raw = {
      get length() {
        return lengthReads++ === 0 ? 1 : 0
      },
      get 0() {
        return byteReads++ === 0 ? 1 : 256
      },
      get [Symbol.iterator]() {
        throw new Error('Expected indexed byte reads')
      },
    }
    expect(hashMessage({ raw: raw as never })).toBe(
      hashMessage({ raw: '0x01' }),
    )
    expect(lengthReads).toBe(1)
    expect(byteReads).toBe(1)
  })

  test("the caller's array is not modified and later changes to it do not matter", () => {
    const raw = new Uint8Array([1, 2, 3, 250, 255])
    const before = hashMessage({ raw })
    expect([...raw]).toEqual([1, 2, 3, 250, 255])
    raw[0] = 9
    expect(hashMessage({ raw })).not.toBe(before)
    expect(before).toBe(expected)
  })

  // The length written into the prefix and the number of bytes hashed come
  // from one copy of the input, whatever `length` reports on each read.
  test('the prefixed length always equals the number of bytes hashed', () => {
    const content = [0x32, ...new Uint8Array(32).fill(7)]
    const digestOfFirst = (count: number) =>
      hashMessage({ raw: Uint8Array.from(content.slice(0, count)) })
    for (let switchAfter = 0; switchAfter <= 6; switchAfter++) {
      let reads = 0
      const raw: Record<string | number, unknown> = {
        get length() {
          return reads++ < switchAfter ? 3 : 33
        },
      }
      content.forEach((byte, index) => {
        raw[index] = byte
      })
      const digest = hashMessage({ raw: raw as never })
      // Either reading is acceptable; a mix of the two is not.
      expect([switchAfter, [digestOfFirst(3), digestOfFirst(33)]]).toEqual([
        switchAfter,
        expect.arrayContaining([digest]),
      ])
      // "…\n3" ++ "2" ++ m is byte-identical to "…\n32" ++ m.
      expect(digest).not.toBe(hashMessage({ raw: new Uint8Array(32).fill(7) }))
    }
  })

  test.each([
    ['a number', 5],
    ['null', null],
    ['undefined', undefined],
    ['a plain object', {}],
    ['an ArrayBuffer', new ArrayBuffer(4)],
    ['a DataView', new DataView(new ArrayBuffer(4))],
    ['a boolean', true],
    ['an object with a non-numeric length', { length: '3' }],
  ])('rejects %s as raw with an InvalidParameterError', (_, raw) => {
    let err: unknown
    try {
      hashMessage({ raw: raw as never })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(InvalidParameterError)
    expect((err as InvalidParameterError).param).toBe('message.raw')
  })

  test.each([
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects a raw byte length of %s', (length) => {
    expect(() => hashMessage({ raw: { length } as never })).toThrow(
      expect.objectContaining({
        name: 'InvalidParameterError',
        param: 'message.raw',
        reason: 'range',
      }),
    )
  })

  test.each([
    ['a sparse array', new Array(1)],
    ['a missing array-like index', { length: 2, 0: 1 }],
    ['a byte above 255', new Uint16Array([256])],
    ['a negative byte', [-1]],
    ['a fractional byte', [1.5]],
    ['a numeric string', ['1']],
    ['an undefined element', [undefined]],
    ['NaN', [NaN]],
  ])('rejects %s in raw bytes', (_, raw) => {
    expect(() => hashMessage({ raw: raw as never })).toThrow(
      expect.objectContaining({
        name: 'InvalidParameterError',
        param: 'message.raw',
        reason: 'format',
      }),
    )
  })
})
