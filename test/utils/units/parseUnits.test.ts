import { expect, test } from 'vitest'

import {
  InvalidDecimalNumberError,
  InvalidDecimalsError,
} from '../../../src/errors/unit.js'
import { formatUnits } from '../../../src/utils/units/formatUnits.js'
import { parseUnits } from '../../../src/utils/units/parseUnits.js'

test('converts number to unit of a given length', () => {
  expect(parseUnits('69', 1)).toMatchInlineSnapshot('690n')
  expect(parseUnits('13', 5)).toMatchInlineSnapshot('1300000n')
  expect(parseUnits('420', 10)).toMatchInlineSnapshot('4200000000000n')
  expect(parseUnits('20', 9)).toMatchInlineSnapshot('20000000000n')
  expect(parseUnits('40', 18)).toMatchInlineSnapshot('40000000000000000000n')
  expect(parseUnits('1.2345', 4)).toMatchInlineSnapshot('12345n')
  expect(parseUnits('1.0045', 4)).toMatchInlineSnapshot('10045n')
  expect(parseUnits('1.2345000', 4)).toMatchInlineSnapshot('12345n')
  expect(parseUnits('6942069420.12345678912345', 18)).toMatchInlineSnapshot(
    '6942069420123456789123450000n',
  )
  expect(parseUnits('6942069420.00045678912345', 18)).toMatchInlineSnapshot(
    '6942069420000456789123450000n',
  )
  expect(
    parseUnits('6942123123123069420.1234544444678912345', 50),
  ).toMatchInlineSnapshot(
    '694212312312306942012345444446789123450000000000000000000000000000000n',
  )
  expect(parseUnits('-69', 1)).toMatchInlineSnapshot('-690n')
  expect(parseUnits('-1.2345', 4)).toMatchInlineSnapshot('-12345n')
  expect(parseUnits('-6942069420.12345678912345', 18)).toMatchInlineSnapshot(
    '-6942069420123456789123450000n',
  )
  expect(
    parseUnits('-6942123123123069420.1234544444678912345', 50),
  ).toMatchInlineSnapshot(
    '-694212312312306942012345444446789123450000000000000000000000000000000n',
  )
})

test('decimals === 0', () => {
  expect(
    parseUnits('69.2352112312312451512412341231', 0),
  ).toMatchInlineSnapshot('69n')
  expect(
    parseUnits('69.5952141234124125231523412312', 0),
  ).toMatchInlineSnapshot(`69n`)
  expect(parseUnits('12301000000000000020000', 0)).toMatchInlineSnapshot(
    '12301000000000000020000n',
  )
  expect(parseUnits('12301000000000000020000.123', 0)).toMatchInlineSnapshot(
    '12301000000000000020000n',
  )
  expect(parseUnits('12301000000000000020000.5', 0)).toMatchInlineSnapshot(
    `12301000000000000020000n`,
  )
  expect(parseUnits('99999999999999999999999.5', 0)).toMatchInlineSnapshot(
    `99999999999999999999999n`,
  )
})

test('decimals < fraction length: the extra digits are dropped', () => {
  expect(parseUnits('69.23521', 0)).toMatchInlineSnapshot('69n')
  expect(parseUnits('69.56789', 0)).toMatchInlineSnapshot(`69n`)
  expect(parseUnits('69.23521', 1)).toMatchInlineSnapshot('692n')
  expect(parseUnits('69.23521', 2)).toMatchInlineSnapshot(`6923n`)
  expect(parseUnits('69.23221', 2)).toMatchInlineSnapshot('6923n')
  expect(parseUnits('69.23261', 3)).toMatchInlineSnapshot(`69232n`)
  expect(parseUnits('999999.99999', 3)).toMatchInlineSnapshot(`999999999n`)
  expect(parseUnits('699999.99999', 3)).toMatchInlineSnapshot(`699999999n`)
  expect(parseUnits('699999.98999', 3)).toMatchInlineSnapshot(`699999989n`)
  expect(parseUnits('699959.99999', 3)).toMatchInlineSnapshot(`699959999n`)
  expect(parseUnits('699099.99999', 3)).toMatchInlineSnapshot(`699099999n`)
  expect(parseUnits('100000.000999', 3)).toMatchInlineSnapshot(`100000000n`)
  expect(parseUnits('100000.990999', 3)).toMatchInlineSnapshot(`100000990n`)
  expect(parseUnits('69.00221', 3)).toMatchInlineSnapshot('69002n')
  expect(parseUnits('1.0536059576998882', 7)).toMatchInlineSnapshot(`10536059n`)
  expect(parseUnits('1.0053059576998882', 7)).toMatchInlineSnapshot(`10053059n`)
  expect(parseUnits('1.0000000900000000', 7)).toMatchInlineSnapshot(`10000000n`)
  expect(parseUnits('1.0000009900000000', 7)).toMatchInlineSnapshot(`10000009n`)
  expect(parseUnits('1.0000099900000000', 7)).toMatchInlineSnapshot(`10000099n`)
  expect(parseUnits('1.0000092900000000', 7)).toMatchInlineSnapshot(`10000092n`)
  expect(parseUnits('1.5536059576998882', 7)).toMatchInlineSnapshot(`15536059n`)
  expect(parseUnits('1.0536059476998882', 7)).toMatchInlineSnapshot('10536059n')
  expect(parseUnits('1.4545454545454545', 7)).toMatchInlineSnapshot(`14545454n`)
  expect(parseUnits('1.1234567891234567', 7)).toMatchInlineSnapshot(`11234567n`)
  expect(parseUnits('1.8989898989898989', 7)).toMatchInlineSnapshot(`18989898n`)
  expect(parseUnits('9.9999999999999999', 7)).toMatchInlineSnapshot(`99999999n`)
  expect(parseUnits('0.0536059576998882', 7)).toMatchInlineSnapshot(`536059n`)
  expect(parseUnits('0.0053059576998882', 7)).toMatchInlineSnapshot(`53059n`)
  expect(parseUnits('0.0000000900000000', 7)).toMatchInlineSnapshot(`0n`)
  expect(parseUnits('0.0000009900000000', 7)).toMatchInlineSnapshot(`9n`)
  expect(parseUnits('0.0000099900000000', 7)).toMatchInlineSnapshot(`99n`)
  expect(parseUnits('0.0000092900000000', 7)).toMatchInlineSnapshot(`92n`)
  expect(parseUnits('0.0999999999999999', 7)).toMatchInlineSnapshot(`999999n`)
  expect(parseUnits('0.0099999999999999', 7)).toMatchInlineSnapshot(`99999n`)
  expect(parseUnits('0.00000000059', 9)).toMatchInlineSnapshot(`0n`)
  expect(parseUnits('0.0000000003', 9)).toMatchInlineSnapshot('0n')
  expect(parseUnits('69.00000000000', 9)).toMatchInlineSnapshot('69000000000n')
  expect(parseUnits('69.00000000019', 9)).toMatchInlineSnapshot('69000000000n')
  expect(parseUnits('69.00000000059', 9)).toMatchInlineSnapshot(`69000000000n`)
  expect(parseUnits('69.59000000059', 9)).toMatchInlineSnapshot(`69590000000n`)
  expect(parseUnits('69.59000002359', 9)).toMatchInlineSnapshot(`69590000023n`)
})

// Exact reference: scale the digits as one integer and divide; bigint division
// truncates toward zero.
function truncated(value: string, decimals: number) {
  const negative = value.startsWith('-')
  const [integer = '', fraction = ''] = (
    negative ? value.slice(1) : value
  ).split('.')
  const scaled =
    (BigInt(`${integer || '0'}${fraction}`) * 10n ** BigInt(decimals)) /
    10n ** BigInt(fraction.length)
  return negative ? -scaled : scaled
}

test('truncates toward zero: the magnitude is never more than the input', () => {
  expect(parseUnits('1.9999999', 6)).toBe(1999999n)
  expect(parseUnits('1.0000005', 6)).toBe(1000000n)
  expect(parseUnits('0.9999995', 6)).toBe(999999n)
  expect(parseUnits('0.0000009', 6)).toBe(0n)
  expect(parseUnits('9.9999999999999999', 7)).toBe(99999999n)
  expect(parseUnits('999999.99999', 3)).toBe(999999999n)
  expect(parseUnits('69.9', 0)).toBe(69n)
  expect(parseUnits('99999999999999999999999.5', 0)).toBe(
    99999999999999999999999n,
  )
  // Negative values move toward zero as well.
  expect(parseUnits('-1.9999999', 6)).toBe(-1999999n)
  expect(parseUnits('-0.0000009', 6)).toBe(0n)
  expect(parseUnits('-69.9', 0)).toBe(-69n)
  // A long tail of digits has no effect on the kept digits.
  expect(parseUnits('1.00000049999999999999999999', 6)).toBe(1000000n)
  expect(parseUnits(`0.4${'9'.repeat(40)}`, 0)).toBe(0n)
})

test('matches exact integer arithmetic across decimals and digit patterns', () => {
  const values = [
    '0',
    '1',
    '0.5',
    '.5',
    '5.',
    '1.9999999',
    '1.0000005',
    '0.0000009',
    '123456789.987654321987654321',
    '999999.999999999',
    '0.000000000000000001',
    '6942069420.12345678912345',
    '00012.3400',
  ]
  for (const decimals of [0, 1, 2, 6, 7, 9, 18, 30])
    for (const value of values)
      for (const signed of [value, `-${value}`])
        expect([signed, decimals, parseUnits(signed, decimals)]).toEqual([
          signed,
          decimals,
          truncated(signed, decimals),
        ])
})

test('rejects non-decimal input with InvalidDecimalNumberError', () => {
  for (const value of [
    '1e6',
    '0x10',
    'abc',
    '5.5.5',
    '+1',
    ' 1',
    '1 ',
    '1,5',
    '--1',
    '1-',
  ])
    expect(() => parseUnits(value, 6)).toThrow(InvalidDecimalNumberError)
})

test('rejects input without a digit', () => {
  for (const value of ['', '.', '-', '-.'])
    expect(() => parseUnits(value, 6)).toThrow(InvalidDecimalNumberError)
})

test('accepts a missing integer or fraction part', () => {
  expect(parseUnits('.5', 6)).toBe(500000n)
  expect(parseUnits('5.', 6)).toBe(5000000n)
  expect(parseUnits('-.5', 6)).toBe(-500000n)
  expect(parseUnits('-5.', 6)).toBe(-5000000n)
})

test('rejects decimals that are not a non-negative integer', () => {
  for (const decimals of [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    undefined,
    null,
    '6',
  ])
    expect(() => parseUnits('1.5', decimals as never)).toThrow(
      InvalidDecimalsError,
    )
  expect(parseUnits('1.5', 0)).toBe(1n)
})

// A scan that grows with the square of the length would exceed the test
// timeout on these inputs.
test('handles 200,000-character input, valid or not', () => {
  expect(() => parseUnits(`${'1'.repeat(200_000)}x`, 6)).toThrow(
    InvalidDecimalNumberError,
  )
  expect(() => parseUnits(`0.${'0'.repeat(200_000)}1x`, 6)).toThrow(
    InvalidDecimalNumberError,
  )
  expect(parseUnits(`0.${'0'.repeat(200_000)}1`, 6)).toBe(0n)
})

test('large-value precision (pure bigint, no float loss)', () => {
  const trx64 = 18446744073709551616n // 2^64
  expect(trx64).toBe(2n ** 64n)
  expect(parseUnits(trx64.toString(), 6)).toBe(trx64 * 10n ** 6n)
  expect(parseUnits(trx64.toString(), 6)).toBe(18446744073709551616000000n)
  expect(formatUnits(trx64 * 10n ** 6n, 6)).toBe(trx64.toString())

  const trx256 =
    115792089237316195423570985008687907853269984665640564039457584007913129639936n // 2^256
  expect(trx256).toBe(2n ** 256n)
  expect(parseUnits(trx256.toString(), 6)).toBe(trx256 * 10n ** 6n)
  expect(formatUnits(trx256 * 10n ** 6n, 6)).toBe(trx256.toString())
})

test('round-trip: formatUnits(parseUnits(x, 6), 6) === normalized x', () => {
  const vectors: [string, string][] = [
    ['1', '1'],
    ['0.5', '0.5'],
    ['0.000001', '0.000001'],
    ['6942069420.123456', '6942069420.123456'],
    ['1.230000', '1.23'], // trailing fraction zeros trimmed
    ['0.100000', '0.1'],
    ['-1', '-1'],
    ['-0.5', '-0.5'],
    ['-6942069420.123456', '-6942069420.123456'],
  ]
  for (const [input, normalized] of vectors)
    expect(formatUnits(parseUnits(input, 6), 6)).toBe(normalized)
})
