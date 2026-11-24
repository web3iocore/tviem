import type { SignableTransaction } from '../../accounts/types.js'
import type { Client } from '../../clients/createClient.js'
import {
  decodeNodeMessage,
  type RequestErrorType,
} from '../../clients/transports/http.js'
import { TronNodeError } from '../../errors/node.js'
import {
  InvalidParameterError,
  type InvalidParameterErrorType,
  MissingFieldError,
  type MissingFieldErrorType,
} from '../../errors/parameter.js'
import {
  TransactionExpiredError,
  type TransactionExpiredErrorType,
  TronRpcError,
  type TronRpcErrorType,
} from '../../errors/rpc.js'
import type { ErrorType } from '../../errors/utils.js'
import { bareHex } from '../../utils/encoding/bareHex.js'
import {
  type CloneTransactionErrorType,
  cloneTransaction,
} from '../../utils/transaction/cloneTransaction.js'
import {
  type CanonicalizeTransactionErrorType,
  canonicalizeTransaction,
} from '../utils/canonicalizeTransaction.js'
import {
  type AssertRpcSuccessErrorType,
  assertRpcSuccess,
} from '../utils/normalizeResponse.js'

export type BroadcastTransactionParameters = {
  /** A signed transaction (must already carry at least one signature). */
  transaction: SignableTransaction
}
export type BroadcastTransactionReturnType = {
  /**
   * The supplied `transaction.txID`, normalized to bare lowercase hex.
   */
  txid: string
  /** The node's acknowledgement flag (`true` here — a rejection throws). */
  result?: boolean | undefined
  /** The node's response code, when echoed (e.g. `SUCCESS`). */
  code?: string | undefined
  /** The node's message, hex-decoded to UTF-8 when decodable. */
  message?: string | undefined
  /**
   * The four-field signed transaction snapshot sent to the node. Its
   * `raw_data` is decoded from `raw_data_hex` in the node's JSON format.
   */
  transaction: SignableTransaction
}

/** The `broadcasttransaction` acknowledgement body. */
type RawBroadcastResponse = {
  result?: boolean | undefined
  txid?: string | undefined
  code?: string | undefined
  message?: string | undefined
}

export type BroadcastTransactionErrorType =
  | AssertRpcSuccessErrorType
  | CanonicalizeTransactionErrorType
  | CloneTransactionErrorType
  | InvalidParameterErrorType
  | MissingFieldErrorType
  | RequestErrorType
  | TransactionExpiredErrorType
  | TronRpcErrorType
  | ErrorType

/**
 * TRON broadcast rejection codes that mean the transaction's reference block
 * expired before it could be included — surfaced as a dedicated error so a
 * caller can rebuild and retry.
 */
const expirationCodes = new Set(['TRANSACTION_EXPIRATION_ERROR', 'TAPOS_ERROR'])

/**
 * Broadcasts an already-signed transaction via `broadcasttransaction` (full
 * node): the body is the full signed transaction in node JSON (`txID`,
 * `raw_data`, `raw_data_hex`, `signature`). Node dialect: the node rebuilds
 * the `Transaction` protobuf from the snake_case `raw_data` JSON —
 * `raw_data_hex` is ignored server-side — so the JSON model, not the hex, is
 * what gets relayed.
 *
 * {@link canonicalizeTransaction} decodes `raw_data_hex` to produce the
 * `raw_data` sent in java-tron's `visible: false` format. The returned `txid`
 * comes from the supplied `transaction.txID`, normalized to bare lowercase
 * hex. The node supplies `result`, `code`, and `message`, with `message`
 * decoded from hex to UTF-8 when decodable.
 *
 * The transport's error normalization already throws for the documented
 * rejection bodies (`{ result: false, code }` → `TronBroadcastError`, etc.); a
 * `{ result: false }` rejection without a `code` is caught here by
 * {@link assertRpcSuccess}, and a body carrying no acknowledgement at all
 * (`{}` from an LB stub / warming node) is refused rather than resolved. A
 * rejection whose code indicates the reference block expired is re-surfaced
 * as a {@link TransactionExpiredError}, with the node rejection as `cause`.
 *
 * @param client The Client to use.
 * @param parameters The signed transaction to broadcast.
 * @returns `{ txid, result, code, message, transaction }` with the normalized
 * input transaction id, the node's acknowledgement fields, and the signed
 * transaction that was broadcast.
 */
export async function broadcastTransaction(
  client: Client,
  parameters: BroadcastTransactionParameters,
): Promise<BroadcastTransactionReturnType> {
  // `parameters` that is not an object, or carries no `transaction`, is
  // reported as a parameter error before anything is read from it.
  const source = parameters?.transaction
  if (source === undefined || source === null)
    throw new InvalidParameterError(
      'Invalid transaction: expected a signed transaction object.',
      { param: 'transaction', reason: 'type' },
    )

  // Take a detached snapshot of the fields used to build the request body.
  const snapshot = cloneTransaction({
    txID: source.txID,
    raw_data: source.raw_data,
    raw_data_hex: source.raw_data_hex,
    signature: source.signature,
  })
  const { raw_data_hex, txID, signature } = snapshot

  // Pre-condition: never broadcast an unsigned transaction.
  if (!signature || signature.length === 0)
    throw new TronRpcError(
      'Cannot broadcast a transaction without a signature.',
      { metaMessages: ['Path: broadcasttransaction'] },
    )

  if (!raw_data_hex || !txID)
    throw new MissingFieldError(
      'broadcastTransaction requires a signed transaction carrying `raw_data_hex` and `txID`.',
      { field: !raw_data_hex ? 'raw_data_hex' : 'txID' },
    )

  const txid = bareHex(txID)
  const signedTransaction = canonicalizeTransaction({ ...snapshot, signature })

  let response: unknown
  try {
    // Broadcast exactly once — no transport retry. Re-sending a signed
    // transaction cannot help: the node dedupes it by `txID`, so a retry after
    // a lost response only comes back as a spurious "already exists" rejection
    // (a success reported as a failure). Confirming inclusion is the caller's
    // job (`waitForTransactionReceipt` / `getTransactionInfo`). This matches
    // TronWeb's single-shot broadcast.
    response = await client.request(
      {
        node: 'full',
        method: 'POST',
        path: 'broadcasttransaction',
        body: signedTransaction,
      },
      { retryCount: 0 },
    )
  } catch (error) {
    // Map an expiration rejection to a dedicated, actionable error.
    if (
      error instanceof TronNodeError &&
      error.code !== undefined &&
      expirationCodes.has(error.code)
    )
      throw new TransactionExpiredError({ hash: txid, cause: error })
    throw error
  }

  // Secondary guard: a `{ result: false }` rejection without a `code` passes
  // through the transport normalizer untouched.
  assertRpcSuccess(response, { path: 'broadcasttransaction' })

  const body = (
    response && typeof response === 'object' ? response : {}
  ) as RawBroadcastResponse

  // Positive acknowledgement required. java-tron's success body always prints
  // `result: true` (proto3 omits only defaults) and every rejection shape was
  // thrown above — a body with neither (`{}` from an LB stub / warming node)
  // means the transaction may never have reached a node.
  if (body.result !== true)
    throw new TronRpcError('The node did not acknowledge the broadcast.', {
      details: JSON.stringify(body),
      metaMessages: ['Path: broadcasttransaction'],
    })

  return {
    txid,
    result: body.result,
    ...(body.code !== undefined ? { code: String(body.code) } : {}),
    ...(body.message !== undefined
      ? { message: decodeNodeMessage(body.message) }
      : {}),
    transaction: signedTransaction,
  }
}
