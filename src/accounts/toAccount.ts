import { BaseError, type BaseErrorType } from '../errors/base.js'
import type { ErrorType } from '../errors/utils.js'
import { type ParseAccountErrorType, parseAccount } from '../types/account.js'
import type { Address } from '../types/address.js'
import type {
  JsonRpcAccount,
  TronCustomAccount,
  TronCustomSource,
} from './types.js'

export type ToAccountErrorType =
  | ParseAccountErrorType
  | BaseErrorType
  | ErrorType

/**
 * Creates an account from an address or a caller-supplied signing source, as
 * viem's `toAccount` does.
 *
 * - Passing a Base58Check **address** yields an address-only
 *   {@link JsonRpcAccount}. A private key is not accepted here — use
 *   `privateKeyToAccount()`.
 * - Passing a **custom source** (an object carrying an `address` plus its own
 *   `signMessage`/`signTypedData`/`signTransaction` functions) completes it into a
 *   {@link TronCustomAccount} by attaching the `source: 'custom'` /
 *   `type: 'local'` discriminants. This is the shape wallet adapters plug
 *   into. The source may be a plain object or a class
 *   instance: its methods are bound to it, so ones defined on a prototype
 *   keep their `this`. Only the {@link TronCustomSource} members are carried
 *   over — anything else the source holds stays on the source.
 *
 * @param source A Base58Check address, or a {@link TronCustomSource}.
 * @returns The completed account.
 *
 * @example
 * // From an address:
 * toAccount('T...') // { address: 'T...', type: 'json-rpc' }
 *
 * @example
 * // From a custom source:
 * toAccount({ address, publicKey, signMessage, signTypedData, signTransaction })
 */
export function toAccount<address extends Address>(
  source: address,
): JsonRpcAccount<address>
export function toAccount(source: TronCustomSource): TronCustomAccount
export function toAccount(
  source: Address | TronCustomSource,
): JsonRpcAccount | TronCustomAccount {
  if (typeof source === 'string') return parseAccount(source)

  // Read `address` once and pin that value into the account, so the account
  // can never carry an address the type check did not see.
  const address = source?.address
  if (!source || typeof address !== 'string')
    throw new BaseError(
      'Invalid account source: expected a Base58Check address or a custom source with an `address`.',
    )
  // A custom source provides all three signing methods; an address-only
  // account is created from the address string instead.
  for (const method of [
    'signMessage',
    'signTypedData',
    'signTransaction',
  ] as const)
    if (typeof source[method] !== 'function')
      throw new BaseError(
        `Invalid account source: \`${method}\` must be a function. For an address-only account, pass the address string instead.`,
      )

  // The account surface is listed member by member rather than spread from
  // the source. A spread copies own enumerable properties only, so a class
  // instance — state on the instance, signing methods on its prototype —
  // would come out with no signing methods at all; it would also carry along
  // whatever else the source holds (a key, a transport) into an object that
  // gets passed around as "the account". Each member is read exactly once.
  const multiSign = bindTo(source, source.multiSign)
  return {
    address,
    publicKey: source.publicKey,
    signMessage: bindTo(source, source.signMessage),
    signTypedData: bindTo(source, source.signTypedData),
    signTransaction: bindTo(source, source.signTransaction),
    ...(multiSign !== undefined ? { multiSign } : {}),
    source: 'custom',
    type: 'local',
  }
}

/**
 * Binds a source's method to the source, so a prototype method still reaches
 * its instance state through `this` once it is called as `account.method()`.
 * A no-op for closures and arrow functions. A non-function is passed through
 * untouched: a missing member fails where it is called, as it always has.
 */
function bindTo<member>(source: TronCustomSource, member: member): member {
  return typeof member === 'function' ? member.bind(source) : member
}
