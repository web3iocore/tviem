import {
  InvalidDecimalsError,
  type InvalidDecimalsErrorType,
} from '../../errors/unit.js'
import type { ErrorType } from '../../errors/utils.js'

export type FormatUnitsErrorType = InvalidDecimalsErrorType | ErrorType

/**
 *  Divides a number by a given exponent of base 10 (10exponent), and formats it into a string representation of the number..
 *
 * `decimals` is a non-negative integer.
 *
 * @example
 * import { formatUnits } from '@tronweb3/tviem'
 *
 * formatUnits(420000000000n, 9)
 * // '420'
 */
export function formatUnits(value: bigint, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0)
    throw new InvalidDecimalsError({ decimals })

  let display = value.toString()

  const negative = display.startsWith('-')
  if (negative) display = display.slice(1)

  display = display.padStart(decimals, '0')

  let [integer, fraction] = [
    display.slice(0, display.length - decimals),
    display.slice(display.length - decimals),
  ]
  fraction = fraction.replace(/(0+)$/, '')
  return `${negative ? '-' : ''}${integer || '0'}${
    fraction ? `.${fraction}` : ''
  }`
}
