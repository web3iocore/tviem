import { describe, expect, test } from 'vitest'
import {
  AbiEncodingArrayLengthMismatchError,
  InvalidAbiParameterValueError,
  UnsupportedPackedAbiTypeError,
} from '../../../src/errors/abi.js'
import { InvalidHexValueError } from '../../../src/errors/encoding.js'
import { InvalidParameterError } from '../../../src/errors/parameter.js'
import { encodeAbiParameters } from '../../../src/utils/abi/encodeAbiParameters.js'
import { encodePacked } from '../../../src/utils/abi/encodePacked.js'
import {
  type FixtureParameter,
  loadPackedFixtures,
  reviveValue,
} from '../../fixtures/abi/loader.js'

const fixtures = loadPackedFixtures()

describe('encodePacked (gold fixtures)', () => {
  test.each(
    fixtures.map((fixture) => [fixture.name, fixture] as const),
  )('%s encodes byte-exact', (_name, fixture) => {
    const values = fixture.types.map((type, i) =>
      reviveValue({ type } as FixtureParameter, fixture.values[i]!),
    )
    expect(encodePacked(fixture.types, values as never)).toBe(fixture.encoded)
  })

  test('covers all 20 gold vectors', () => {
    expect(fixtures.length).toBe(20)
  })
})

describe('encodePacked (units)', () => {
  test('static types keep their natural width (no padding)', () => {
    expect(
      encodePacked(
        ['address', 'uint256'],
        ['TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe', 1000000n],
      ),
    ).toBe(
      '0x0123456789abcdef0123456789abcdef0123456700000000000000000000000000000000000000000000000000000000000f4240',
    )
    expect(encodePacked(['uint8'], [255n])).toBe('0xff')
    expect(encodePacked(['bool'], [true])).toBe('0x01')
    expect(encodePacked(['bool'], [false])).toBe('0x00')
    expect(encodePacked(['bytes1'], ['0xff'])).toBe('0xff')
  })

  test('dynamic bytes / string are raw and unpadded', () => {
    expect(encodePacked(['string'], ['hello test'])).toBe(
      '0x68656c6c6f2074657374',
    )
    expect(encodePacked(['bytes'], ['0x0102030405'])).toBe('0x0102030405')
    expect(encodePacked(['bytes'], ['0x'])).toBe('0x')
  })

  test('array elements are padded to 32-byte words', () => {
    expect(encodePacked(['uint256[]'], [[1n, 1000000n]])).toBe(
      '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000f4240',
    )
    expect(
      encodePacked(
        ['address[2]'],
        [
          [
            'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC',
            'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe',
          ],
        ],
      ),
    ).toBe(
      '0x0000000000000000000000007e5f4552091a69125d5dfcb7b8c2659029395bdf0000000000000000000000000123456789abcdef0123456789abcdef01234567',
    )
  })

  test('trcToken packs exactly like uint256', () => {
    // A lone `trcToken` occupies a full 32-byte word.
    expect(encodePacked(['trcToken'], [1002000n])).toBe(
      '0x00000000000000000000000000000000000000000000000000000000000f4a10',
    )
    // Byte-identical to the equivalent uint256 encoding — scalar, array, and
    // when mixed with other packed types. (No `as never`: the widened
    // `PackedAbiType` types `trcToken` values as `bigint | number`.)
    expect(encodePacked(['trcToken'], [1002000n])).toBe(
      encodePacked(['uint256'], [1002000n]),
    )
    expect(encodePacked(['trcToken[]'], [[1n, 1002000n]])).toBe(
      encodePacked(['uint256[]'], [[1n, 1002000n]]),
    )
    expect(
      encodePacked(
        ['address', 'trcToken'],
        ['TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe', 1002000n],
      ),
    ).toBe(
      encodePacked(
        ['address', 'uint256'],
        ['TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe', 1002000n],
      ),
    )
  })

  test('rejects unpackable nested dynamic / tuple types', () => {
    expect(() => encodePacked(['tuple'], [[1n]] as never)).toThrow(
      UnsupportedPackedAbiTypeError,
    )
    expect(() => encodePacked(['string[]'], [['a']] as never)).toThrow(
      UnsupportedPackedAbiTypeError,
    )
    expect(() => encodePacked(['uint256[][]'], [[[1n]]] as never)).toThrow(
      UnsupportedPackedAbiTypeError,
    )
  })

  test('rejects a types/values length mismatch', () => {
    expect(() => encodePacked(['uint256', 'uint256'], [1n] as never)).toThrow()
  })
})

function caught(fn: () => unknown): Error | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error as Error
  }
}

// `abi.encodePacked` output is fed to keccak256 to build signed digests, so a
// byte string that is off by half a byte — or an array whose declared length is
// ignored — yields a hash that can never match the on-chain one.
describe('encodePacked (malformed input)', () => {
  test('rejects an odd-length `bytesN` value instead of emitting half a byte', () => {
    const error = caught(() =>
      encodePacked(['bytes1', 'bytes1'], ['0x1', '0xff']),
    )
    expect(error).toBeInstanceOf(InvalidHexValueError)
    // Before the guard this returned '0x1ff' — three nibbles, not a byte string,
    // with every following field shifted by half a byte.
  })

  test('rejects an odd-length dynamic `bytes` value', () => {
    const error = caught(() => encodePacked(['bytes', 'uint8'], ['0x1', 1n]))
    expect(error).toBeInstanceOf(InvalidHexValueError)
    expect(error?.message).toContain('"0x1"')
  })

  test('rejects a fixed-size array whose value length differs from the declared one', () => {
    const short = caught(() => encodePacked(['uint256[3]'], [[1n]]))
    expect(short).toBeInstanceOf(AbiEncodingArrayLengthMismatchError)
    // Pin the operands: transposing them ships a message that reads
    // "Expected length: 1 / Given length: 3" for this very call.
    expect(short?.message).toContain('uint256[3]')
    expect(short?.message).toContain('Expected length: 3')
    expect(short?.message).toContain('Given length: 1')
    const long = caught(() =>
      encodePacked(['uint256[2]'], [[1n, 2n, 3n, 4n, 5n]]),
    )
    expect(long).toBeInstanceOf(AbiEncodingArrayLengthMismatchError)
    expect(long?.message).toContain('Expected length: 2')
    expect(long?.message).toContain('Given length: 5')
  })

  test('rejects an odd-length `bytesN` element inside a fixed-size array', () => {
    // Array elements are right-padded to a 32-byte word, so a missing nibble
    // is baked into the digest with no visible shift to give it away: before
    // the guard this returned '0x1230…0000' + '0x1234…0000'.
    const error = caught(() =>
      encodePacked(['bytes2[2]'], [['0x123', '0x1234']]),
    )
    expect(error).toBeInstanceOf(InvalidHexValueError)
  })

  test('checks hex well-formedness before the `bytesN` width check', () => {
    // `size('0x1')` rounds up to 1, so before the guard this reported a width
    // mismatch (bytes1 vs bytes2) and masked the real problem.
    const error = caught(() => encodePacked(['bytes2'], ['0x1']))
    expect(error).toBeInstanceOf(InvalidHexValueError)
  })

  test('a matching fixed-size array still encodes one 32-byte word per element', () => {
    const encoded = encodePacked(['uint256[3]'], [[1n, 2n, 3n]])
    expect((encoded.length - 2) / 2).toBe(96)
  })

  test('dynamic arrays are unaffected by the fixed-length check', () => {
    expect((encodePacked(['uint256[]'], [[1n, 2n]]).length - 2) / 2).toBe(64)
    expect(encodePacked(['uint256[]'], [[]])).toBe('0x')
  })

  test('rejects a number past 2^53 instead of encoding the rounded value', () => {
    // The literal 2^53+1 is already 2^53 by the time it is a JS number, so
    // BigInt() would encode a value the caller never wrote.
    const error = caught(() =>
      encodePacked(['uint256'], [Number.MAX_SAFE_INTEGER + 2]),
    )
    expect(error?.message).toMatch(/not a safe integer/)
  })

  test('rejects a fractional / NaN number for an integer type', () => {
    expect(caught(() => encodePacked(['uint256'], [1.5]))?.message).toMatch(
      /not a safe integer/,
    )
    expect(
      caught(() => encodePacked(['int64'], [Number.NaN]))?.message,
    ).toMatch(/not a safe integer/)
  })

  test('a safe-integer number and a bigint still encode', () => {
    expect(() => encodePacked(['uint256'], [42])).not.toThrow()
    expect(() => encodePacked(['uint256'], [9007199254740993n])).not.toThrow()
  })

  test('well-formed byte values still encode unpadded', () => {
    expect(encodePacked(['bytes1', 'bytes1'], ['0x01', '0xff'])).toBe('0x01ff')
    expect(encodePacked(['bytes', 'uint8'], ['0x01', 1n])).toBe('0x0101')
  })

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 123],
    ['a bigint', 123n],
    ['a boolean', true],
    ['an object', {}],
    ['an array', ['a']],
    ['a byte array', new Uint8Array([0x61])],
    ['a String object', new String('a')],
  ])('rejects %s as a `string` value', (_, value) => {
    expect(() => encodePacked(['string'], [value as never])).toThrow(
      InvalidAbiParameterValueError,
    )
    // The same value in the middle of a packed message.
    expect(() =>
      encodePacked(['uint8', 'string', 'uint8'], [1n, value as never, 2n]),
    ).toThrow(InvalidAbiParameterValueError)
  })

  test('a `string` value that is not a string fails as it does in encodeAbiParameters', () => {
    for (const value of [undefined, null, 123, true, {}]) {
      const packed = (() => {
        try {
          encodePacked(['string'], [value as never])
        } catch (e) {
          return e as InvalidAbiParameterValueError
        }
        return undefined
      })()
      const standard = (() => {
        try {
          encodeAbiParameters([{ type: 'string' }], [value as never])
        } catch (e) {
          return e as InvalidAbiParameterValueError
        }
        return undefined
      })()
      expect(packed).toBeInstanceOf(InvalidAbiParameterValueError)
      expect(standard).toBeInstanceOf(InvalidAbiParameterValueError)
      expect(packed?.shortMessage).toBe(standard?.shortMessage)
    }
  })

  test('string values still encode as their UTF-8 bytes', () => {
    expect(encodePacked(['string'], [''])).toBe('0x')
    expect(encodePacked(['string'], ['123'])).toBe('0x313233')
    expect(encodePacked(['string'], ['null'])).toBe('0x6e756c6c')
    expect(encodePacked(['string'], ['undefined'])).toBe('0x756e646566696e6564')
    expect(encodePacked(['string'], ['中文'])).toBe('0xe4b8ade69687')
    expect(encodePacked(['uint8', 'string', 'uint8'], [1n, 'ab', 2n])).toBe(
      '0x01616202',
    )
  })
})

test('an unsafe-integer number throws an InvalidParameterError', () => {
  let error: unknown
  try {
    encodePacked(['uint256'], [2 ** 60])
  } catch (error_) {
    error = error_
  }
  expect(error).toBeInstanceOf(InvalidParameterError)
  expect(error).toMatchObject({
    name: 'InvalidParameterError',
    param: 'values',
    reason: 'range',
  })
})

// A type that has no packed encoding and a value that does not fit a packable
// type are reported by different classes: `UnsupportedPackedAbiTypeError`
// names the type, `InvalidAbiParameterValueError` names the value — the class
// `encodeAbiParameters` uses for the same value.
describe('encodePacked (error classes)', () => {
  test.each([
    ['`string` inside an array', 'string[]', ['a'], 'string[]'],
    ['`bytes` inside an array', 'bytes[]', ['0x01'], 'bytes[]'],
    ['a nested array', 'uint256[][]', [[1n]], 'uint256[]'],
    ['a tuple', 'tuple', [1n], 'tuple'],
    ['a tuple inside an array', 'tuple[]', [[1n]], 'tuple'],
    ['an unknown type', 'function', '0x01', 'function'],
    ['an out-of-range bytesN', 'bytes33', '0x01', 'bytes33'],
  ])('an unpackable type (%s) throws UnsupportedPackedAbiTypeError', (_, type, value, reported) => {
    const error = caught(() => encodePacked([type], [value] as never))
    expect(error).toBeInstanceOf(UnsupportedPackedAbiTypeError)
    expect(error?.name).toBe('UnsupportedPackedAbiTypeError')
    expect((error as UnsupportedPackedAbiTypeError).shortMessage).toBe(
      `Type "${reported}" is not supported for packed encoding.`,
    )
  })

  test.each([
    ['string[]', [5]],
    ['bytes[]', ['not hex']],
    ['uint256[][]', ['not an array']],
  ])('the type check precedes the value check for %s', (type, value) => {
    expect(caught(() => encodePacked([type], [value] as never))).toBeInstanceOf(
      UnsupportedPackedAbiTypeError,
    )
  })

  const invalidValues: [type: string, value: unknown][] = [
    // dynamic `bytes`: not a hex string
    ['bytes', 'hello'],
    ['bytes', ''],
    ['bytes', 5],
    ['bytes', undefined],
    // `bool`: not a boolean
    ['bool', 'true'],
    ['bool', 1],
    ['bool', undefined],
    // `uintN` / `intN`: neither a number nor a bigint
    ['uint256', '1'],
    ['uint8', true],
    ['int64', null],
    // `bytesN`: not a hex string
    ['bytes4', 'zz'],
    ['bytes32', 5],
    ['bytes1', undefined],
  ]

  test.each(
    invalidValues,
  )('an invalid value for %s (%o) throws InvalidAbiParameterValueError', (type, value) => {
    const error = caught(() => encodePacked([type], [value] as never))
    expect(error).toBeInstanceOf(InvalidAbiParameterValueError)
    expect(error).not.toBeInstanceOf(UnsupportedPackedAbiTypeError)
    expect(error?.name).toBe('InvalidAbiParameterValueError')
    expect((error as InvalidAbiParameterValueError).shortMessage).toBe(
      `Value "${String(value)}" is not a valid value for ABI type "${type}".`,
    )
  })

  test.each(
    invalidValues,
  )('%s (%o): encodeAbiParameters reports the same class and message', (type, value) => {
    const packed = caught(() => encodePacked([type], [value] as never))
    const standard = caught(() => encodeAbiParameters([{ type }], [value]))
    expect(standard).toBeInstanceOf(InvalidAbiParameterValueError)
    expect(packed?.constructor).toBe(standard?.constructor)
    expect(packed?.message).toBe(standard?.message)
  })

  test.each([
    ['bool[]', [true, 'false'], 'bool', 'false'],
    ['uint8[2]', [1n, '2'], 'uint8', '2'],
    ['bytes2[]', ['0x0102', 'zz'], 'bytes2', 'zz'],
  ])('an invalid element of %s throws InvalidAbiParameterValueError', (type, value, elementType, element) => {
    const error = caught(() => encodePacked([type], [value] as never))
    expect(error).toBeInstanceOf(InvalidAbiParameterValueError)
    expect((error as InvalidAbiParameterValueError).shortMessage).toBe(
      `Value "${element}" is not a valid value for ABI type "${elementType}".`,
    )
    expect(
      caught(() => encodeAbiParameters([{ type }], [value]))?.message,
    ).toBe(error?.message)
  })

  test.each([
    ['trcToken', '1', '1'],
    ['trcToken', undefined, 'undefined'],
    ['trcToken[]', [1n, '2'], '2'],
    ['trcToken[2]', [null, 2n], 'null'],
  ])('an invalid value for %s is reported under the `trcToken` type name', (type, value, reported) => {
    const error = caught(() => encodePacked([type], [value] as never))
    expect(error).toBeInstanceOf(InvalidAbiParameterValueError)
    expect((error as InvalidAbiParameterValueError).shortMessage).toBe(
      `Value "${reported}" is not a valid value for ABI type "trcToken".`,
    )
    const standard = caught(() => encodeAbiParameters([{ type }], [value]))
    expect(standard).toBeInstanceOf(InvalidAbiParameterValueError)
    expect(error?.message).toBe(standard?.message)
  })

  // Values whose string conversion throws.
  const unprintable: [label: string, value: unknown][] = [
    ['an object without a prototype', Object.create(null)],
    ['an array holding a symbol', [Symbol('s')]],
    [
      'an object whose toString throws',
      {
        toString() {
          throw new Error('toString')
        },
      },
    ],
  ]

  test.each(
    ['bytes', 'bool', 'uint256', 'int8', 'trcToken', 'bytes4'].flatMap((type) =>
      unprintable.map(([label, value]) => [type, label, value] as const),
    ),
  )('%s with %s throws InvalidAbiParameterValueError', (type, _, value) => {
    const packed = caught(() => encodePacked([type], [value] as never))
    expect(packed).toBeInstanceOf(InvalidAbiParameterValueError)
    expect((packed as InvalidAbiParameterValueError).shortMessage).toBe(
      `Value "object" is not a valid value for ABI type "${type}".`,
    )
    const standard = caught(() => encodeAbiParameters([{ type }], [value]))
    expect(standard).toBeInstanceOf(InvalidAbiParameterValueError)
    expect(packed?.message).toBe(standard?.message)
  })
})
