import {
  InvalidDecimalNumberError,
  type InvalidDecimalNumberErrorType,
  InvalidDecimalsError,
  type InvalidDecimalsErrorType,
} from '../../errors/unit.js'
import type { ErrorType } from '../../errors/utils.js'

export type ParseUnitsErrorType =
  | InvalidDecimalNumberErrorType
  | InvalidDecimalsErrorType
  | ErrorType

/**
 * Multiplies a string representation of a number by a given exponent of base 10 (10exponent).
 *
 * `value` has at least one digit, with an optional leading `-` and an
 * optional fraction. Fraction digits past `decimals` are dropped (the result
 * is truncated toward zero, not rounded). `decimals` is a non-negative
 * integer.
 *
 * @example
 * import { parseUnits } from '@tronweb3/tviem'
 *
 * parseUnits('420', 9)
 * // 420000000000n
 *
 * parseUnits('1.9999999', 6)
 * // 1999999n
 */
export function parseUnits(value: string, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0)
    throw new InvalidDecimalsError({ decimals })

  if (!/^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(value))
    throw new InvalidDecimalNumberError({ value })

  let [integer = '', fraction = ''] = value.split('.')

  const negative = integer.startsWith('-')
  if (negative) integer = integer.slice(1)
  if (integer === '') integer = '0'

  fraction = fraction.slice(0, decimals).padEnd(decimals, '0')

  return BigInt(`${negative ? '-' : ''}${integer}${fraction}`)
}
