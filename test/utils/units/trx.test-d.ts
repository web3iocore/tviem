import { expectTypeOf, test } from 'vitest'

import { formatTrx } from '../../../src/utils/units/formatTrx.js'
import { parseTrx } from '../../../src/utils/units/parseTrx.js'

test('parseTrx takes the TRX string only', () => {
  expectTypeOf(parseTrx).parameters.toEqualTypeOf<[trx: string]>()
  expectTypeOf(parseTrx).returns.toEqualTypeOf<bigint>()
  // @ts-expect-error — there is no unit argument
  parseTrx('1', 'sun')
})

test('formatTrx takes the sun amount only', () => {
  expectTypeOf(formatTrx).parameters.toEqualTypeOf<[sun: bigint]>()
  expectTypeOf(formatTrx).returns.toEqualTypeOf<string>()
  // @ts-expect-error — there is no unit argument
  formatTrx(1n, 'sun')
})
