import { secp256k1 } from '@noble/curves/secp256k1'
import { isBytes } from '@noble/hashes/utils'
import {
  InvalidParameterError,
  type InvalidParameterErrorType,
} from '../../errors/parameter.js'
import type { ErrorType } from '../../errors/utils.js'
import type { Address } from '../../types/address.js'
import type { ByteArray, Hex } from '../../types/misc.js'
import { type HexToBytesErrorType, hexToBytes } from '../encoding/toBytes.js'
import { type Keccak256ErrorType, keccak256 } from '../hash/keccak256.js'
import {
  type EncodeBase58CheckErrorType,
  encodeBase58Check,
} from './base58check.js'

export type PublicKeyToAddressErrorType =
  | InvalidParameterErrorType
  | HexToBytesErrorType
  | Keccak256ErrorType
  | EncodeBase58CheckErrorType
  | ErrorType

/**
 * Converts a secp256k1 public key to its TRON Base58Check address by hashing
 * the 64-byte coordinate body with Keccak-256.
 *
 * Accepts a 65-byte uncompressed public key (`0x04` prefix) or its 64-byte
 * body, as `0x`-prefixed hex or bytes.
 *
 * @throws {InvalidParameterError} If the public key does not encode a valid
 * secp256k1 curve point.
 *
 * @example
 * publicKeyToAddress('0x04...')
 * // 'T...' — the address that public key controls
 */
export function publicKeyToAddress(publicKey: Hex | ByteArray): Address {
  const bytes =
    typeof publicKey === 'string' ? hexToBytes(publicKey) : publicKey
  if (!isBytes(bytes))
    throw new InvalidParameterError(
      'Invalid public key. Expected a hex string or Uint8Array.',
      { param: 'publicKey', reason: 'type' },
    )
  if (bytes.length !== 64 && bytes.length !== 65)
    throw new InvalidParameterError(
      `Invalid public key length: ${bytes.length} bytes. Expected a 65-byte uncompressed ("04"-prefixed) public key, or its 64-byte body.`,
      { param: 'publicKey', reason: 'format' },
    )

  // Validate and hash the same snapshot of the caller's bytes.
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 0x04
  uncompressed.set(bytes, bytes.length === 64 ? 1 : 0)
  if (uncompressed[0] !== 0x04)
    throw new InvalidParameterError(
      'Invalid public key: a 65-byte uncompressed public key must start with the `0x04` prefix byte.',
      { param: 'publicKey', reason: 'format' },
    )
  try {
    secp256k1.ProjectivePoint.fromHex(uncompressed)
  } catch {
    throw new InvalidParameterError(
      'Invalid public key. Expected a valid secp256k1 curve point.',
      { param: 'publicKey', reason: 'format' },
    )
  }

  const hash = keccak256(uncompressed.subarray(1), 'bytes')
  const payload = new Uint8Array(21)
  payload[0] = 0x41
  payload.set(hash.subarray(12), 1)
  return encodeBase58Check(payload) as Address
}
