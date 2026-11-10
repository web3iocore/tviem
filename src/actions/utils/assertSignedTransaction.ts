import type { SignableTransaction } from '../../accounts/types.js'
import {
  TransactionMismatchError,
  type TransactionMismatchErrorType,
} from '../../errors/rpc.js'
import type { ErrorType } from '../../errors/utils.js'
import type { AddressInput } from '../../types/address.js'
import type { MaybePromise } from '../../types/utils.js'
import { addressToHex } from '../../utils/address/addressToHex.js'
import {
  type CloneTransactionErrorType,
  cloneTransaction,
} from '../../utils/transaction/cloneTransaction.js'
import { txCheck } from '../../utils/transaction/txCheck.js'

export type AssertSignedTransactionErrorType =
  | CloneTransactionErrorType
  | TransactionMismatchErrorType
  | ErrorType

/**
 * Runs `sign` on a copy of `transaction` and returns a checked snapshot of
 * the result (see {@link assertSignedTransaction}). The signer gets its own
 * copy, and the result is checked against a separate one.
 *
 * @param transaction The transaction to sign.
 * @param sign The account's signing call.
 * @returns A checked plain-data snapshot of the signed transaction.
 */
export async function signWithCheck(
  transaction: SignableTransaction,
  sign: (transaction: SignableTransaction) => MaybePromise<SignableTransaction>,
): Promise<SignableTransaction> {
  const unsigned = cloneTransaction(transaction)
  const signed = await sign(cloneTransaction(unsigned))
  return assertSignedTransaction(signed, unsigned)
}

/**
 * Checks what an account's signer handed back and returns a plain-data
 * snapshot of it — the only copy the caller should read from then on.
 *
 * The signer may be a wallet that rebuilds the transaction before signing
 * (fresh `ref_block_*` / `expiration`, adjusted `fee_limit`), so the bytes —
 * and the `txID` — are allowed to differ from `unsigned`. What must hold:
 * - the snapshot passes {@link txCheck} (`txID`, `raw_data` and
 *   `raw_data_hex` agree), so the fields read below describe the signed bytes;
 * - it carries at least one signature;
 * - every contract's `owner_address` matches `unsigned`'s — the signer is
 *   still acting on the same account. The signer itself need not be that
 *   owner (multi-signature co-signers are not).
 *
 * @param signed The transaction the signer returned.
 * @param unsigned The transaction the signer was asked to sign, kept as a
 * separate copy.
 * @returns A deep copy of `signed` that shares no references with it.
 */
export function assertSignedTransaction(
  signed: SignableTransaction,
  unsigned: SignableTransaction,
): SignableTransaction {
  const snapshot = cloneTransaction(signed)

  if (!txCheck(snapshot))
    throw new TransactionMismatchError({
      shortMessage:
        'The signer returned a transaction that fails txCheck: its txID, raw_data and raw_data_hex do not agree, or raw_data holds fields this SDK does not serialize.',
    })

  if (!snapshot.signature?.length)
    throw new TransactionMismatchError({
      shortMessage: 'The signer returned a transaction without a signature.',
    })

  const expected = readOwners(unsigned)
  if (!expected)
    throw new TransactionMismatchError({
      shortMessage:
        'The transaction to sign has no readable owner_address to check the signed result against.',
    })
  const actual = readOwners(snapshot)
  if (
    !actual ||
    expected.length !== actual.length ||
    expected.some((owner, i) => owner !== actual[i])
  )
    throw new TransactionMismatchError({
      shortMessage:
        'The signer returned a transaction for a different owner_address than the one it was asked to sign.',
    })

  return snapshot
}

/**
 * Every contract's `owner_address` in canonical hex (so Base58 and hex
 * spellings of one address compare equal), or `undefined` when any of them
 * cannot be read — an unreadable owner compares unequal rather than throwing
 * a raw TypeError.
 */
function readOwners(transaction: SignableTransaction): string[] | undefined {
  try {
    const contracts = transaction.raw_data.contract
    if (!Array.isArray(contracts) || contracts.length === 0) return undefined
    return contracts.map((contract) => {
      const { value } = contract.parameter
      if (typeof value !== 'object') throw new Error('no owner')
      return addressToHex(value.owner_address as AddressInput)
    })
  } catch {
    return undefined
  }
}
