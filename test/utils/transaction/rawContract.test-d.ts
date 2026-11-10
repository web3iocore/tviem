// Type-surface tests for the decoded `Transaction.Contract` / `Transaction.raw`
// models: `RawContract` is a discriminated union by `type` (never a number on
// the decoded side), with one bare-hex fallback member for the contract types
// java-tron defines but this SDK has no codec for; `RawData` is what
// `decodeRawData` returns and what `SignableTransaction.raw_data` carries,
// and it is accepted wherever the encode-side `RawDataInput` is.
import { expectTypeOf, test } from 'vitest'

import type { SignableTransaction } from '../../../src/accounts/types.js'
import type { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import type { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import type { ContractTypeName } from '../../../src/utils/transaction/registry.js'
import type {
  RawContract,
  RawContractInput,
  RawData,
  RawDataInput,
  serializeRawData,
  toRawDataHex,
} from '../../../src/utils/transaction/serializeRawData.js'
import type {
  AssetIssueContract,
  AssetIssueContractInput,
  ContractMessage,
  ContractMessageByType,
  FreezeBalanceV2Contract,
  ProposalApproveContract,
  ProposalApproveContractInput,
  ProposalDeleteContract,
  ProposalDeleteContractInput,
  TransferContract,
  TriggerSmartContract,
  UpdateAssetContract,
  UpdateAssetContractInput,
  UpdateBrokerageContract,
  UpdateBrokerageContractInput,
  UpdateSettingContract,
  UpdateSettingContractInput,
} from '../../../src/utils/transaction/types.js'

/** The decoded member of `RawContract` for one contract type name. */
type ContractOf<name extends ContractTypeName> = Extract<
  RawContract,
  { type: name }
>

/** The fallback (codec-less, bare-hex body) member of `RawContract`. */
type FallbackContract = Extract<RawContract, { parameter: { value: string } }>

/** Keys of `T` that may be omitted. */
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]
/** Keys of `T` that must be present. */
type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>

/**
 * The contract types with a registered codec (`contractCodecs` in
 * `registry.ts`, 35 entries) — the names `ContractMessageByType` must carry,
 * no more, no fewer.
 */
type CodecContractTypeName =
  | 'TransferContract'
  | 'TransferAssetContract'
  | 'VoteWitnessContract'
  | 'FreezeBalanceContract'
  | 'UnfreezeBalanceContract'
  | 'AssetIssueContract'
  | 'ParticipateAssetIssueContract'
  | 'UnfreezeAssetContract'
  | 'UpdateAssetContract'
  | 'WithdrawBalanceContract'
  | 'CreateSmartContract'
  | 'TriggerSmartContract'
  | 'AccountPermissionUpdateContract'
  | 'FreezeBalanceV2Contract'
  | 'UnfreezeBalanceV2Contract'
  | 'WithdrawExpireUnfreezeContract'
  | 'DelegateResourceContract'
  | 'UnDelegateResourceContract'
  | 'CancelAllUnfreezeV2Contract'
  | 'UpdateBrokerageContract'
  | 'AccountCreateContract'
  | 'AccountUpdateContract'
  | 'SetAccountIdContract'
  | 'WitnessCreateContract'
  | 'WitnessUpdateContract'
  | 'ClearABIContract'
  | 'UpdateSettingContract'
  | 'UpdateEnergyLimitContract'
  | 'ProposalCreateContract'
  | 'ProposalApproveContract'
  | 'ProposalDeleteContract'
  | 'ExchangeCreateContract'
  | 'ExchangeInjectContract'
  | 'ExchangeWithdrawContract'
  | 'ExchangeTransactionContract'

/** The contract types java-tron defines but this SDK has no codec for. */
type CodecLessContractTypeName =
  | 'VoteAssetContract'
  | 'CustomContract'
  | 'GetContract'
  | 'ShieldedTransferContract'
  | 'MarketSellAssetContract'
  | 'MarketCancelOrderContract'

declare const contract: RawContract

test('RawContract narrows parameter.value by type', () => {
  if (contract.type === 'TransferContract') {
    expectTypeOf(contract.parameter.value).toEqualTypeOf<TransferContract>()
    expectTypeOf(contract.parameter.value.amount).toEqualTypeOf<
      number | string
    >()
    expectTypeOf(contract.parameter.value.to_address).toEqualTypeOf<string>()
    expectTypeOf(contract.parameter.value).not.toHaveProperty(
      'contract_address',
    )
    expectTypeOf(contract.parameter.value).not.toHaveProperty('frozen_balance')
  }
  if (contract.type === 'TriggerSmartContract') {
    expectTypeOf(contract.parameter.value).toEqualTypeOf<TriggerSmartContract>()
    expectTypeOf(
      contract.parameter.value.contract_address,
    ).toEqualTypeOf<string>()
    expectTypeOf(contract.parameter.value.data).toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf(contract.parameter.value.call_value).toEqualTypeOf<
      number | string | undefined
    >()
    expectTypeOf(contract.parameter.value).not.toHaveProperty('to_address')
    expectTypeOf(contract.parameter.value).not.toHaveProperty('amount')
  }
  if (contract.type === 'FreezeBalanceV2Contract') {
    expectTypeOf(
      contract.parameter.value,
    ).toEqualTypeOf<FreezeBalanceV2Contract>()
    expectTypeOf(contract.parameter.value.frozen_balance).toEqualTypeOf<
      number | string
    >()
    expectTypeOf(contract.parameter.value).toHaveProperty('resource')
    expectTypeOf(contract.parameter.value).not.toHaveProperty('to_address')
    expectTypeOf(contract.parameter.value).not.toHaveProperty('data')
  }

  // the same narrowing, spelled at the type level
  expectTypeOf<
    ContractOf<'TransferContract'>['parameter']['value']
  >().toEqualTypeOf<TransferContract>()
  expectTypeOf<
    ContractOf<'TriggerSmartContract'>['parameter']['value']
  >().toEqualTypeOf<TriggerSmartContract>()
  expectTypeOf<
    ContractOf<'FreezeBalanceV2Contract'>['parameter']['value']
  >().toEqualTypeOf<FreezeBalanceV2Contract>()
  // every member keeps the Any envelope and the optional multi-sig id
  expectTypeOf<RawContract['parameter']['type_url']>().toEqualTypeOf<string>()
  expectTypeOf<RawContract['Permission_id']>().toEqualTypeOf<
    number | undefined
  >()
})

test('the fallback member carries a bare-hex body for the codec-less types only', () => {
  expectTypeOf<FallbackContract['parameter']['value']>().toEqualTypeOf<string>()
  expectTypeOf<
    FallbackContract['type']
  >().toEqualTypeOf<CodecLessContractTypeName>()
  // no codec'd name leaks into the fallback...
  expectTypeOf<
    Extract<FallbackContract['type'], keyof ContractMessageByType>
  >().toBeNever()
  // ...and no codec'd member carries a string body
  expectTypeOf<
    Exclude<RawContract, FallbackContract>['parameter']['value']
  >().toEqualTypeOf<ContractMessage>()
  // the union covers every registered type name exactly once
  expectTypeOf<RawContract['type']>().toEqualTypeOf<ContractTypeName>()
})

test('ContractMessageByType keys are exactly the contract types with a codec', () => {
  expectTypeOf<
    keyof ContractMessageByType
  >().toEqualTypeOf<CodecContractTypeName>()
  expectTypeOf<keyof ContractMessageByType>().toExtend<ContractTypeName>()
  expectTypeOf<
    Exclude<ContractTypeName, keyof ContractMessageByType>
  >().toEqualTypeOf<CodecLessContractTypeName>()
  // the table maps each name to its own decoded model
  expectTypeOf<
    ContractMessageByType['TransferContract']
  >().toEqualTypeOf<TransferContract>()
  expectTypeOf<
    ContractMessageByType['TriggerSmartContract']
  >().toEqualTypeOf<TriggerSmartContract>()
  expectTypeOf<
    ContractMessageByType[keyof ContractMessageByType]
  >().toEqualTypeOf<ContractMessage>()
})

test('proto3 default-omitted fields are optional on both spellings, the rest required', () => {
  // UpdateSettingContract.consume_user_resource_percent
  expectTypeOf<
    OptionalKeys<UpdateSettingContract>
  >().toEqualTypeOf<'consume_user_resource_percent'>()
  expectTypeOf<
    OptionalKeys<UpdateSettingContractInput>
  >().toEqualTypeOf<'consume_user_resource_percent'>()
  expectTypeOf<RequiredKeys<UpdateSettingContract>>().toEqualTypeOf<
    'owner_address' | 'contract_address'
  >()
  expectTypeOf<RequiredKeys<UpdateSettingContractInput>>().toEqualTypeOf<
    'owner_address' | 'contract_address'
  >()

  // UpdateBrokerageContract.brokerage
  expectTypeOf<
    OptionalKeys<UpdateBrokerageContract>
  >().toEqualTypeOf<'brokerage'>()
  expectTypeOf<
    OptionalKeys<UpdateBrokerageContractInput>
  >().toEqualTypeOf<'brokerage'>()
  expectTypeOf<
    RequiredKeys<UpdateBrokerageContract>
  >().toEqualTypeOf<'owner_address'>()
  expectTypeOf<
    RequiredKeys<UpdateBrokerageContractInput>
  >().toEqualTypeOf<'owner_address'>()

  // UpdateAssetContract.{description,url,new_limit,new_public_limit}
  expectTypeOf<OptionalKeys<UpdateAssetContract>>().toEqualTypeOf<
    'description' | 'url' | 'new_limit' | 'new_public_limit'
  >()
  expectTypeOf<OptionalKeys<UpdateAssetContractInput>>().toEqualTypeOf<
    'description' | 'url' | 'new_limit' | 'new_public_limit'
  >()
  expectTypeOf<
    RequiredKeys<UpdateAssetContract>
  >().toEqualTypeOf<'owner_address'>()
  expectTypeOf<
    RequiredKeys<UpdateAssetContractInput>
  >().toEqualTypeOf<'owner_address'>()

  // ProposalApproveContract.proposal_id (is_add_approval is a proto3 bool:
  // optional as every bool is)
  expectTypeOf<OptionalKeys<ProposalApproveContract>>().toEqualTypeOf<
    'proposal_id' | 'is_add_approval'
  >()
  expectTypeOf<OptionalKeys<ProposalApproveContractInput>>().toEqualTypeOf<
    'proposal_id' | 'is_add_approval'
  >()
  expectTypeOf<
    RequiredKeys<ProposalApproveContract>
  >().toEqualTypeOf<'owner_address'>()
  expectTypeOf<
    RequiredKeys<ProposalApproveContractInput>
  >().toEqualTypeOf<'owner_address'>()

  // ProposalDeleteContract.proposal_id
  expectTypeOf<
    OptionalKeys<ProposalDeleteContract>
  >().toEqualTypeOf<'proposal_id'>()
  expectTypeOf<
    OptionalKeys<ProposalDeleteContractInput>
  >().toEqualTypeOf<'proposal_id'>()
  expectTypeOf<
    RequiredKeys<ProposalDeleteContract>
  >().toEqualTypeOf<'owner_address'>()
  expectTypeOf<
    RequiredKeys<ProposalDeleteContractInput>
  >().toEqualTypeOf<'owner_address'>()

  // AssetIssueContract.description (the other optionals are proto3 repeated /
  // int32 / unused fields); the ICO essentials stay required
  expectTypeOf<'description'>().toExtend<OptionalKeys<AssetIssueContract>>()
  expectTypeOf<'description'>().toExtend<
    OptionalKeys<AssetIssueContractInput>
  >()
  expectTypeOf<RequiredKeys<AssetIssueContract>>().toEqualTypeOf<
    | 'owner_address'
    | 'name'
    | 'abbr'
    | 'total_supply'
    | 'trx_num'
    | 'num'
    | 'start_time'
    | 'end_time'
    | 'url'
  >()
  expectTypeOf<RequiredKeys<AssetIssueContractInput>>().toEqualTypeOf<
    RequiredKeys<AssetIssueContract>
  >()

  // a message without default-omitted fields is fully required
  expectTypeOf<RequiredKeys<TransferContract>>().toEqualTypeOf<
    'owner_address' | 'to_address' | 'amount'
  >()
  expectTypeOf<OptionalKeys<TransferContract>>().toBeNever()
})

test('a TronWeb-shaped transaction is a SignableTransaction', () => {
  type TronWebTransaction = {
    txID: string
    raw_data: {
      contract: [
        {
          type: 'TransferContract'
          parameter: {
            type_url: string
            value: { owner_address: string; to_address: string; amount: number }
          }
        },
      ]
      expiration: number
      timestamp: number
      ref_block_bytes: string
      ref_block_hash: string
    }
    raw_data_hex: string
  }
  expectTypeOf<TronWebTransaction>().toExtend<SignableTransaction>()
  expectTypeOf<TronWebTransaction['raw_data']>().toExtend<RawData>()
  expectTypeOf<SignableTransaction['raw_data']>().toEqualTypeOf<RawData>()
})

test('decoded RawData flows into serializeRawData / toRawDataHex / getTransactionId', () => {
  expectTypeOf<ReturnType<typeof decodeRawData>>().toEqualTypeOf<RawData>()
  expectTypeOf<RawData>().toExtend<Parameters<typeof serializeRawData>[0]>()
  expectTypeOf<RawData>().toExtend<Parameters<typeof toRawDataHex>[0]>()
  expectTypeOf<RawData>().toExtend<Parameters<typeof getTransactionId>[0]>()
  // and so does the encode-side input
  expectTypeOf<RawDataInput>().toExtend<
    Parameters<typeof serializeRawData>[0]
  >()
  expectTypeOf<RawDataInput>().toExtend<Parameters<typeof toRawDataHex>[0]>()
  expectTypeOf<RawDataInput>().toExtend<
    Parameters<typeof getTransactionId>[0]
  >()
  // an unrelated shape is refused by both
  expectTypeOf<{ contract: string }>().not.toExtend<
    Parameters<typeof serializeRawData>[0]
  >()
})

test('a RawDataInput with bigint is not a RawData', () => {
  const input: RawDataInput = {
    contract: [
      {
        type: 1,
        parameter: {
          type_url: 'type.googleapis.com/protocol.TransferContract',
          value: {
            owner_address: 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe',
            to_address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
            amount: 1_000_000n,
          },
        },
      },
    ],
    expiration: 1_700_000_060_000n,
    timestamp: 1_700_000_000_000,
    ref_block_bytes: '1a2b',
    ref_block_hash: '0011223344556677',
  }
  // @ts-expect-error — bigint int64 fields and a numeric `type` are encode-side only
  const decoded: RawData = input
  expectTypeOf(decoded).toEqualTypeOf<RawData>()
  expectTypeOf<RawDataInput>().not.toExtend<RawData>()
  // nor is a decoded model an input: its address fields are plain `string`,
  // not `AddressInput` — hence `serializeRawData(RawDataInput | RawData)`
  expectTypeOf<RawData>().not.toExtend<RawDataInput>()
  expectTypeOf<RawContract>().not.toExtend<RawContractInput>()
  expectTypeOf<RawData['expiration']>().toEqualTypeOf<
    number | string | undefined
  >()
  expectTypeOf<bigint>().not.toExtend<RawData['expiration']>()
})

test("RawContract's type is a name, never a number", () => {
  expectTypeOf<RawContract['type']>().toEqualTypeOf<ContractTypeName>()
  expectTypeOf<number>().not.toExtend<RawContract['type']>()
  expectTypeOf<1>().not.toExtend<RawContract['type']>()
  // the encode side still takes the registered wire integer
  expectTypeOf<RawContractInput['type']>().toEqualTypeOf<
    ContractTypeName | number
  >()

  const value: TransferContract = {
    owner_address: '412b5ad5c4795c026514f8317c7a215e218dccd6cf',
    to_address: '41ec8e2e6b0e5a1d3bc9f6a04ab7b0d6f0a52b9e4f',
    amount: 1,
  }
  const named: RawContract = {
    type: 'TransferContract',
    parameter: {
      type_url: 'type.googleapis.com/protocol.TransferContract',
      value,
    },
  }
  // (the initializer narrows `named` to the TransferContract member)
  expectTypeOf(named).toExtend<RawContract>()
  expectTypeOf(named.parameter.value).toEqualTypeOf<TransferContract>()
  const numbered: RawContract = {
    // @ts-expect-error — a decoded contract names its type
    type: 1,
    parameter: {
      type_url: 'type.googleapis.com/protocol.TransferContract',
      value,
    },
  }
  expectTypeOf(numbered).toEqualTypeOf<RawContract>()
  // a name paired with another contract's body does not type-check either
  // @ts-expect-error — `type` and `parameter.value` must denote one contract
  const mismatched: RawContract = {
    type: 'TriggerSmartContract',
    parameter: {
      type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
      value,
    },
  }
  expectTypeOf(mismatched).toEqualTypeOf<RawContract>()
})
