// Type-surface tests for the transaction contract-parameter models (Track D).
// Each message comes in two spellings: `XInput` (encode side) is wide-in —
// i64 fields are `Int64`, address fields `ContractAddressInput`, bytes fields
// `BytesInput` — while the bare `X` is the DECODED model as `decodeRawData`
// and the node return it: addresses as `string` (41-hex), i64 as
// `number | string`, bytes as bare-hex `string`. Enum fields carry their
// JsonFormat name union on both.
import { expectTypeOf, test } from 'vitest'

import type {
  Address,
  AddressInput,
  EvmAddress,
  TronHexAddress,
} from '../../../src/types/address.js'
import type { ByteArray } from '../../../src/types/misc.js'
import type {
  BytesInput,
  ContractAddressInput,
  DelegateResourceContract,
  DelegateResourceContractInput,
  FreezeBalanceContract,
  FreezeBalanceContractInput,
  FreezeBalanceV2Contract,
  FreezeBalanceV2ContractInput,
  Int64,
  PermissionKey,
  PermissionKeyInput,
  ResourceCode,
  ResourceCodeName,
  TransferAssetContract,
  TransferAssetContractInput,
  TransferContract,
  TransferContractInput,
  TriggerSmartContract,
  TriggerSmartContractInput,
  Vote,
  VoteInput,
} from '../../../src/utils/transaction/types.js'

test('i64 fields are Int64 on the input side (bigint | number | string)', () => {
  expectTypeOf<Int64>().toEqualTypeOf<bigint | number | string>()
  expectTypeOf<TransferContractInput['amount']>().toEqualTypeOf<Int64>()
  expectTypeOf<VoteInput['vote_count']>().toEqualTypeOf<Int64>()
  expectTypeOf<PermissionKeyInput['weight']>().toEqualTypeOf<Int64>()
  expectTypeOf<
    FreezeBalanceV2ContractInput['frozen_balance']
  >().toEqualTypeOf<Int64>()
  expectTypeOf<
    DelegateResourceContractInput['balance']
  >().toEqualTypeOf<Int64>()

  // optional i64 fields are `Int64 | undefined` (exactOptionalPropertyTypes)
  expectTypeOf<TriggerSmartContractInput['call_value']>().toEqualTypeOf<
    Int64 | undefined
  >()
  expectTypeOf<TriggerSmartContractInput['token_id']>().toEqualTypeOf<
    Int64 | undefined
  >()
  expectTypeOf<DelegateResourceContractInput['lock_period']>().toEqualTypeOf<
    Int64 | undefined
  >()
})

test('i64 fields are number | string on the decoded side (canonical JSON form)', () => {
  expectTypeOf<TransferContract['amount']>().toEqualTypeOf<number | string>()
  expectTypeOf<Vote['vote_count']>().toEqualTypeOf<number | string>()
  expectTypeOf<PermissionKey['weight']>().toEqualTypeOf<number | string>()
  expectTypeOf<FreezeBalanceV2Contract['frozen_balance']>().toEqualTypeOf<
    number | string
  >()
  expectTypeOf<DelegateResourceContract['balance']>().toEqualTypeOf<
    number | string
  >()

  // optional i64 fields keep the `| undefined`
  expectTypeOf<TriggerSmartContract['call_value']>().toEqualTypeOf<
    number | string | undefined
  >()
  expectTypeOf<TriggerSmartContract['token_id']>().toEqualTypeOf<
    number | string | undefined
  >()
  expectTypeOf<DelegateResourceContract['lock_period']>().toEqualTypeOf<
    number | string | undefined
  >()

  // a bigint never appears in a decoded model
  expectTypeOf<bigint>().not.toExtend<TransferContract['amount']>()
  // ...but every decoded value is a valid input
  expectTypeOf<TransferContract['amount']>().toExtend<
    TransferContractInput['amount']
  >()
})

test('ContractAddressInput is wide-in (AddressInput | ByteArray)', () => {
  expectTypeOf<ContractAddressInput>().toEqualTypeOf<AddressInput | ByteArray>()

  // every accepted form extends it: the three string forms + raw bytes
  expectTypeOf<Address>().toExtend<ContractAddressInput>()
  expectTypeOf<TronHexAddress>().toExtend<ContractAddressInput>()
  expectTypeOf<EvmAddress>().toExtend<ContractAddressInput>()
  expectTypeOf<ByteArray>().toExtend<ContractAddressInput>()
  expectTypeOf<'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe'>().toExtend<ContractAddressInput>()
  expectTypeOf<'412b5ad5c4795c026514f8317c7a215e218dccd6cf'>().toExtend<ContractAddressInput>()
  expectTypeOf<'0x2b5ad5c4795c026514f8317c7a215e218dccd6cf'>().toExtend<ContractAddressInput>()

  // but not an arbitrary string
  expectTypeOf<string>().not.toExtend<ContractAddressInput>()
})

test('input address fields are ContractAddressInput and accept every input form', () => {
  expectTypeOf<
    TransferContractInput['owner_address']
  >().toEqualTypeOf<ContractAddressInput>()
  expectTypeOf<
    TriggerSmartContractInput['contract_address']
  >().toEqualTypeOf<ContractAddressInput>()
  expectTypeOf<
    VoteInput['vote_address']
  >().toEqualTypeOf<ContractAddressInput>()
  expectTypeOf<
    PermissionKeyInput['address']
  >().toEqualTypeOf<ContractAddressInput>()
  expectTypeOf<
    FreezeBalanceV2ContractInput['owner_address']
  >().toEqualTypeOf<ContractAddressInput>()

  const base: Omit<TriggerSmartContractInput, 'owner_address'> = {
    contract_address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    data: '0xa9059cbb',
  }
  // Base58, TRON hex, EVM hex, and raw bytes are all assignable.
  expectTypeOf<Address>().toExtend<TriggerSmartContractInput['owner_address']>()
  const a: TriggerSmartContractInput = {
    ...base,
    owner_address: 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe',
  }
  const b: TriggerSmartContractInput = {
    ...base,
    owner_address: '412b5ad5c4795c026514f8317c7a215e218dccd6cf',
  }
  const c: TriggerSmartContractInput = {
    ...base,
    owner_address: '0x2b5ad5c4795c026514f8317c7a215e218dccd6cf',
  }
  const d: TriggerSmartContractInput = {
    ...base,
    owner_address: new Uint8Array([0x41]),
  }
  expectTypeOf(a).toEqualTypeOf<TriggerSmartContractInput>()
  expectTypeOf(b).toEqualTypeOf<TriggerSmartContractInput>()
  expectTypeOf(c).toEqualTypeOf<TriggerSmartContractInput>()
  expectTypeOf(d).toEqualTypeOf<TriggerSmartContractInput>()
})

test('decoded address fields are string (41-hex; Base58 accepted), never bytes', () => {
  expectTypeOf<TransferContract['owner_address']>().toEqualTypeOf<string>()
  expectTypeOf<TransferContract['to_address']>().toEqualTypeOf<string>()
  expectTypeOf<TriggerSmartContract['owner_address']>().toEqualTypeOf<string>()
  expectTypeOf<
    TriggerSmartContract['contract_address']
  >().toEqualTypeOf<string>()
  expectTypeOf<Vote['vote_address']>().toEqualTypeOf<string>()
  expectTypeOf<PermissionKey['address']>().toEqualTypeOf<string>()
  expectTypeOf<
    FreezeBalanceV2Contract['owner_address']
  >().toEqualTypeOf<string>()
  expectTypeOf<
    DelegateResourceContract['receiver_address']
  >().toEqualTypeOf<string>()
  // optional address fields keep the `| undefined`
  expectTypeOf<FreezeBalanceContract['receiver_address']>().toEqualTypeOf<
    string | undefined
  >()
  expectTypeOf<FreezeBalanceContractInput['receiver_address']>().toEqualTypeOf<
    ContractAddressInput | undefined
  >()

  // every string form of an address is a decoded address...
  expectTypeOf<Address>().toExtend<TransferContract['owner_address']>()
  expectTypeOf<TronHexAddress>().toExtend<TransferContract['owner_address']>()
  // ...but raw bytes are not
  expectTypeOf<ByteArray>().not.toExtend<TransferContract['owner_address']>()
  const decoded: TriggerSmartContract = {
    owner_address: '412b5ad5c4795c026514f8317c7a215e218dccd6cf',
    contract_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
    data: 'a9059cbb',
  }
  expectTypeOf(decoded).toEqualTypeOf<TriggerSmartContract>()
  const bytesInDecoded: TriggerSmartContract = {
    ...decoded,
    // @ts-expect-error — a decoded model never carries raw bytes
    owner_address: new Uint8Array([0x41]),
  }
  expectTypeOf(bytesInDecoded).toEqualTypeOf<TriggerSmartContract>()
})

test('bytes fields are BytesInput in, bare-hex string out', () => {
  expectTypeOf<BytesInput>().toEqualTypeOf<string | ByteArray>()

  // input side: hex string or raw bytes
  expectTypeOf<
    TransferAssetContractInput['asset_name']
  >().toEqualTypeOf<BytesInput>()
  expectTypeOf<TriggerSmartContractInput['data']>().toEqualTypeOf<
    BytesInput | undefined
  >()

  // decoded side: string only
  expectTypeOf<TransferAssetContract['asset_name']>().toEqualTypeOf<string>()
  expectTypeOf<TriggerSmartContract['data']>().toEqualTypeOf<
    string | undefined
  >()
  expectTypeOf<ByteArray>().not.toExtend<TransferAssetContract['asset_name']>()
})

test('decoded and input spellings are distinct: inputs are wider, decoded addresses are plain strings', () => {
  // inputs are wider than decoded models (bigint, raw bytes)
  expectTypeOf<TransferContractInput>().not.toExtend<TransferContract>()
  expectTypeOf<TriggerSmartContractInput>().not.toExtend<TriggerSmartContract>()
  // a decoded model is not an input either: its address fields are plain
  // `string` (the 41-hex the node emits), which is not an `AddressInput`
  // literal shape. This is why `serializeRawData` takes `RawDataInput | RawData`.
  expectTypeOf<TransferContract>().not.toExtend<TransferContractInput>()
  expectTypeOf<Vote>().not.toExtend<VoteInput>()
  expectTypeOf<PermissionKey>().not.toExtend<PermissionKeyInput>()
  // field by field, everything but the address is a valid input
  expectTypeOf<TransferContract['amount']>().toExtend<
    TransferContractInput['amount']
  >()
  expectTypeOf<TransferAssetContract['asset_name']>().toExtend<
    TransferAssetContractInput['asset_name']
  >()
  expectTypeOf<FreezeBalanceV2Contract['resource']>().toExtend<
    FreezeBalanceV2ContractInput['resource']
  >()
  expectTypeOf<TransferContract['owner_address']>().not.toExtend<
    TransferContractInput['owner_address']
  >()
})

test('enum value unions', () => {
  expectTypeOf<ResourceCode>().toEqualTypeOf<0 | 1>()
  expectTypeOf<ResourceCodeName>().toEqualTypeOf<'BANDWIDTH' | 'ENERGY'>()
  // enum fields accept the JsonFormat name (canonical) or the wire integer,
  // on both spellings
  expectTypeOf<FreezeBalanceV2Contract['resource']>().toEqualTypeOf<
    ResourceCodeName | number | undefined
  >()
  expectTypeOf<FreezeBalanceV2ContractInput['resource']>().toEqualTypeOf<
    ResourceCodeName | number | undefined
  >()
})
