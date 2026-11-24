import type { SignableTransaction } from '../../accounts/types.js'
import {
  type DecodeRawDataErrorType,
  decodeRawData,
} from '../../utils/transaction/decodeRawData.js'

export type CanonicalizeTransactionErrorType = DecodeRawDataErrorType

/**
 * Decodes `raw_data_hex` into the `raw_data` JSON that java-tron reads when
 * rebuilding a transaction for `broadcasttransaction`, `getsignweight`, or
 * `getapprovedlist`. {@link decodeRawData} uses the `visible: false` rendering
 * with `41…` hex addresses, so a carried `visible` flag is set to `false`.
 *
 * @param snapshot A `cloneTransaction` snapshot — plain data, already detached
 * from the caller's object.
 * @returns The snapshot with `raw_data` in the canonical node-JSON shape.
 */
export function canonicalizeTransaction<
  transaction extends SignableTransaction,
>(snapshot: transaction): transaction {
  return {
    ...snapshot,
    ...('visible' in snapshot ? { visible: false } : {}),
    raw_data: decodeRawData(snapshot.raw_data_hex),
  }
}
