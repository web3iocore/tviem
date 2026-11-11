import { describe, expect, test } from 'vitest'
import { InvalidParameterError } from '../../../src/errors/parameter.js'
import {
  int64InputToBigInt,
  int64ToJson,
} from '../../../src/utils/transaction/int64.js'

describe('int64InputToBigInt', () => {
  test.each([
    ['bigint', 9n, 9n],
    ['negative bigint', -42n, -42n],
    ['number', 7, 7n],
    ['zero', 0, 0n],
    ['decimal string', '100', 100n],
    ['negative decimal string', '-5', -5n],
    ['string past 2^53', '9007199254740993', 9007199254740993n],
  ])('accepts a %s', (_, input, expected) => {
    expect(int64InputToBigInt('amount', input as never)).toBe(expected)
  })

  test('rejects an unsafe-integer number', () => {
    expect(() => int64InputToBigInt('amount', 2 ** 53)).toThrow(
      'not a safe integer',
    )
  })

  test('rejects a non-decimal string', () => {
    expect(() => int64InputToBigInt('amount', '0x64')).toThrow(
      'not a decimal integer string',
    )
  })

  test('rejects a BigNumber-style object — toString and valueOf are two reads', () => {
    // The regex validates `String(value)` while `BigInt(value)` consults
    // `valueOf`: two DIFFERENT conversions of a mutable object, so the value
    // that passes validation need not be the value that encodes — into the
    // signed bytes. Primitives only, by decision.
    const divergent = {
      toString: () => '1',
      valueOf: () => 1_000_000_000n,
    }
    expect(() => int64InputToBigInt('amount', divergent as never)).toThrow(
      'expected a bigint, number or decimal string, got object',
    )
  })

  test.each([
    ['a boxed Number', new Number(42)],
    ['a boxed String', new String('42')],
    ['null', null],
    ['a boolean', true],
    ['undefined', undefined],
  ])('rejects %s', (_, input) => {
    expect(() => int64InputToBigInt('amount', input as never)).toThrow(
      'expected a bigint, number or decimal string',
    )
  })
})

describe('int64ToJson', () => {
  test('renders within-2^53 values as numbers, beyond as decimal strings', () => {
    expect(int64ToJson(1n)).toBe(1)
    expect(int64ToJson(-9007199254740991n)).toBe(-9007199254740991)
    expect(int64ToJson(9007199254740992n)).toBe('9007199254740992')
  })
})

describe('int64InputToBigInt errors', () => {
  test.each([
    ['an unsafe-integer number', 2 ** 53, 'range'],
    ['a non-primitive', {}, 'type'],
    ['a non-decimal string', '0x64', 'format'],
  ])('%s throws an InvalidParameterError naming the field', (_, input, reason) => {
    expect(() => int64InputToBigInt('amount', input as never)).toThrow(
      InvalidParameterError,
    )
    expect(() => int64InputToBigInt('amount', input as never)).toThrow(
      expect.objectContaining({
        name: 'InvalidParameterError',
        param: 'amount',
        reason,
      }),
    )
  })
})

describe('int64InputToBigInt param', () => {
  const errorOf = (fn: () => unknown) => {
    try {
      fn()
    } catch (error) {
      return error as InvalidParameterError
    }
    throw new Error('expected a throw')
  }

  test.each([
    ['an unsafe-integer number', 1.5, 'range'],
    ['a non-primitive', {}, 'type'],
    ['a non-decimal string', '0x64', 'format'],
  ])('%s reports the given `param`, keeping the label in the message', (_, input, reason) => {
    const labelled = errorOf(() =>
      int64InputToBigInt('proposal parameter key', input as never),
    )
    const named = errorOf(() =>
      int64InputToBigInt(
        'proposal parameter key',
        input as never,
        'parameters',
      ),
    )
    expect(named).toBeInstanceOf(InvalidParameterError)
    expect(named).toMatchObject({ param: 'parameters', reason })
    // Without a `param` the label is reported; the message is the same.
    expect(labelled.param).toBe('proposal parameter key')
    expect(named.shortMessage).toBe(labelled.shortMessage)
    expect(named.shortMessage).toContain('Invalid proposal parameter key: ')
  })
})
