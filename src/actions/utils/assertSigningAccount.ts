import type { JsonRpcAccount, TronAccount } from '../../accounts/types.js'
import {
  AccountTypeNotSupportedError,
  type AccountTypeNotSupportedErrorType,
} from '../../errors/rpc.js'
import type { ErrorType } from '../../errors/utils.js'

export type AssertSigningAccountErrorType =
  | AccountTypeNotSupportedErrorType
  | ErrorType

/**
 * Fails unless `account` can sign — i.e. it is a `local` account (private
 * key, HD or custom source). Actions that sign call this right after
 * resolving the account, before any request goes out, so an address-only
 * account is refused without a wasted round trip.
 *
 * Fails closed: anything that is not `type: 'local'` is refused, not only
 * `json-rpc` — a plain-JS caller may pass an object with no `type` at all.
 *
 * @param account The resolved account.
 * @param options `docsPath` — the Action's docs page, for the error.
 */
export function assertSigningAccount(
  account: TronAccount,
  { docsPath }: { docsPath?: string | undefined } = {},
): asserts account is Exclude<TronAccount, JsonRpcAccount> {
  if (account.type === 'local') return
  throw new AccountTypeNotSupportedError({
    docsPath,
    type: String((account as { type?: unknown }).type),
    metaMessages: [
      'This Action signs, and an address-only account cannot.',
      'Pass a signing account instead: `privateKeyToAccount(…)` for a local key, or `toAccount({ … })` around a wallet.',
    ],
  })
}
