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
 * Asserts that `account` can sign, i.e. it is a `local` account (private
 * key, HD or custom source). Actions that sign call this right after
 * resolving the account, so the error is thrown before any request is sent.
 *
 * Only `type: 'local'` passes; any other value, including a missing `type`,
 * throws {@link AccountTypeNotSupportedError}.
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
