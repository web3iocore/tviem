import type { Address } from './address.js'
import type { Hex } from './misc.js'

/** Coarse execution status derived from a transaction receipt. */
export type TransactionStatus = 'success' | 'reverted'

/** A decoded event log entry from a transaction receipt. */
export type TransactionLog = {
  /** Emitting contract address, Base58Check-encoded, if present. */
  address?: Address | undefined
  /** Indexed topics, each `0x`-prefixed. */
  topics: readonly Hex[]
  /** Non-indexed data, `0x`-prefixed. */
  data: Hex
}

/**
 * The execution result java-tron records on a contract transaction's receipt
 * (`receipt.result`). Known values are listed; the type stays open for values
 * a newer node may add.
 */
export type TransactionResult =
  | 'DEFAULT'
  | 'SUCCESS'
  | 'REVERT'
  | 'BAD_JUMP_DESTINATION'
  | 'OUT_OF_MEMORY'
  | 'PRECOMPILED_CONTRACT'
  | 'STACK_TOO_SMALL'
  | 'STACK_TOO_LARGE'
  | 'ILLEGAL_OPERATION'
  | 'STACK_OVERFLOW'
  | 'OUT_OF_ENERGY'
  | 'OUT_OF_TIME'
  | 'JVM_STACK_OVER_FLOW'
  | 'UNKNOWN'
  | 'TRANSFER_FAILED'
  | 'INVALID_CODE'
  | (string & {})

/** A transfer made by a contract during execution (`internal_transactions[]`). */
export type InternalTransaction = {
  /** Internal transaction hash (64 hex chars, no `0x`). */
  hash: string
  /** The contract that made the transfer, Base58Check-encoded. */
  callerAddress?: Address | undefined
  /** The recipient, Base58Check-encoded. */
  transferToAddress?: Address | undefined
  /** Amounts transferred: TRX (no `tokenId`) or a TRC10 token (`tokenId`). */
  callValueInfo: readonly {
    callValue: bigint
    tokenId?: string | undefined
  }[]
  /** The call kind as the node records it (`call`, `create`, `suicide`, …). */
  note?: string | undefined
  /** Whether the transfer was rolled back. */
  rejected: boolean
}

/**
 * A formatted transaction receipt / execution info (mapped from a
 * `gettransactioninfobyid` response). All resource / fee amounts are in SUN.
 */
export type TransactionInfo = {
  /** Transaction id (64 hex chars, no `0x`). */
  id: string
  /** Number of the block the transaction was included in. */
  blockNumber: bigint
  /** Timestamp (ms) of the including block. */
  blockTimeStamp: bigint
  /** Coarse execution status (`'success'` | `'reverted'`). */
  status: TransactionStatus
  /** Total fee burned (SUN). */
  fee: bigint
  /** Energy consumed by the caller. */
  energyUsage: bigint
  /** Total energy consumed (caller + contract origin). */
  energyUsageTotal: bigint
  /** Energy fee burned (SUN). */
  energyFee: bigint
  /** Bandwidth (net) consumed. */
  netUsage: bigint
  /** Bandwidth (net) fee burned (SUN). */
  netFee: bigint
  /** Energy consumed from the contract's origin (SUN-free energy). */
  originEnergyUsage: bigint
  /** Energy penalty applied for a busy contract. */
  energyPenaltyTotal: bigint
  /** Fee for packing the transaction (SUN). */
  packingFee: bigint
  /**
   * The precise execution result (`receipt.result`), present on contract
   * transactions. `status` is derived from it.
   */
  result?: TransactionResult | undefined
  /** The node's failure message (`resMessage`), hex as returned. */
  resMessage?: string | undefined
  /**
   * The revert reason, when the transaction reverted with one: the
   * `Error(string)` text decoded from `contractResult[0]`, otherwise the
   * UTF-8 decoding of `resMessage`.
   */
  revertReason?: string | undefined
  /** Raw ABI-encoded return values (bare hex, no `0x`). */
  contractResult: readonly string[]
  /** Contract address for a contract call, Base58Check-encoded. */
  contractAddress?: Address | undefined
  /** Emitted event logs. */
  logs: readonly TransactionLog[]
  /** Transfers made by contracts during execution. */
  internalTransactions: readonly InternalTransaction[]
}
