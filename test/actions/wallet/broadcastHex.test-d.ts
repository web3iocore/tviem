// Type-surface tests for the broadcastHex parameters: the serialized hex
// transaction is passed as `serializedTransaction`; `transaction` is only the
// name of the node's echo on the return type.
import { expectTypeOf, test } from 'vitest'

import type {
  BroadcastHexParameters,
  BroadcastHexReturnType,
} from '../../../src/actions/wallet/broadcastHex.js'

test('the hex is passed as `serializedTransaction`', () => {
  expectTypeOf<BroadcastHexParameters>().toEqualTypeOf<{
    serializedTransaction: string
  }>()
  expectTypeOf<BroadcastHexParameters>().not.toHaveProperty('transaction')

  const parameters: BroadcastHexParameters = { serializedTransaction: '0a' }
  // @ts-expect-error — `transaction` does not exist on the parameters.
  const former: BroadcastHexParameters = { transaction: '0a' }
  // @ts-expect-error — `serializedTransaction` is required.
  const empty: BroadcastHexParameters = {}
  void parameters
  void former
  void empty
})

test('the return type keeps the node echo as `transaction`', () => {
  expectTypeOf<BroadcastHexReturnType['transaction']>().toEqualTypeOf<unknown>()
  expectTypeOf<BroadcastHexReturnType['txid']>().toEqualTypeOf<string>()
})
