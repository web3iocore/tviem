import { secp256k1 } from '@noble/curves/secp256k1'

import type { ErrorType } from '../../errors/utils.js'
import type { Address } from '../../types/address.js'
import type { Hex } from '../../types/misc.js'
import {
  type PublicKeyToAddressErrorType,
  publicKeyToAddress,
} from '../../utils/address/publicKeyToAddress.js'
import {
  type ParsePrivateKeyErrorType,
  parsePrivateKey,
} from './parsePrivateKey.js'

export type PrivateKeyToAddressErrorType =
  | ParsePrivateKeyErrorType
  | PublicKeyToAddressErrorType
  | ErrorType

/**
 * Converts an ECDSA (secp256k1) private key to its TRON Base58Check address.
 *
 * Accepts a 32-byte private key as `0x`-prefixed or bare hex (see
 * `parsePrivateKey` for the accepted forms); the uncompressed public key is
 * derived and hashed (`keccak256`, last 20 bytes, `0x41` prefix).
 */
export function privateKeyToAddress(privateKey: Hex | string): Address {
  const publicKey = secp256k1.getPublicKey(parsePrivateKey(privateKey), false)
  return publicKeyToAddress(publicKey)
}
