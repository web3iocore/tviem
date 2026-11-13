import type { TronAccount } from '../../accounts/types.js'
import type { Client } from '../../clients/createClient.js'
import {
  AccountNotFoundError,
  type AccountNotFoundErrorType,
} from '../../errors/rpc.js'
import type { ErrorType } from '../../errors/utils.js'
import {
  type ParseAccountErrorType,
  parseAccount,
} from '../../types/account.js'
import type { Address } from '../../types/address.js'
import {
  type AddressToHexErrorType,
  addressToHex,
} from '../../utils/address/addressToHex.js'
import {
  type Int64InputToBigIntErrorType,
  int64InputToBigInt,
} from '../../utils/transaction/int64.js'
import {
  ContractType,
  contractTypeUrlPrefix,
} from '../../utils/transaction/registry.js'
import type { RawContractInput } from '../../utils/transaction/serializeRawData.js'
import type { ProposalDeleteContractInput } from '../../utils/transaction/types.js'
import {
  type BuildAndBroadcastErrorType,
  type BuildAndBroadcastReturnType,
  buildAndBroadcast,
} from './utils/buildAndBroadcast.js'
import {
  type BuildTransactionErrorType,
  type BuildTransactionReturnType,
  buildTransaction,
  type MemoInput,
  type TransactionHeader,
} from './utils/buildTransaction.js'

export type DeleteProposalParameters = {
  /**
   * The owner (proposer) account (falls back to `client.account`). Signing needs
   * a local account; the `build*` form only reads its address, so an
   * address string works there.
   */
  account?: TronAccount | Address | undefined
  /** Id of the proposal to delete. */
  proposalId: bigint | number
  /**
   * A pre-derived TaPoS + timing header. When supplied the transaction is built
   * fully offline against it; otherwise it is derived from the latest block.
   */
  blockHeader?: TransactionHeader | undefined
  /**
   * Transaction lifetime in ms, applied to the chain-derived timestamp
   * (`expiration = refBlock.timestamp + expirationMs`). Positive integer,
   * at most 86_400_000 (24h). Ignored when a complete `blockHeader` is
   * supplied. @default 60_000
   */
  expirationMs?: bigint | number | undefined
  /**
   * Optional memo written to `raw_data.data` (`0x` hex or bytes). Enters the
   * signed bytes; the chain charges a memo fee (`getMemoFee`, 1 TRX on
   * mainnet and Nile) on top of the transaction's normal costs.
   */
  memo?: MemoInput | undefined
}
export type DeleteProposalReturnType = BuildAndBroadcastReturnType

export type DeleteProposalErrorType =
  | AccountNotFoundErrorType
  | BuildAndBroadcastErrorType
  | Int64InputToBigIntErrorType
  | ParseAccountErrorType
  | AddressToHexErrorType
  | ErrorType

export type BuildDeleteProposalParameters = DeleteProposalParameters & {
  /** Multi-sig permission id (`Contract.Permission_id`). */
  permissionId?: number | undefined
}
export type BuildDeleteProposalReturnType = BuildTransactionReturnType

export type BuildDeleteProposalErrorType =
  | AccountNotFoundErrorType
  | BuildTransactionErrorType
  | Int64InputToBigIntErrorType
  | ParseAccountErrorType
  | AddressToHexErrorType
  | ErrorType

/** The signing account plus the assembled `ProposalDeleteContract`. */
function assemble(
  client: Client,
  parameters: DeleteProposalParameters,
): { account: TronAccount; contract: RawContractInput } {
  const { proposalId } = parameters

  // Resolve the owner/signing account (per-call, else hoisted on the Client).
  const source = parameters.account ?? client.account
  if (!source) throw new AccountNotFoundError()
  const account = parseAccount(source)

  const value: ProposalDeleteContractInput = {
    owner_address: addressToHex(account.address),
    proposal_id: int64InputToBigInt('proposalId', proposalId),
  }

  const contract: RawContractInput = {
    type: ContractType.ProposalDeleteContract,
    parameter: {
      type_url: `${contractTypeUrlPrefix}ProposalDeleteContract`,
      value,
    },
  }

  return { account, contract }
}

/**
 * Builds an **unsigned** `ProposalDeleteContract` transaction (§ type 18) and
 * returns it in java-tron's HTTP JSON shape (`{ visible,
 * txID, raw_data, raw_data_hex }`) — the build half of {@link deleteProposal},
 * without signing or broadcasting. Pass `permissionId` to bind it to an
 * active/owner permission. The node is used only to fetch the latest block
 * (TaPoS).
 *
 * @param client The Client to use.
 * @param parameters Proposal id, optional account/permissionId/blockHeader.
 * @returns An unsigned transaction ({@link BuildTransactionReturnType}).
 */
export async function buildDeleteProposal(
  client: Client,
  parameters: BuildDeleteProposalParameters,
): Promise<BuildDeleteProposalReturnType> {
  const { contract } = assemble(client, parameters)
  return buildTransaction(client, {
    contract,
    permissionId: parameters.permissionId,
    blockHeader: parameters.blockHeader,
    expirationMs: parameters.expirationMs,
    memo: parameters.memo,
  })
}

/**
 * Deletes a governance proposal by locally building, signing and broadcasting a
 * `ProposalDeleteContract` (§ type 18).
 *
 * @param client The Client to use.
 * @param parameters Proposal id, optional account/blockHeader.
 * @returns `{ txID, result, code, message }` — the locally computed
 * transaction id plus the node's acknowledgement fields, when echoed.
 */
export async function deleteProposal(
  client: Client,
  parameters: DeleteProposalParameters,
): Promise<DeleteProposalReturnType> {
  const { account, contract } = assemble(client, parameters)
  return buildAndBroadcast(client, {
    contract,
    account,
    blockHeader: parameters.blockHeader,
    expirationMs: parameters.expirationMs,
    memo: parameters.memo,
  })
}
