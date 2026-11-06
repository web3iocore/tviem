import type { JsonRpcAccount, TronAccount } from '../accounts/types.js'
import {
  InvalidAddressError,
  type InvalidAddressErrorType,
} from '../errors/address.js'
import type { ErrorType } from '../errors/utils.js'
import { isAddress } from '../utils/address/isAddress.js'
import type { Address } from './address.js'

/**
 * Resolves an `account` source to its concrete account type: an address
 * string becomes a {@link JsonRpcAccount}; an account object passes through.
 */
export type ParseAccount<accountOrAddress> = accountOrAddress extends Address
  ? JsonRpcAccount<accountOrAddress>
  : accountOrAddress

export type ParseAccountErrorType = InvalidAddressErrorType | ErrorType

/**
 * Normalizes an `account` source into a {@link TronAccount}, as viem's
 * `parseAccount` does.
 *
 * - A Base58Check `T…` address becomes an address-only {@link JsonRpcAccount}.
 * - An account object is returned as-is.
 *
 * A private key is not an `account` string — wrap it with
 * `privateKeyToAccount()`. An invalid string is refused without echoing it,
 * since it may well be a key passed out of habit.
 */
export function parseAccount<source extends TronAccount | Address>(
  source: source,
): ParseAccount<source> {
  if (typeof source !== 'string') return source as ParseAccount<source>
  if (!isAddress(source))
    throw new InvalidAddressError({
      address: source,
      hideValue: true,
      metaMessages: [
        '- An `account` string must be a "T"-prefixed Base58Check address.',
        '- To sign with a private key, pass `privateKeyToAccount(key)` instead of the key itself.',
      ],
    })
  return { address: source, type: 'json-rpc' } as ParseAccount<source>
}
