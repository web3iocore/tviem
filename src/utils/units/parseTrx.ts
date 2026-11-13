import { trxUnits } from '../../constants/unit.js'
import type { ErrorType } from '../../errors/utils.js'

import { type ParseUnitsErrorType, parseUnits } from './parseUnits.js'

export type ParseTrxErrorType = ParseUnitsErrorType | ErrorType

/**
 * Converts a string representation of trx to numerical sun.
 *
 * `trx` has at least one digit, with an optional leading `-` and an optional
 * fraction. Fraction digits past the sixth are dropped (the result is
 * truncated toward zero, not rounded).
 *
 * @example
 * import { parseTrx } from '@tronweb3/tviem'
 *
 * parseTrx('420')
 * // 420000000n
 *
 * parseTrx('1.9999999')
 * // 1999999n
 */
export function parseTrx(trx: string) {
  return parseUnits(trx, trxUnits.sun)
}
