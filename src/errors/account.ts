import { BaseError } from './base.js'

export type InvalidPrivateKeyErrorType = InvalidPrivateKeyError & {
  name: 'InvalidPrivateKeyError'
}
/**
 * A private key input is not a secp256k1 private key: as a string it must be
 * 64 hex characters (optionally `0x`-prefixed), and its value must lie in
 * `[1, n - 1]` for the curve order `n`. The message describes the reason and
 * never includes the input.
 */
export class InvalidPrivateKeyError extends BaseError {
  constructor({ reason }: { reason: 'format' | 'range' | 'type' }) {
    super(
      {
        type: 'Invalid private key: expected a string.',
        format:
          'Invalid private key: expected 64 hex characters, optionally 0x-prefixed.',
        range:
          'Invalid private key: the value is outside the secp256k1 range [1, n - 1].',
      }[reason],
      { name: 'InvalidPrivateKeyError' },
    )
  }
}
