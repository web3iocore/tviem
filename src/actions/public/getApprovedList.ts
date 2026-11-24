import type { SignableTransaction } from '../../accounts/types.js'
import type { Client } from '../../clients/createClient.js'
import type { RequestErrorType } from '../../clients/transports/http.js'
import {
  MissingFieldError,
  type MissingFieldErrorType,
} from '../../errors/parameter.js'
import type { TransactionMismatchErrorType } from '../../errors/rpc.js'
import type { ErrorType } from '../../errors/utils.js'
import type { Address, AddressInput } from '../../types/address.js'
import {
  type ToBase58ErrorType,
  toBase58,
} from '../../utils/address/toBase58.js'
import {
  type CloneTransactionErrorType,
  cloneTransaction,
} from '../../utils/transaction/cloneTransaction.js'
import { assertUnchangedTransaction } from '../utils/assertUnchangedTransaction.js'
import {
  type CanonicalizeTransactionErrorType,
  canonicalizeTransaction,
} from '../utils/canonicalizeTransaction.js'
import { recoverEchoedResultBody } from '../utils/recoverMultisigResult.js'

export type GetApprovedListParameters = {
  /** A locally built (and typically partially-signed) transaction. */
  transaction: SignableTransaction
}

export type GetApprovedListReturnType = {
  /** Addresses (Base58Check) that have already signed. */
  approvedList: Address[]
  /**
   * The node's verdict: `SUCCESS` (proto3 omits it, as the default, so
   * `result` is then empty or absent). Failure codes never land here — they
   * throw.
   */
  result?:
    | { code?: string | undefined; message?: string | undefined }
    | undefined
  /**
   * The **local** transaction — a snapshot taken on entry, which is what was
   * sent and what the node's echoed copy was verified against. Its `raw_data`
   * is in the canonical node-JSON shape, whatever spelling the caller passed.
   */
  transaction: SignableTransaction
}

export type GetApprovedListErrorType =
  | CanonicalizeTransactionErrorType
  | CloneTransactionErrorType
  | MissingFieldErrorType
  | RequestErrorType
  | ToBase58ErrorType
  | TransactionMismatchErrorType
  | ErrorType

type RawApprovedList = {
  result?:
    | { code?: string | undefined; message?: string | undefined }
    | undefined
  approved_list?: string[] | undefined
  transaction?:
    | { transaction?: { txID?: string; raw_data_hex?: string } | undefined }
    | undefined
}

/**
 * Reads which addresses have already signed a multi-sig transaction via
 * `getapprovedlist` (full node).
 *
 * Node echo: like {@link getSignWeight}, the node's echoed transaction is
 * asserted to match the local one byte-for-byte (throwing
 * {@link TransactionMismatchError} otherwise), and the returned `transaction`
 * is always the local copy. {@link canonicalizeTransaction} decodes
 * `raw_data_hex` to produce the `raw_data` sent in java-tron's `visible: false`
 * format.
 *
 * A failure verdict — `SIGNATURE_FORMAT_ERROR`, `COMPUTE_ADDRESS_ERROR`,
 * `OTHER_ERROR` — throws the transport's `TronContractValidateError`,
 * carrying the node's `code` and message. It is never read as an empty
 * approval list: java-tron echoes the transaction on those branches too, so
 * the echo cannot tell a failure from a verdict; only the code can.
 *
 * @param client The Client to use.
 * @param parameters `transaction` — the built transaction to inspect.
 * @returns `{ approvedList, result, transaction }`.
 */
export async function getApprovedList(
  client: Client,
  parameters: GetApprovedListParameters,
): Promise<GetApprovedListReturnType> {
  // Snapshot once, like the sign and broadcast paths: the guard below, the
  // request body and the echo assertion are three separate reads of the
  // caller's object with an `await` between the last two. Read live, the
  // assertion would compare the node's echo against whatever the object says
  // by then rather than against what was sent.
  const snapshot = cloneTransaction(parameters.transaction)

  if (!snapshot.raw_data_hex || !snapshot.txID)
    throw new MissingFieldError(
      'getApprovedList requires a built transaction carrying `raw_data_hex` and `txID` (sign or multiSign it first).',
      { field: !snapshot.raw_data_hex ? 'raw_data_hex' : 'txID' },
    )

  const transaction = canonicalizeTransaction(snapshot)

  // A real node reports `SUCCESS` as `code` alone (or omits it), which the
  // transport passes through; should a `message` ride along (a proxy, a mock),
  // the transport's Form 2 check rejects the body and it is recovered here —
  // by code only. Every other code is a failure and is rethrown, echoed
  // transaction or not.
  let response: RawApprovedList
  try {
    response = await client.request<RawApprovedList>({
      node: 'full',
      path: 'getapprovedlist',
      method: 'POST',
      body: {
        txID: transaction.txID,
        // Node dialect: these endpoints rebuild the transaction from the
        // snake_case raw_data JSON (raw_data_hex is ignored server-side).
        raw_data: transaction.raw_data,
        raw_data_hex: transaction.raw_data_hex,
        signature: transaction.signature ?? [],
      },
    })
  } catch (error) {
    const recovered = recoverEchoedResultBody(error, { okCodes: ['SUCCESS'] })
    if (!recovered) throw error
    response = recovered as RawApprovedList
  }

  assertUnchangedTransaction(transaction, response.transaction?.transaction, {
    path: 'getapprovedlist',
  })

  return {
    approvedList: (response.approved_list ?? []).map((address) =>
      toBase58(address as AddressInput),
    ),
    ...(response.result ? { result: response.result } : {}),
    transaction,
  }
}
