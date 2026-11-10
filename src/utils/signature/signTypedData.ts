import type { ErrorType } from '../../errors/utils.js'
import type { ByteArray, Hex } from '../../types/misc.js'
import {
  type HashTypedDataErrorType,
  type HashTypedDataParameters,
  hashTypedData,
} from './hashTypedData.js'
import { type SignErrorType, sign } from './sign.js'

export type SignTypedDataParameters = HashTypedDataParameters & {
  /** The secp256k1 private key, as `0x`-prefixed or bare hex. */
  privateKey: Hex | string
  /**
   * Extra entropy for the (otherwise RFC 6979-deterministic) nonce. Omit for a
   * deterministic signature (the TRON default).
   */
  extraEntropy?: Hex | ByteArray | boolean | undefined
}

export type SignTypedDataErrorType =
  | HashTypedDataErrorType
  | SignErrorType
  | ErrorType

/**
 * Signs TIP-712 (EIP-712) typed structured data: hashes it with
 * {@link hashTypedData}, then signs the digest with the secp256k1 private key.
 *
 * TRON-specific: `address`-typed values (message fields and
 * `domain.verifyingContract`) accept any TRON address form and are encoded as
 * their 20-byte EVM form; `trcToken` is treated as `uint256`.
 *
 * @param parameters `domain`, `types`, `primaryType`, `message`, the private
 * key and optional extra entropy.
 * @returns The `0x`-prefixed 65-byte signature (`r ++ s ++ v`), the form
 * TronWeb and TronLink return. Split it with `parseSignature`.
 *
 * @example
 * signTypedData({ domain, types, primaryType: 'Mail', message, privateKey })
 * // '0x...'
 */
export function signTypedData({
  privateKey,
  extraEntropy,
  ...typedData
}: SignTypedDataParameters): Hex {
  return sign({
    hash: hashTypedData(typedData),
    privateKey,
    ...(extraEntropy !== undefined ? { extraEntropy } : {}),
    to: 'hex',
  })
}
