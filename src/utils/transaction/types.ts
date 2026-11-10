import { BaseError, type BaseErrorType } from '../../errors/base.js'
import type { ErrorType } from '../../errors/utils.js'
import type { AddressInput } from '../../types/address.js'
import type { ByteArray } from '../../types/misc.js'

/**
 * Any accepted address input form: Base58Check (`T…`), TRON hex (`41…`),
 * EVM hex (`0x…`), or the raw 21/20-byte payload. The canonical (decoded)
 * form is always the TRON hex form (`41…`, lowercase, no `0x` prefix) —
 * exactly what java-tron's `visible: false` JSON carries.
 */
export type ContractAddressInput = AddressInput | ByteArray

/**
 * Bytes field input: hex (`0x`-prefixed or bare) or raw bytes. The canonical
 * (decoded) form is always bare lowercase hex, matching java-tron's
 * `visible: false` JSON. Text-friendly inputs (e.g. a TRC10 asset name as
 * UTF-8) are an action-parameter convenience, encoded to hex before they
 * enter the model.
 */
export type BytesInput = string | ByteArray

/**
 * `int64` field input: `bigint`, `number`, or a decimal string. The
 * canonical (decoded) form is a JSON number within `±(2^53 − 1)` and a
 * decimal string beyond — see `int64ToJson`.
 */
export type Int64 = bigint | number | string

/** Resource type staked/delegated on TRON (wire values). */
export const ResourceCode = {
  BANDWIDTH: 0,
  ENERGY: 1,
} as const
export type ResourceCode = (typeof ResourceCode)[keyof typeof ResourceCode]

/** `ResourceType` enum names as java-tron's JSON renders them (index = wire value). */
export const ResourceCodeName = ['BANDWIDTH', 'ENERGY'] as const
export type ResourceCodeName = (typeof ResourceCodeName)[number]

export type ResourceCodeOfErrorType = BaseErrorType | ErrorType

/**
 * Resolves a staking resource name to its wire value, throwing on anything
 * else. Guards the untyped-JS path: indexing `ResourceCode` with a name the
 * enum does not carry ('TRON_POWER', a typo, wrong case) yields `undefined`,
 * which the protobuf writer drops — silently building a transaction for the
 * proto3-default resource (BANDWIDTH) instead of the one the caller named.
 *
 * Membership is an own-property test, not an `undefined` test: `ResourceCode`
 * is a plain object literal, so `'constructor'`, `'toString'`, `'__proto__'`
 * and the other inherited `Object.prototype` names index to a function (or
 * the prototype itself), never `undefined`. Those would pass a truthiness
 * guard and only fail deep inside serialization, as an int64 error naming
 * the wrong layer.
 */
export function resourceCodeOf(name: ResourceCodeName): ResourceCode {
  if (!Object.hasOwn(ResourceCode, name))
    throw new BaseError(
      `Invalid staking resource "${name}". Expected one of: ${ResourceCodeName.join(', ')}.`,
    )
  return ResourceCode[name]
}

/** `Permission.PermissionType` (wire values). */
export const PermissionType = {
  OWNER: 0,
  WITNESS: 1,
  ACTIVE: 2,
} as const
export type PermissionType =
  (typeof PermissionType)[keyof typeof PermissionType]

/** `PermissionType` enum names as java-tron's JSON renders them. */
export const PermissionTypeName = ['Owner', 'Witness', 'Active'] as const
export type PermissionTypeName = (typeof PermissionTypeName)[number]

/** `AccountType` enum names as java-tron's JSON renders them. */
export const AccountTypeName = ['Normal', 'AssetIssue', 'Contract'] as const
export type AccountTypeName = (typeof AccountTypeName)[number]

/** `SmartContract.ABI.Entry.EntryType` (wire values). */
export const EntryType = {
  UNKNOWN_ENTRY_TYPE: 0,
  CONSTRUCTOR: 1,
  FUNCTION: 2,
  EVENT: 3,
  FALLBACK: 4,
  RECEIVE: 5,
  ERROR: 6,
} as const
export type EntryType = (typeof EntryType)[keyof typeof EntryType]

/** `EntryType` enum names as java-tron's JSON renders them. */
export const EntryTypeName = [
  'UnknownEntryType',
  'Constructor',
  'Function',
  'Event',
  'Fallback',
  'Receive',
  'Error',
] as const
export type EntryTypeName = (typeof EntryTypeName)[number]

/** `SmartContract.ABI.Entry.StateMutabilityType` (wire values). */
export const StateMutabilityType = {
  UNKNOWN_MUTABILITY_TYPE: 0,
  PURE: 1,
  VIEW: 2,
  NONPAYABLE: 3,
  PAYABLE: 4,
} as const
export type StateMutabilityType =
  (typeof StateMutabilityType)[keyof typeof StateMutabilityType]

/** `StateMutabilityType` enum names as java-tron's JSON renders them. */
export const StateMutabilityTypeName = [
  'UnknownMutabilityType',
  'Pure',
  'View',
  'Nonpayable',
  'Payable',
] as const
export type StateMutabilityTypeName = (typeof StateMutabilityTypeName)[number]

/** `TransferContract` (contract type 1) — TRX transfer. */
type TransferContractBase<address = ContractAddressInput, int64 = Int64> = {
  /** Sender address (field 1). */
  owner_address: address
  /** Recipient address (field 2). */
  to_address: address
  /** Amount in SUN (field 3, `int64`). */
  amount: int64
}
/** Encode-side spelling of {@link TransferContract}: wide address, int64 and bytes inputs. */
export type TransferContractInput = TransferContractBase
/**
 * Decoded `TransferContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type TransferContract = TransferContractBase<string, number | string>

/** `TransferAssetContract` (contract type 2) — TRC10 transfer. */
type TransferAssetContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** TRC10 asset name/id (field 1, `bytes`, hex). */
  asset_name: bytes
  /** Sender address (field 2). */
  owner_address: address
  /** Recipient address (field 3). */
  to_address: address
  /** Amount in the asset's smallest unit (field 4, `int64`). */
  amount: int64
}
/** Encode-side spelling of {@link TransferAssetContract}: wide address, int64 and bytes inputs. */
export type TransferAssetContractInput = TransferAssetContractBase
/**
 * Decoded `TransferAssetContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type TransferAssetContract = TransferAssetContractBase<
  string,
  number | string,
  string
>

/** A single vote inside `VoteWitnessContract` (`Vote` message). */
type VoteBase<address = ContractAddressInput, int64 = Int64> = {
  /** Witness address voted for (field 1). */
  vote_address: address
  /** Number of votes (field 2, `int64`). */
  vote_count: int64
}
/** Encode-side spelling of {@link Vote}: wide address and int64 inputs. */
export type VoteInput = VoteBase
/**
 * Decoded `Vote`, as `decodeRawData` and the node return it: the address as a
 * `41`-hex string (Base58 is accepted too), the count as `number` (a decimal
 * string past 2^53).
 */
export type Vote = VoteBase<string, number | string>

/** `VoteWitnessContract` (contract type 4). */
type VoteWitnessContractBase<address = ContractAddressInput, int64 = Int64> = {
  /** Voter address (field 1). */
  owner_address: address
  /** Votes (field 2, repeated). */
  votes?: VoteBase<address, int64>[] | undefined
  /** Support flag (field 3, `bool`). */
  support?: boolean | undefined
}
/** Encode-side spelling of {@link VoteWitnessContract}: wide address, int64 and bytes inputs. */
export type VoteWitnessContractInput = VoteWitnessContractBase
/**
 * Decoded `VoteWitnessContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type VoteWitnessContract = VoteWitnessContractBase<
  string,
  number | string
>

/** `WithdrawBalanceContract` (contract type 13) — withdraw block rewards. */
type WithdrawBalanceContractBase<address = ContractAddressInput> = {
  /** Account address (field 1). */
  owner_address: address
}
/** Encode-side spelling of {@link WithdrawBalanceContract}: wide address, int64 and bytes inputs. */
export type WithdrawBalanceContractInput = WithdrawBalanceContractBase
/**
 * Decoded `WithdrawBalanceContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type WithdrawBalanceContract = WithdrawBalanceContractBase<string>

/** `UpdateBrokerageContract` (type 49). */
type UpdateBrokerageContractBase<address = ContractAddressInput> = {
  /** Witness account address (field 1). */
  owner_address: address
  /** New brokerage percentage, 0..100 (field 2, `int32`). */
  brokerage?: number | undefined
}
/** Encode-side spelling of {@link UpdateBrokerageContract}: wide address, int64 and bytes inputs. */
export type UpdateBrokerageContractInput = UpdateBrokerageContractBase
/**
 * Decoded `UpdateBrokerageContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UpdateBrokerageContract = UpdateBrokerageContractBase<string>

/** `SmartContract.ABI.Entry.Param`. */
export type SmartContractAbiParam = {
  /** Whether the parameter is indexed (field 1, `bool`). */
  indexed?: boolean | undefined
  /** Parameter name (field 2, `string`). */
  name?: string | undefined
  /** Parameter type (field 3, `string`). */
  type?: string | undefined
}
/** Encode-side spelling of {@link SmartContractAbiParam} (no address, int64 or bytes fields: the same type). */
export type SmartContractAbiParamInput = SmartContractAbiParam

/** `SmartContract.ABI.Entry`. */
export type SmartContractAbiEntry = {
  /** Whether the event is anonymous (field 1, `bool`). */
  anonymous?: boolean | undefined
  /** Whether the entry is constant (field 2, `bool`). */
  constant?: boolean | undefined
  /** Entry name (field 3, `string`). */
  name?: string | undefined
  /** Input parameters (field 4, repeated). */
  inputs?: SmartContractAbiParam[] | undefined
  /** Output parameters (field 5, repeated). */
  outputs?: SmartContractAbiParam[] | undefined
  /** Entry type (field 6, enum — see `EntryTypeName`). */
  type?: EntryTypeName | number | undefined
  /** Whether the entry is payable (field 7, `bool`). */
  payable?: boolean | undefined
  /**
   * State mutability (field 8, enum — see `StateMutabilityTypeName`).
   * NOTE: java-tron keeps this proto field camelCase (it mirrors the
   * Solidity JSON ABI), so the JSON key is `stateMutability` verbatim.
   */
  stateMutability?: StateMutabilityTypeName | number | undefined
}
/** Encode-side spelling of {@link SmartContractAbiEntry} (no address, int64 or bytes fields: the same type). */
export type SmartContractAbiEntryInput = SmartContractAbiEntry

/** `SmartContract.ABI`. `entrys` is java-tron's own spelling. */
export type SmartContractAbi = {
  /** ABI entries (field 1, repeated). */
  entrys?: SmartContractAbiEntry[] | undefined
}
/** Encode-side spelling of {@link SmartContractAbi} (no address, int64 or bytes fields: the same type). */
export type SmartContractAbiInput = SmartContractAbi

/** `SmartContract` (nested in `CreateSmartContract`). */
type SmartContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Contract creator address (field 1). */
  origin_address?: address | undefined
  /** Contract address (field 2). */
  contract_address?: address | undefined
  /** Contract ABI (field 3). */
  abi?: SmartContractAbi | undefined
  /** Deployment bytecode (field 4, `bytes`). */
  bytecode?: bytes | undefined
  /**
   * TRX sent with the deployment, in SUN (field 5, `int64`). Note the
   * deployment call value lives here, not on `CreateSmartContract`.
   */
  call_value?: int64 | undefined
  /** Percentage of energy consumed by the caller (field 6, `int64`). */
  consume_user_resource_percent?: int64 | undefined
  /** Contract name (field 7, `string`). */
  name?: string | undefined
  /** Creator energy limit (field 8, `int64`). */
  origin_energy_limit?: int64 | undefined
  /** Code hash (field 9, `bytes`). */
  code_hash?: bytes | undefined
  /** Transaction hash (field 10, `bytes`). */
  trx_hash?: bytes | undefined
  /** Contract version (field 11, `int32`). */
  version?: number | undefined
}
/** Encode-side spelling of {@link SmartContract}: wide address, int64 and bytes inputs. */
export type SmartContractInput = SmartContractBase
/**
 * Decoded `SmartContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type SmartContract = SmartContractBase<string, number | string, string>

/** `CreateSmartContract` (contract type 30). */
type CreateSmartContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Deployer address (field 1). */
  owner_address: address
  /** Contract to deploy (field 2). */
  new_contract?: SmartContractBase<address, int64, bytes> | undefined
  /** TRC10 amount sent with the deployment (field 3, `int64`). */
  call_token_value?: int64 | undefined
  /** TRC10 token id (field 4, `int64`). */
  token_id?: int64 | undefined
}
/** Encode-side spelling of {@link CreateSmartContract}: wide address, int64 and bytes inputs. */
export type CreateSmartContractInput = CreateSmartContractBase
/**
 * Decoded `CreateSmartContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type CreateSmartContract = CreateSmartContractBase<
  string,
  number | string,
  string
>

/** `TriggerSmartContract` (contract type 31). */
type TriggerSmartContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Caller address (field 1). */
  owner_address: address
  /** Contract address (field 2). */
  contract_address: address
  /** TRX sent with the call, in SUN (field 3, `int64`). */
  call_value?: int64 | undefined
  /** Call data (field 4, `bytes`). */
  data?: bytes | undefined
  /** TRC10 amount sent with the call (field 5, `int64`). */
  call_token_value?: int64 | undefined
  /** TRC10 token id (field 6, `int64`). */
  token_id?: int64 | undefined
}
/** Encode-side spelling of {@link TriggerSmartContract}: wide address, int64 and bytes inputs. */
export type TriggerSmartContractInput = TriggerSmartContractBase
/**
 * Decoded `TriggerSmartContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type TriggerSmartContract = TriggerSmartContractBase<
  string,
  number | string,
  string
>

/** `Permission.Key` — a signer address and its weight. */
type PermissionKeyBase<address = ContractAddressInput, int64 = Int64> = {
  /** Signer address (field 1). */
  address: address
  /** Signature weight (field 2, `int64`). */
  weight: int64
}
/** Encode-side spelling of {@link PermissionKey}: wide address and int64 inputs. */
export type PermissionKeyInput = PermissionKeyBase
/**
 * Decoded `PermissionKey`, as `decodeRawData` and the node return it: the
 * address as a `41`-hex string (Base58 is accepted too), the weight as
 * `number` (a decimal string past 2^53).
 */
export type PermissionKey = PermissionKeyBase<string, number | string>

/** `Permission` (nested in `AccountPermissionUpdateContract`). */
type PermissionBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Permission type (field 1, enum — see `PermissionTypeName`). */
  type?: PermissionTypeName | number | undefined
  /** Permission id (field 2, `int32`). */
  id?: number | undefined
  /** Permission name (field 3, `string`). */
  permission_name?: string | undefined
  /** Signature weight threshold (field 4, `int64`). */
  threshold?: int64 | undefined
  /** Parent permission id (field 5, `int32`). */
  parent_id?: number | undefined
  /** Allowed contract types, as a 32-byte bitmap (field 6, `bytes`). */
  operations?: bytes | undefined
  /** Signer keys (field 7, repeated). */
  keys?: PermissionKeyBase<address, int64>[] | undefined
}
/**
 * Encode-side spelling of {@link Permission}: wide address, int64 and bytes
 * inputs. Named `…MessageInput` because `PermissionInput` is the
 * `accountPermissionUpdate` action's parameter type.
 */
export type PermissionMessageInput = PermissionBase
/**
 * Decoded `Permission`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type Permission = PermissionBase<string, number | string, string>

/** `AccountPermissionUpdateContract` (contract type 46). */
type AccountPermissionUpdateContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Account address (field 1). */
  owner_address: address
  /** Owner permission (field 2). */
  owner?: PermissionBase<address, int64, bytes> | undefined
  /** Witness permission (field 3). */
  witness?: PermissionBase<address, int64, bytes> | undefined
  /** Active permissions (field 4, repeated). */
  actives?: PermissionBase<address, int64, bytes>[] | undefined
}
/** Encode-side spelling of {@link AccountPermissionUpdateContract}: wide address, int64 and bytes inputs. */
export type AccountPermissionUpdateContractInput =
  AccountPermissionUpdateContractBase
/**
 * Decoded `AccountPermissionUpdateContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type AccountPermissionUpdateContract =
  AccountPermissionUpdateContractBase<string, number | string, string>

/** `FreezeBalanceContract` (contract type 11) — Stake 1.0 freeze. */
type FreezeBalanceContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Account address (field 1). */
  owner_address: address
  /** Amount to freeze, in SUN (field 2, `int64`). */
  frozen_balance: int64
  /** Freeze duration, in days (field 3, `int64`). */
  frozen_duration: int64
  /** Resource type (field 10, enum — see `ResourceCodeName`). */
  resource?: ResourceCodeName | number | undefined
  /** Recipient address the resource is obtained for (field 15). */
  receiver_address?: address | undefined
}
/** Encode-side spelling of {@link FreezeBalanceContract}: wide address, int64 and bytes inputs. */
export type FreezeBalanceContractInput = FreezeBalanceContractBase
/**
 * Decoded `FreezeBalanceContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type FreezeBalanceContract = FreezeBalanceContractBase<
  string,
  number | string
>

/** `UnfreezeBalanceContract` (contract type 12) — Stake 1.0 unfreeze. */
type UnfreezeBalanceContractBase<address = ContractAddressInput> = {
  /** Account address (field 1). */
  owner_address: address
  /** Resource type (field 10, enum — see `ResourceCodeName`). */
  resource?: ResourceCodeName | number | undefined
  /** Recipient address the resource was obtained for (field 15). */
  receiver_address?: address | undefined
}
/** Encode-side spelling of {@link UnfreezeBalanceContract}: wide address, int64 and bytes inputs. */
export type UnfreezeBalanceContractInput = UnfreezeBalanceContractBase
/**
 * Decoded `UnfreezeBalanceContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UnfreezeBalanceContract = UnfreezeBalanceContractBase<string>

/** `ParticipateAssetIssueContract` (contract type 9) — buy a TRC10 token. */
type ParticipateAssetIssueContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Buyer address (field 1). */
  owner_address: address
  /** Token issuer address (field 2). */
  to_address: address
  /** TRC10 asset name/id (field 3, `bytes`, hex). */
  asset_name: bytes
  /** Amount of TRX paid, in SUN (field 4, `int64`). */
  amount: int64
}
/** Encode-side spelling of {@link ParticipateAssetIssueContract}: wide address, int64 and bytes inputs. */
export type ParticipateAssetIssueContractInput =
  ParticipateAssetIssueContractBase
/**
 * Decoded `ParticipateAssetIssueContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ParticipateAssetIssueContract = ParticipateAssetIssueContractBase<
  string,
  number | string,
  string
>

/** `AssetIssueContract.FrozenSupply` — a staked-supply tranche. */
type AssetIssueFrozenSupplyBase<int64 = Int64> = {
  /** Amount of the token supply frozen (field 1, `int64`). */
  frozen_amount: int64
  /** Freeze duration, in days (field 2, `int64`). */
  frozen_days: int64
}
/** Encode-side spelling of {@link AssetIssueFrozenSupply}: wide int64 inputs. */
export type AssetIssueFrozenSupplyInput = AssetIssueFrozenSupplyBase
/**
 * Decoded `AssetIssueFrozenSupply`, as `decodeRawData` and the node return
 * it: int64 fields as `number` (a decimal string past 2^53).
 */
export type AssetIssueFrozenSupply = AssetIssueFrozenSupplyBase<number | string>

/** `AssetIssueContract` (contract type 6) — create a TRC10 token. */
type AssetIssueContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Issuer address (field 1). */
  owner_address: address
  /** Token name (field 2, `bytes`, hex). */
  name: bytes
  /** Token abbreviation (field 3, `bytes`, hex). */
  abbr: bytes
  /** Total supply (field 4, `int64`). */
  total_supply: int64
  /** Staked-supply tranches (field 5, repeated). */
  frozen_supply?: AssetIssueFrozenSupplyBase<int64>[] | undefined
  /**
   * SUN side of the ICO price ratio `trx_num : num` (field 6, `int32`). In
   * SUN, not TRX: the chain mints `amountSun * num / trx_num` tokens for a
   * purchase of `amountSun` (`ParticipateAssetIssueActuator`).
   */
  trx_num: number
  /** Number of token decimals (field 7, `int32`). */
  precision?: number | undefined
  /** Token side of the ICO price ratio `trx_num : num` (field 8, `int32`). */
  num: number
  /** ICO start time, ms (field 9, `int64`). */
  start_time: int64
  /** ICO end time, ms (field 10, `int64`). */
  end_time: int64
  /** Unused by java-tron; kept for wire compatibility (field 11, `int64`). */
  order?: int64 | undefined
  /** Vote score (field 16, `int32`). */
  vote_score?: number | undefined
  /** Token description (field 20, `bytes`, hex). */
  description?: bytes | undefined
  /** Token website URL (field 21, `bytes`, hex). */
  url: bytes
  /** Free bandwidth cap per holder, per rolling 24h (field 22, `int64`). */
  free_asset_net_limit?: int64 | undefined
  /**
   * Total free bandwidth shared by all holders, per rolling 24h (field 23,
   * `int64`).
   */
  public_free_asset_net_limit?: int64 | undefined
  /** Shared free bandwidth already consumed (field 24, `int64`). */
  public_free_asset_net_usage?: int64 | undefined
  /** Last shared free-bandwidth consumption time, ms (field 25, `int64`). */
  public_latest_free_net_time?: int64 | undefined
  /** Chain-assigned TRC10 token id (field 41, `string`). */
  id?: string | undefined
}
/** Encode-side spelling of {@link AssetIssueContract}: wide address, int64 and bytes inputs. */
export type AssetIssueContractInput = AssetIssueContractBase
/**
 * Decoded `AssetIssueContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type AssetIssueContract = AssetIssueContractBase<
  string,
  number | string,
  string
>

/** `UpdateAssetContract` (contract type 15) — update a TRC10 token. */
/** `UnfreezeAssetContract` (type 14) — unfreeze an issued TRC10 asset. */
type UnfreezeAssetContractBase<address = ContractAddressInput> = {
  /** Issuer address (field 1). */
  owner_address: address
}
/** Encode-side spelling of {@link UnfreezeAssetContract}: wide address, int64 and bytes inputs. */
export type UnfreezeAssetContractInput = UnfreezeAssetContractBase
/**
 * Decoded `UnfreezeAssetContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UnfreezeAssetContract = UnfreezeAssetContractBase<string>

type UpdateAssetContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Issuer address (field 1). */
  owner_address: address
  /** New token description (field 2, `bytes`, hex). */
  description?: bytes | undefined
  /** New token website URL (field 3, `bytes`, hex). */
  url?: bytes | undefined
  /** New per-holder free bandwidth cap, per rolling 24h (field 4, `int64`). */
  new_limit?: int64 | undefined
  /**
   * New total free bandwidth shared by all holders, per rolling 24h (field 5,
   * `int64`).
   */
  new_public_limit?: int64 | undefined
}
/** Encode-side spelling of {@link UpdateAssetContract}: wide address, int64 and bytes inputs. */
export type UpdateAssetContractInput = UpdateAssetContractBase
/**
 * Decoded `UpdateAssetContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UpdateAssetContract = UpdateAssetContractBase<
  string,
  number | string,
  string
>

/** `FreezeBalanceV2Contract` (contract type 54) — stake 2.0 freeze. */
type FreezeBalanceV2ContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Account address (field 1). */
  owner_address: address
  /** Amount to freeze, in SUN (field 2, `int64`). */
  frozen_balance: int64
  /** Resource type (field 3, enum — see `ResourceCodeName`). */
  resource?: ResourceCodeName | number | undefined
}
/** Encode-side spelling of {@link FreezeBalanceV2Contract}: wide address, int64 and bytes inputs. */
export type FreezeBalanceV2ContractInput = FreezeBalanceV2ContractBase
/**
 * Decoded `FreezeBalanceV2Contract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type FreezeBalanceV2Contract = FreezeBalanceV2ContractBase<
  string,
  number | string
>

/** `UnfreezeBalanceV2Contract` (contract type 55) — stake 2.0 unfreeze. */
type UnfreezeBalanceV2ContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Account address (field 1). */
  owner_address: address
  /** Amount to unfreeze, in SUN (field 2, `int64`). */
  unfreeze_balance: int64
  /** Resource type (field 3, enum — see `ResourceCodeName`). */
  resource?: ResourceCodeName | number | undefined
}
/** Encode-side spelling of {@link UnfreezeBalanceV2Contract}: wide address, int64 and bytes inputs. */
export type UnfreezeBalanceV2ContractInput = UnfreezeBalanceV2ContractBase
/**
 * Decoded `UnfreezeBalanceV2Contract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UnfreezeBalanceV2Contract = UnfreezeBalanceV2ContractBase<
  string,
  number | string
>

/** `WithdrawExpireUnfreezeContract` (contract type 56). */
type WithdrawExpireUnfreezeContractBase<address = ContractAddressInput> = {
  /** Account address (field 1). */
  owner_address: address
}
/** Encode-side spelling of {@link WithdrawExpireUnfreezeContract}: wide address, int64 and bytes inputs. */
export type WithdrawExpireUnfreezeContractInput =
  WithdrawExpireUnfreezeContractBase
/**
 * Decoded `WithdrawExpireUnfreezeContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type WithdrawExpireUnfreezeContract =
  WithdrawExpireUnfreezeContractBase<string>

/** `DelegateResourceContract` (contract type 57). */
type DelegateResourceContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Delegator address (field 1). */
  owner_address: address
  /** Resource type (field 2, enum — see `ResourceCodeName`). */
  resource?: ResourceCodeName | number | undefined
  /** Amount to delegate, in SUN (field 3, `int64`). */
  balance: int64
  /** Recipient address (field 4). */
  receiver_address: address
  /** Whether the delegation is locked (field 5, `bool`). */
  lock?: boolean | undefined
  /** Lock period, in blocks (field 6, `int64`). */
  lock_period?: int64 | undefined
}
/** Encode-side spelling of {@link DelegateResourceContract}: wide address, int64 and bytes inputs. */
export type DelegateResourceContractInput = DelegateResourceContractBase
/**
 * Decoded `DelegateResourceContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type DelegateResourceContract = DelegateResourceContractBase<
  string,
  number | string
>

/** `UnDelegateResourceContract` (contract type 58). */
type UnDelegateResourceContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Delegator address (field 1). */
  owner_address: address
  /** Resource type (field 2, enum — see `ResourceCodeName`). */
  resource?: ResourceCodeName | number | undefined
  /** Amount to undelegate, in SUN (field 3, `int64`). */
  balance: int64
  /** Recipient address (field 4). */
  receiver_address: address
}
/** Encode-side spelling of {@link UnDelegateResourceContract}: wide address, int64 and bytes inputs. */
export type UnDelegateResourceContractInput = UnDelegateResourceContractBase
/**
 * Decoded `UnDelegateResourceContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UnDelegateResourceContract = UnDelegateResourceContractBase<
  string,
  number | string
>

/** `CancelAllUnfreezeV2Contract` (contract type 59). */
type CancelAllUnfreezeV2ContractBase<address = ContractAddressInput> = {
  /** Account address (field 1). */
  owner_address: address
}
/** Encode-side spelling of {@link CancelAllUnfreezeV2Contract}: wide address, int64 and bytes inputs. */
export type CancelAllUnfreezeV2ContractInput = CancelAllUnfreezeV2ContractBase
/**
 * Decoded `CancelAllUnfreezeV2Contract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type CancelAllUnfreezeV2Contract =
  CancelAllUnfreezeV2ContractBase<string>

/** `AccountCreateContract` (contract type 0) — create a new account. */
type AccountCreateContractBase<address = ContractAddressInput> = {
  /** Creator (payer) address (field 1). */
  owner_address: address
  /** Address of the account to create (field 2). */
  account_address: address
  /** Account type (field 3, enum — see `AccountTypeName`). */
  type?: AccountTypeName | number | undefined
}
/** Encode-side spelling of {@link AccountCreateContract}: wide address, int64 and bytes inputs. */
export type AccountCreateContractInput = AccountCreateContractBase
/**
 * Decoded `AccountCreateContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type AccountCreateContract = AccountCreateContractBase<string>

/** `AccountUpdateContract` (contract type 10) — set an account name. */
type AccountUpdateContractBase<
  address = ContractAddressInput,
  bytes = BytesInput,
> = {
  /** Account name (field 1, `bytes`, hex). */
  account_name: bytes
  /** Account address (field 2). */
  owner_address: address
}
/** Encode-side spelling of {@link AccountUpdateContract}: wide address, int64 and bytes inputs. */
export type AccountUpdateContractInput = AccountUpdateContractBase
/**
 * Decoded `AccountUpdateContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type AccountUpdateContract = AccountUpdateContractBase<string, string>

/** `SetAccountIdContract` (contract type 19) — set an account id. */
type SetAccountIdContractBase<
  address = ContractAddressInput,
  bytes = BytesInput,
> = {
  /** Account id (field 1, `bytes`, hex). */
  account_id: bytes
  /** Account address (field 2). */
  owner_address: address
}
/** Encode-side spelling of {@link SetAccountIdContract}: wide address, int64 and bytes inputs. */
export type SetAccountIdContractInput = SetAccountIdContractBase
/**
 * Decoded `SetAccountIdContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type SetAccountIdContract = SetAccountIdContractBase<string, string>

/** `WitnessCreateContract` (contract type 5) — apply to become an SR. */
type WitnessCreateContractBase<
  address = ContractAddressInput,
  bytes = BytesInput,
> = {
  /** Applicant account address (field 1). */
  owner_address: address
  /** Witness page URL (field 2, `bytes`, hex). */
  url: bytes
}
/** Encode-side spelling of {@link WitnessCreateContract}: wide address, int64 and bytes inputs. */
export type WitnessCreateContractInput = WitnessCreateContractBase
/**
 * Decoded `WitnessCreateContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type WitnessCreateContract = WitnessCreateContractBase<string, string>

/** `WitnessUpdateContract` (contract type 8) — update an SR's URL. */
type WitnessUpdateContractBase<
  address = ContractAddressInput,
  bytes = BytesInput,
> = {
  /** Witness account address (field 1). */
  owner_address: address
  /** New witness page URL (field 12, `bytes`, hex). */
  update_url: bytes
}
/** Encode-side spelling of {@link WitnessUpdateContract}: wide address, int64 and bytes inputs. */
export type WitnessUpdateContractInput = WitnessUpdateContractBase
/**
 * Decoded `WitnessUpdateContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type WitnessUpdateContract = WitnessUpdateContractBase<string, string>

/** `ClearABIContract` (contract type 48) — clear a contract's ABI. */
type ClearABIContractBase<address = ContractAddressInput> = {
  /** Owner (deployer) address (field 1). */
  owner_address: address
  /** Contract address (field 2). */
  contract_address: address
}
/** Encode-side spelling of {@link ClearABIContract}: wide address, int64 and bytes inputs. */
export type ClearABIContractInput = ClearABIContractBase
/**
 * Decoded `ClearABIContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ClearABIContract = ClearABIContractBase<string>

/** `UpdateSettingContract` (contract type 33) — update the user resource share. */
type UpdateSettingContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Owner (deployer) address (field 1). */
  owner_address: address
  /** Contract address (field 2). */
  contract_address: address
  /** Percentage of energy consumed by the caller (field 3, `int64`). */
  consume_user_resource_percent?: int64 | undefined
}
/** Encode-side spelling of {@link UpdateSettingContract}: wide address, int64 and bytes inputs. */
export type UpdateSettingContractInput = UpdateSettingContractBase
/**
 * Decoded `UpdateSettingContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UpdateSettingContract = UpdateSettingContractBase<
  string,
  number | string
>

/** `UpdateEnergyLimitContract` (contract type 45) — update a contract's energy limit. */
type UpdateEnergyLimitContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Owner (deployer) address (field 1). */
  owner_address: address
  /** Contract address (field 2). */
  contract_address: address
  /** Creator energy limit (field 3, `int64`). */
  origin_energy_limit: int64
}
/** Encode-side spelling of {@link UpdateEnergyLimitContract}: wide address, int64 and bytes inputs. */
export type UpdateEnergyLimitContractInput = UpdateEnergyLimitContractBase
/**
 * Decoded `UpdateEnergyLimitContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type UpdateEnergyLimitContract = UpdateEnergyLimitContractBase<
  string,
  number | string
>

/** A single `map<int64,int64>` entry inside `ProposalCreateContract`. */
type ProposalParameterBase<int64 = Int64> = {
  /** Chain-parameter id (map key, `int64`). */
  key: int64
  /** New parameter value (map value, `int64`). */
  value: int64
}
/**
 * Encode-side spelling of {@link ProposalParameter}: wide int64 input. Named
 * `…MessageInput` because `ProposalParameterInput` is the `createProposal`
 * action's parameter type.
 */
export type ProposalParameterMessageInput = ProposalParameterBase
/**
 * Decoded `ProposalParameter`, as `decodeRawData` and the node return it:
 * int64 fields as `number` (a decimal string past 2^53).
 */
export type ProposalParameter = ProposalParameterBase<number | string>

/** `ProposalCreateContract` (contract type 16) — create a governance proposal. */
type ProposalCreateContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Proposer address (field 1). */
  owner_address: address
  /** Proposed chain-parameter changes (field 2, `map<int64,int64>`). */
  parameters?: ProposalParameterBase<int64>[] | undefined
}
/** Encode-side spelling of {@link ProposalCreateContract}: wide address, int64 and bytes inputs. */
export type ProposalCreateContractInput = ProposalCreateContractBase
/**
 * Decoded `ProposalCreateContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ProposalCreateContract = ProposalCreateContractBase<
  string,
  number | string
>

/** `ProposalApproveContract` (contract type 17) — approve/disapprove a proposal. */
type ProposalApproveContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Voter address (field 1). */
  owner_address: address
  /** Proposal id (field 2, `int64`). */
  proposal_id?: int64 | undefined
  /** Whether to add (true) or remove (false) approval (field 3, `bool`). */
  is_add_approval?: boolean | undefined
}
/** Encode-side spelling of {@link ProposalApproveContract}: wide address, int64 and bytes inputs. */
export type ProposalApproveContractInput = ProposalApproveContractBase
/**
 * Decoded `ProposalApproveContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ProposalApproveContract = ProposalApproveContractBase<
  string,
  number | string
>

/** `ProposalDeleteContract` (contract type 18) — delete a proposal. */
type ProposalDeleteContractBase<
  address = ContractAddressInput,
  int64 = Int64,
> = {
  /** Proposer address (field 1). */
  owner_address: address
  /** Proposal id (field 2, `int64`). */
  proposal_id?: int64 | undefined
}
/** Encode-side spelling of {@link ProposalDeleteContract}: wide address, int64 and bytes inputs. */
export type ProposalDeleteContractInput = ProposalDeleteContractBase
/**
 * Decoded `ProposalDeleteContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ProposalDeleteContract = ProposalDeleteContractBase<
  string,
  number | string
>

/** `ExchangeCreateContract` (contract type 41) — create a Bancor exchange pair. */
type ExchangeCreateContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Creator address (field 1). */
  owner_address: address
  /** First token id (field 2, `bytes`, hex). */
  first_token_id: bytes
  /** First token balance seeded into the exchange (field 3, `int64`). */
  first_token_balance: int64
  /** Second token id (field 4, `bytes`, hex). */
  second_token_id: bytes
  /** Second token balance seeded into the exchange (field 5, `int64`). */
  second_token_balance: int64
}
/** Encode-side spelling of {@link ExchangeCreateContract}: wide address, int64 and bytes inputs. */
export type ExchangeCreateContractInput = ExchangeCreateContractBase
/**
 * Decoded `ExchangeCreateContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ExchangeCreateContract = ExchangeCreateContractBase<
  string,
  number | string,
  string
>

/** `ExchangeInjectContract` (contract type 42) — inject liquidity into an exchange. */
type ExchangeInjectContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Owner address (field 1). */
  owner_address: address
  /** Exchange id (field 2, `int64`). */
  exchange_id: int64
  /** Token id to inject (field 3, `bytes`, hex). */
  token_id: bytes
  /** Amount of the token to inject (field 4, `int64`). */
  quant: int64
}
/** Encode-side spelling of {@link ExchangeInjectContract}: wide address, int64 and bytes inputs. */
export type ExchangeInjectContractInput = ExchangeInjectContractBase
/**
 * Decoded `ExchangeInjectContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ExchangeInjectContract = ExchangeInjectContractBase<
  string,
  number | string,
  string
>

/** `ExchangeWithdrawContract` (contract type 43) — withdraw liquidity from an exchange. */
type ExchangeWithdrawContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Owner address (field 1). */
  owner_address: address
  /** Exchange id (field 2, `int64`). */
  exchange_id: int64
  /** Token id to withdraw (field 3, `bytes`, hex). */
  token_id: bytes
  /** Amount of the token to withdraw (field 4, `int64`). */
  quant: int64
}
/** Encode-side spelling of {@link ExchangeWithdrawContract}: wide address, int64 and bytes inputs. */
export type ExchangeWithdrawContractInput = ExchangeWithdrawContractBase
/**
 * Decoded `ExchangeWithdrawContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ExchangeWithdrawContract = ExchangeWithdrawContractBase<
  string,
  number | string,
  string
>

/** `ExchangeTransactionContract` (contract type 44) — trade against an exchange. */
type ExchangeTransactionContractBase<
  address = ContractAddressInput,
  int64 = Int64,
  bytes = BytesInput,
> = {
  /** Trader address (field 1). */
  owner_address: address
  /** Exchange id (field 2, `int64`). */
  exchange_id: int64
  /** Token id sold into the exchange (field 3, `bytes`, hex). */
  token_id: bytes
  /** Amount of the token sold (field 4, `int64`). */
  quant: int64
  /** Minimum amount of the counter-token expected (field 5, `int64`). */
  expected: int64
}
/** Encode-side spelling of {@link ExchangeTransactionContract}: wide address, int64 and bytes inputs. */
export type ExchangeTransactionContractInput = ExchangeTransactionContractBase
/**
 * Decoded `ExchangeTransactionContract`, as `decodeRawData` and the node return it: addresses as
 * `41`-hex strings (Base58 is accepted too), int64 as `number` (a decimal
 * string past 2^53), bytes as bare hex.
 */
export type ExchangeTransactionContract = ExchangeTransactionContractBase<
  string,
  number | string,
  string
>

/** Union of all registered (known) contract message models. */
export type ContractMessage =
  | TransferContract
  | TransferAssetContract
  | VoteWitnessContract
  | FreezeBalanceContract
  | UnfreezeBalanceContract
  | ParticipateAssetIssueContract
  | AssetIssueContract
  | UnfreezeAssetContract
  | UpdateAssetContract
  | WithdrawBalanceContract
  | CreateSmartContract
  | TriggerSmartContract
  | AccountPermissionUpdateContract
  | FreezeBalanceV2Contract
  | UnfreezeBalanceV2Contract
  | WithdrawExpireUnfreezeContract
  | DelegateResourceContract
  | UnDelegateResourceContract
  | CancelAllUnfreezeV2Contract
  | UpdateBrokerageContract
  | AccountCreateContract
  | AccountUpdateContract
  | SetAccountIdContract
  | WitnessCreateContract
  | WitnessUpdateContract
  | ClearABIContract
  | UpdateSettingContract
  | UpdateEnergyLimitContract
  | ProposalCreateContract
  | ProposalApproveContract
  | ProposalDeleteContract
  | ExchangeCreateContract
  | ExchangeInjectContract
  | ExchangeWithdrawContract
  | ExchangeTransactionContract

/** The encode-side spellings of every contract message. */
export type ContractMessageInput =
  | TransferContractInput
  | TransferAssetContractInput
  | VoteWitnessContractInput
  | FreezeBalanceContractInput
  | UnfreezeBalanceContractInput
  | ParticipateAssetIssueContractInput
  | AssetIssueContractInput
  | UnfreezeAssetContractInput
  | UpdateAssetContractInput
  | WithdrawBalanceContractInput
  | CreateSmartContractInput
  | TriggerSmartContractInput
  | AccountPermissionUpdateContractInput
  | FreezeBalanceV2ContractInput
  | UnfreezeBalanceV2ContractInput
  | WithdrawExpireUnfreezeContractInput
  | DelegateResourceContractInput
  | UnDelegateResourceContractInput
  | CancelAllUnfreezeV2ContractInput
  | UpdateBrokerageContractInput
  | AccountCreateContractInput
  | AccountUpdateContractInput
  | SetAccountIdContractInput
  | WitnessCreateContractInput
  | WitnessUpdateContractInput
  | ClearABIContractInput
  | UpdateSettingContractInput
  | UpdateEnergyLimitContractInput
  | ProposalCreateContractInput
  | ProposalApproveContractInput
  | ProposalDeleteContractInput
  | ExchangeCreateContractInput
  | ExchangeInjectContractInput
  | ExchangeWithdrawContractInput
  | ExchangeTransactionContractInput

/**
 * Decoded contract message by `Transaction.Contract.type` name — the table
 * {@link RawContract} is built from, so `type` narrows `parameter.value`.
 */
export type ContractMessageByType = {
  TransferContract: TransferContract
  TransferAssetContract: TransferAssetContract
  VoteWitnessContract: VoteWitnessContract
  FreezeBalanceContract: FreezeBalanceContract
  UnfreezeBalanceContract: UnfreezeBalanceContract
  ParticipateAssetIssueContract: ParticipateAssetIssueContract
  AssetIssueContract: AssetIssueContract
  UnfreezeAssetContract: UnfreezeAssetContract
  UpdateAssetContract: UpdateAssetContract
  WithdrawBalanceContract: WithdrawBalanceContract
  CreateSmartContract: CreateSmartContract
  TriggerSmartContract: TriggerSmartContract
  AccountPermissionUpdateContract: AccountPermissionUpdateContract
  FreezeBalanceV2Contract: FreezeBalanceV2Contract
  UnfreezeBalanceV2Contract: UnfreezeBalanceV2Contract
  WithdrawExpireUnfreezeContract: WithdrawExpireUnfreezeContract
  DelegateResourceContract: DelegateResourceContract
  UnDelegateResourceContract: UnDelegateResourceContract
  CancelAllUnfreezeV2Contract: CancelAllUnfreezeV2Contract
  UpdateBrokerageContract: UpdateBrokerageContract
  AccountCreateContract: AccountCreateContract
  AccountUpdateContract: AccountUpdateContract
  SetAccountIdContract: SetAccountIdContract
  WitnessCreateContract: WitnessCreateContract
  WitnessUpdateContract: WitnessUpdateContract
  ClearABIContract: ClearABIContract
  UpdateSettingContract: UpdateSettingContract
  UpdateEnergyLimitContract: UpdateEnergyLimitContract
  ProposalCreateContract: ProposalCreateContract
  ProposalApproveContract: ProposalApproveContract
  ProposalDeleteContract: ProposalDeleteContract
  ExchangeCreateContract: ExchangeCreateContract
  ExchangeInjectContract: ExchangeInjectContract
  ExchangeWithdrawContract: ExchangeWithdrawContract
  ExchangeTransactionContract: ExchangeTransactionContract
}
