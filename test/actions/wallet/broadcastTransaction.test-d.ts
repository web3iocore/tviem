// Type-surface tests for the broadcastTransaction parameters: the signed
// transaction is passed as `transaction`, the name every action that takes a
// transaction object uses.
import { expectTypeOf, test } from 'vitest'

import type { SignableTransaction } from '../../../src/accounts/types.js'
import type {
  BroadcastTransactionParameters,
  BroadcastTransactionReturnType,
} from '../../../src/actions/wallet/broadcastTransaction.js'

declare const signed: SignableTransaction

test('the signed transaction is passed as `transaction`', () => {
  expectTypeOf<BroadcastTransactionParameters>().toEqualTypeOf<{
    transaction: SignableTransaction
  }>()
  expectTypeOf<BroadcastTransactionParameters>().not.toHaveProperty(
    'signedTransaction',
  )

  const parameters: BroadcastTransactionParameters = { transaction: signed }
  // @ts-expect-error — `signedTransaction` does not exist on the parameters.
  const former: BroadcastTransactionParameters = { signedTransaction: signed }
  // @ts-expect-error — `transaction` is required.
  const empty: BroadcastTransactionParameters = {}
  void parameters
  void former
  void empty
})

test('the return type carries the broadcast transaction as `transaction`', () => {
  expectTypeOf<
    BroadcastTransactionReturnType['transaction']
  >().toEqualTypeOf<SignableTransaction>()
  expectTypeOf<BroadcastTransactionReturnType['txid']>().toEqualTypeOf<string>()
})
