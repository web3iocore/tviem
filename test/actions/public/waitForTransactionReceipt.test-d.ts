import { expectTypeOf, test } from 'vitest'
import type { WaitForTransactionReceiptReturnType } from '../../../src/actions/public/waitForTransactionReceipt.js'
import type { TransactionRevertedError } from '../../../src/errors/rpc.js'
import type { TransactionInfo } from '../../../src/types/transaction.js'

test('waitForTransactionReceipt resolves to the full TransactionInfo', () => {
  expectTypeOf<WaitForTransactionReceiptReturnType>().toEqualTypeOf<TransactionInfo>()
  expectTypeOf<
    WaitForTransactionReceiptReturnType['blockNumber']
  >().toEqualTypeOf<bigint>()
  expectTypeOf<
    WaitForTransactionReceiptReturnType['fee']
  >().toEqualTypeOf<bigint>()
  expectTypeOf<WaitForTransactionReceiptReturnType['logs']>().toEqualTypeOf<
    TransactionInfo['logs']
  >()
  expectTypeOf<WaitForTransactionReceiptReturnType['status']>().toEqualTypeOf<
    'success' | 'reverted'
  >()
  // No index signature: unknown keys are a type error.
  expectTypeOf<WaitForTransactionReceiptReturnType>().not.toHaveProperty(
    'anything',
  )
})

test('TransactionRevertedError carries the same TransactionInfo', () => {
  expectTypeOf<
    TransactionRevertedError['receipt']
  >().toEqualTypeOf<TransactionInfo>()
})
