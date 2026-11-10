import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'

import { BaseError, type BaseErrorType } from '../errors/base.js'
import type { ErrorType } from '../errors/utils.js'
import {
  type HDOptions,
  type HdKeyToAccountErrorType,
  hdKeyToAccount,
} from './hdKeyToAccount.js'
import type { TronHDAccount } from './types.js'

export type MnemonicToAccountOptions = HDOptions & {
  /**
   * The BIP-39 passphrase, mixed into the seed derivation as PBKDF2 salt.
   * Often nicknamed the "25th word", but it is an arbitrary string — not a
   * wordlist entry, and the phrase itself need not be 24 words.
   *
   * Every value is valid: unlike the mnemonic, which is checksummed and
   * rejected when malformed, a mistyped passphrase silently derives a
   * completely different wallet rather than throwing. Case, whitespace and
   * Unicode form all matter.
   *
   * @default ''
   */
  passphrase?: string | undefined
}

export type MnemonicToAccountErrorType =
  | HdKeyToAccountErrorType
  | BaseErrorType
  | ErrorType

/**
 * Derives a {@link TronHDAccount} from a BIP-39 mnemonic. The phrase is
 * normalized first — trimmed, lower-cased, words separated by a single space,
 * as TronWeb and ethers do — then validated against the English wordlist,
 * expanded to a seed (with the optional `passphrase`), and derived at the TRON
 * path — default `m/44'/195'/0'/0/0` (SLIP-44 coin type `195`). Signing is
 * delegated to the derived private key.
 *
 * @param mnemonic A BIP-39 mnemonic phrase (English wordlist). Case and the
 * amount of whitespace between words do not matter.
 * @param options `passphrase` plus HD derivation indices or an explicit `path`.
 * @returns A {@link TronHDAccount}.
 *
 * @example
 * const account = mnemonicToAccount(mnemonic)
 * account.address // 'T…' (m/44'/195'/0'/0/0)
 *
 * @example
 * // A different address index:
 * mnemonicToAccount(mnemonic, { addressIndex: 1 })
 */
export function mnemonicToAccount(
  mnemonic: string,
  { passphrase, ...hdOptions }: MnemonicToAccountOptions = {},
): TronHDAccount {
  // The passphrase enters the seed as-is (every string is a distinct wallet),
  // so only a string — or no passphrase at all — is accepted.
  if (passphrase !== undefined && typeof passphrase !== 'string')
    throw new BaseError(
      `Invalid passphrase: expected a string or undefined, got ${passphrase === null ? 'null' : typeof passphrase}.`,
    )
  if (typeof mnemonic !== 'string')
    throw new BaseError(
      `Invalid mnemonic: expected a string, got ${mnemonic === null ? 'null' : typeof mnemonic}.`,
    )
  const phrase = mnemonic.trim().toLowerCase().split(/\s+/).join(' ')
  if (!validateMnemonic(phrase, wordlist))
    throw new BaseError(
      'Invalid mnemonic: the phrase is not a valid BIP-39 English mnemonic.',
    )
  const seed = mnemonicToSeedSync(phrase, passphrase)
  return hdKeyToAccount(HDKey.fromMasterSeed(seed), hdOptions)
}
