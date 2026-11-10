import { secp256k1 } from '@noble/curves/secp256k1'

import {
  InvalidPrivateKeyError,
  type InvalidPrivateKeyErrorType,
} from '../../errors/account.js'
import type { ErrorType } from '../../errors/utils.js'
import type { Hex } from '../../types/misc.js'

export type ParsePrivateKeyErrorType = InvalidPrivateKeyErrorType | ErrorType

/**
 * Normalizes a private-key input to the bare lower-case 64-hex form the
 * secp256k1 layer takes. Surrounding whitespace and a `0x` / `0X` prefix are
 * dropped; anything else — wrong length, non-hex characters, a value outside
 * `[1, n - 1]` — throws {@link InvalidPrivateKeyError}. Every key-taking
 * entry (`privateKeyToAccount`, `privateKeyToAddress`, `sign`) goes through
 * this one function.
 *
 * @internal
 */
export function parsePrivateKey(privateKey: Hex | string): string {
  if (typeof privateKey !== 'string')
    throw new InvalidPrivateKeyError({ reason: 'type' })
  const trimmed = privateKey.trim()
  const bare = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed
  if (!/^[0-9a-fA-F]{64}$/.test(bare))
    throw new InvalidPrivateKeyError({ reason: 'format' })
  const normalized = bare.toLowerCase()
  if (!secp256k1.utils.isValidPrivateKey(normalized))
    throw new InvalidPrivateKeyError({ reason: 'range' })
  return normalized
}
