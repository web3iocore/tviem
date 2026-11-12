import type { Abi, AbiEvent } from 'abitype'
import { expectTypeOf, test } from 'vitest'
import type { SignableTransaction } from '../../src/accounts/types.js'
import {
  type GetEventsOptions,
  getContract,
} from '../../src/actions/getContract.js'
import type { Log } from '../../src/actions/public/getLogs.js'
import type { Client } from '../../src/clients/createClient.js'
import type { PublicClient } from '../../src/clients/createPublicClient.js'
import type { WalletClient } from '../../src/clients/createWalletClient.js'
import type { Address, AddressInput } from '../../src/types/address.js'
import type {
  ContractFunctionArgs,
  ContractFunctionReturnType,
} from '../../src/types/contract.js'
import type { EventFilterArgs } from '../../src/types/log.js'
import type { Hex } from '../../src/types/misc.js'
import {
  base58Address,
  evmAddress,
  hexAddress,
  largeAbi,
  vaultAbi,
} from '../fixtures/abi/contractTypes.js'

const trc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

const address = 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe'

test('read.<fn> parameter and return inference (Public Client)', () => {
  const publicClient = {} as PublicClient
  const contract = getContract({ abi: trc20Abi, address, client: publicClient })

  // `read` is present on a Public Client.
  expectTypeOf(contract).toHaveProperty('read')
  // `write` / `estimateEnergy` are NOT (no `writeContract` on a Public Client).
  expectTypeOf(contract).not.toHaveProperty('write')
  expectTypeOf(contract).not.toHaveProperty('estimateEnergy')

  // balanceOf: `address` arg accepts any TRON form (Base58 / hex / EVM);
  // resolves to `bigint`.
  expectTypeOf(contract.read.balanceOf)
    .parameter(0)
    .toEqualTypeOf<readonly [AddressInput]>()
  expectTypeOf(contract.read.balanceOf).returns.resolves.toEqualTypeOf<bigint>()

  // totalSupply: no inputs → args tuple is elided, first parameter is options.
  expectTypeOf(
    contract.read.totalSupply,
  ).returns.resolves.toEqualTypeOf<bigint>()

  // address / abi are carried through.
  expectTypeOf(contract.address).toEqualTypeOf<typeof address>()
  expectTypeOf(contract.abi).toEqualTypeOf<typeof trc20Abi>()
})

test('write.<fn> / estimateEnergy.<fn> parameter inference (Wallet Client)', () => {
  const walletClient = {} as WalletClient
  const contract = getContract({ abi: trc20Abi, address, client: walletClient })

  // `write` / `estimateEnergy` are present on a Wallet Client.
  expectTypeOf(contract).toHaveProperty('write')
  expectTypeOf(contract).toHaveProperty('estimateEnergy')
  // `read` is NOT (no `readContract` on a bare Wallet Client).
  expectTypeOf(contract).not.toHaveProperty('read')

  // transfer: `(address, uint256)` → args `readonly [AddressInput, bigint | number]`,
  // resolves to the local txID plus the broadcast acknowledgement fields and
  // the broadcast transaction.
  expectTypeOf(contract.write.transfer)
    .parameter(0)
    .toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf(contract.write.transfer).returns.resolves.toEqualTypeOf<{
    txID: string
    result?: boolean | undefined
    code?: string | undefined
    message?: string | undefined
    transaction: SignableTransaction
  }>()

  // estimateEnergy.transfer: same args, resolves to `bigint`.
  expectTypeOf(contract.estimateEnergy.transfer)
    .parameter(0)
    .toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf(
    contract.estimateEnergy.transfer,
  ).returns.resolves.toEqualTypeOf<bigint>()
})

test('getEvents is always present', () => {
  const client = {} as Client
  const contract = getContract({ abi: trc20Abi, address, client })
  expectTypeOf(contract).toHaveProperty('getEvents')
})

// `getLogs` types its block selectors as mutually exclusive — a range, or one
// block by hash — and refuses the combination at runtime. The facade's options
// were a flat object with all three independently optional, so it compiled a
// call the action it feeds rejects, deferring a typo-level mistake to runtime.
test('getEvents block selectors are mutually exclusive, as in getLogs', () => {
  const client = {} as Client
  const contract = getContract({ abi: trc20Abi, address, client })
  type Options = NonNullable<Parameters<typeof contract.getEvents.Transfer>[0]>

  // A range, or a single block by hash — each with the shared filters.
  expectTypeOf<{ fromBlock: bigint; toBlock: 'latest' }>().toExtend<Options>()
  expectTypeOf<{ blockHash: Hex }>().toExtend<Options>()
  expectTypeOf<{
    blockHash: Hex
    args: { from: AddressInput }
    strict: boolean
  }>().toExtend<Options>()
  expectTypeOf<{
    fromBlock: bigint
    args: readonly unknown[]
    strict: boolean
  }>().toExtend<Options>()

  // Never both.
  expectTypeOf<{ blockHash: Hex; fromBlock: bigint }>().not.toExtend<Options>()
  expectTypeOf<{ blockHash: Hex; toBlock: bigint }>().not.toExtend<Options>()
  expectTypeOf<{
    blockHash: Hex
    fromBlock: bigint
  }>().not.toExtend<GetEventsOptions>()

  // Forwarding an unset selector as `undefined` stays legal on either side
  // (`exactOptionalPropertyTypes`): a wrapper holds `Hex | undefined`.
  expectTypeOf<{
    blockHash: undefined
    fromBlock: bigint
  }>().toExtend<Options>()
  expectTypeOf<{ blockHash: Hex; fromBlock: undefined }>().toExtend<Options>()
})

/////////////////////////////////////////////////////////////////////////////
// getEvents inference

const eventsAbi = [
  ...trc20Abi,
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  // Every input unnamed.
  {
    type: 'event',
    name: 'Unnamed',
    inputs: [
      { type: 'address', indexed: true },
      { type: 'uint256', indexed: false },
    ],
  },
  // Indexed inputs of the hashed types, next to a non-indexed one.
  {
    type: 'event',
    name: 'Hashed',
    inputs: [
      { name: 'label', type: 'string', indexed: true },
      { name: 'ids', type: 'uint256[]', indexed: true },
      { name: 'note', type: 'string', indexed: false },
    ],
  },
  { type: 'event', name: 'Ping', inputs: [] },
  // Two events sharing one name.
  {
    type: 'event',
    name: 'Overloaded',
    inputs: [{ name: 'a', type: 'address', indexed: true }],
  },
  {
    type: 'event',
    name: 'Overloaded',
    inputs: [{ name: 'a', type: 'uint256', indexed: true }],
  },
] as const

type AddressFilter = AddressInput | readonly AddressInput[] | null | undefined

test('getEvents.<Event> returns logs inferred for that event', async () => {
  const client = {} as Client
  const contract = getContract({ abi: eventsAbi, address, client })
  type Transfer = (typeof eventsAbi)[3]

  // Default (non-strict): each arg is optional, `args` can be `undefined`.
  const logs = await contract.getEvents.Transfer()
  expectTypeOf(logs).toEqualTypeOf<Log<Transfer>[]>()
  expectTypeOf(logs[0]!.eventName).toEqualTypeOf<'Transfer'>()
  expectTypeOf(logs[0]!.args).toEqualTypeOf<
    | {
        from?: Address | undefined
        to?: Address | undefined
        value?: bigint | undefined
      }
    | undefined
  >()
  expectTypeOf(await contract.getEvents.Transfer({})).toEqualTypeOf<
    Log<Transfer>[]
  >()
  expectTypeOf(
    await contract.getEvents.Transfer({ fromBlock: 1n, strict: false }),
  ).toEqualTypeOf<Log<Transfer>[]>()

  // `strict: true`: every arg is present.
  const strict = await contract.getEvents.Transfer({ strict: true })
  expectTypeOf(strict).toEqualTypeOf<Log<Transfer, true>[]>()
  expectTypeOf(strict[0]!.args).toEqualTypeOf<{
    from: Address
    to: Address
    value: bigint
  }>()

  // Each property is typed for its own event.
  const approvals = await contract.getEvents.Approval({ strict: true })
  expectTypeOf(approvals[0]!.eventName).toEqualTypeOf<'Approval'>()
  expectTypeOf(approvals[0]!.args).toEqualTypeOf<{
    owner: Address
    spender: Address
    value: bigint
  }>()

  // Unnamed inputs: a positional tuple.
  const unnamed = await contract.getEvents.Unnamed({ strict: true })
  expectTypeOf(unnamed[0]!.args).toEqualTypeOf<readonly [Address, bigint]>()
  const looseUnnamed = await contract.getEvents.Unnamed()
  expectTypeOf(looseUnnamed[0]!.args).toEqualTypeOf<
    readonly [(Address | undefined)?, (bigint | undefined)?] | undefined
  >()

  // Indexed string / array: the 32-byte topic under `strict`, the topic or
  // the value recovered from `data` otherwise.
  const hashed = await contract.getEvents.Hashed({ strict: true })
  expectTypeOf(hashed[0]!.args).toEqualTypeOf<{
    label: Hex
    ids: Hex
    note: string
  }>()
  const looseHashed = await contract.getEvents.Hashed()
  expectTypeOf(looseHashed[0]!.args?.label).toEqualTypeOf<
    Hex | string | undefined
  >()
  expectTypeOf(looseHashed[0]!.args?.ids).toEqualTypeOf<
    Hex | readonly bigint[] | undefined
  >()

  // No inputs.
  const pings = await contract.getEvents.Ping({ strict: true })
  expectTypeOf(pings[0]!.args).toEqualTypeOf<undefined>()
  const loosePings = await contract.getEvents.Ping()
  expectTypeOf(loosePings[0]!.args).toEqualTypeOf<
    Record<string, never> | undefined
  >()

  // Only the events of the ABI are offered.
  expectTypeOf(contract.getEvents).not.toHaveProperty('balanceOf')
  // @ts-expect-error not an event of the ABI
  contract.getEvents.Transferred
})

test('getEvents.<Event> filter args are typed from the event', () => {
  const client = {} as Client
  const contract = getContract({ abi: eventsAbi, address, client })
  type Transfer = (typeof eventsAbi)[3]
  type Options = GetEventsOptions<Transfer>

  expectTypeOf<NonNullable<Options['args']>>().toEqualTypeOf<
    EventFilterArgs<Transfer>
  >()
  expectTypeOf<NonNullable<Options['args']>>().toEqualTypeOf<
    | readonly [AddressFilter?, AddressFilter?]
    | { from?: AddressFilter; to?: AddressFilter }
  >()
  expectTypeOf<Options>().toExtend<
    Parameters<typeof contract.getEvents.Transfer>[0]
  >()

  // By name or position: a value, an OR-list, or a wildcard.
  contract.getEvents.Transfer({ args: { from: 'T...' } })
  contract.getEvents.Transfer({ args: { to: ['T...', '41...'], from: null } })
  contract.getEvents.Transfer({ args: [undefined, 'T...'], blockHash: '0x1' })
  contract.getEvents.Unnamed({ args: [['T...', 'T...']] })
  contract.getEvents.Hashed({ args: { label: ['a', 'b'] } })

  // @ts-expect-error `value` is not indexed
  contract.getEvents.Transfer({ args: { value: 1n } })
  // @ts-expect-error misspelt input name
  contract.getEvents.Transfer({ args: { form: 'T...' } })
  // @ts-expect-error an address filter is not a bigint
  contract.getEvents.Transfer({ args: { from: 1n } })
  // @ts-expect-error only two inputs are indexed
  contract.getEvents.Transfer({ args: [null, null, 1n] })
  // @ts-expect-error an address filter is not a bigint
  contract.getEvents.Transfer({ args: [1n] })
  // @ts-expect-error an OR-list of the wrong type
  contract.getEvents.Unnamed({ args: [[1n, 2n]] })
  // @ts-expect-error `owner` belongs to Approval
  contract.getEvents.Transfer({ args: { owner: 'T...' } })
  // @ts-expect-error unnamed inputs have no key
  contract.getEvents.Unnamed({ args: { account: 'T...' } })
  // @ts-expect-error an indexed array is not filterable
  contract.getEvents.Hashed({ args: { ids: [1n] } })
  // @ts-expect-error `note` is not indexed
  contract.getEvents.Hashed({ args: { note: 'hello' } })
  // @ts-expect-error no indexed inputs
  contract.getEvents.Ping({ args: { anything: 1 } })

  // A literal held in a variable is checked the same way.
  const misspelt = { form: 'T...' }
  // @ts-expect-error misspelt input name
  contract.getEvents.Transfer({ args: misspelt })
  const tooLong = [null, null, 1n] as const
  // @ts-expect-error only two inputs are indexed
  contract.getEvents.Transfer({ args: tooLong })
  // @ts-expect-error not a filter
  contract.getEvents.Transfer({ args: 'T...' })
  // @ts-expect-error not an option
  contract.getEvents.Transfer({ arg: { from: 'T...' } })
})

test('getEvents.<Event> takes a filter that is not narrowable as it is', async () => {
  const client = {} as Client
  const contract = getContract({ abi: eventsAbi, address, client })
  type Transfer = (typeof eventsAbi)[3]

  // An array of unknown length, an object without known keys, or both.
  const list = [] as readonly unknown[]
  const record = {} as Record<string, unknown>
  const wide = {} as GetEventsOptions['args']
  expectTypeOf(await contract.getEvents.Transfer({ args: list })).toEqualTypeOf<
    Log<Transfer>[]
  >()
  expectTypeOf(
    await contract.getEvents.Transfer({ args: record, strict: true }),
  ).toEqualTypeOf<Log<Transfer, true>[]>()
  expectTypeOf(
    await contract.getEvents.Transfer({ args: wide, fromBlock: 1n }),
  ).toEqualTypeOf<Log<Transfer>[]>()
  // A positional list built at runtime.
  const built = ['T...', null].filter(Boolean)
  expectTypeOf(await contract.getEvents.Unnamed({ args: built })).toEqualTypeOf<
    Log<(typeof eventsAbi)[5]>[]
  >()
})

test('getEvents.<Event>: a strict that can be undefined is not strict', async () => {
  const client = {} as Client
  const contract = getContract({ abi: eventsAbi, address, client })
  type Transfer = (typeof eventsAbi)[3]

  // `undefined` selects the default, which is non-strict.
  const forward = (strict?: true) => contract.getEvents.Transfer({ strict })
  expectTypeOf(forward).returns.resolves.toEqualTypeOf<Log<Transfer>[]>()
  const maybe = {} as { strict?: true | undefined; fromBlock?: bigint }
  expectTypeOf(await contract.getEvents.Transfer(maybe)).toEqualTypeOf<
    Log<Transfer>[]
  >()
  expectTypeOf(
    await contract.getEvents.Transfer({ strict: undefined }),
  ).toEqualTypeOf<Log<Transfer>[]>()
  expectTypeOf(
    await contract.getEvents.Transfer({ strict: true as boolean }),
  ).toEqualTypeOf<Log<Transfer>[]>()
})

test('getEvents.<Event> of an overloaded name never resolves to a value', () => {
  const client = {} as Client
  const contract = getContract({ abi: eventsAbi, address, client })
  // The call is rejected at runtime, whatever the options.
  expectTypeOf(contract.getEvents.Overloaded).toEqualTypeOf<
    (options?: GetEventsOptions) => Promise<never>
  >()
  expectTypeOf(contract.getEvents.Overloaded()).resolves.toBeNever()

  // The same entry listed twice (merged ABIs) is typed the same way.
  const merged = getContract({
    abi: [eventsAbi[3], eventsAbi[3]],
    address,
    client,
  })
  expectTypeOf(merged.getEvents.Transfer()).resolves.toBeNever()
})

test('getEvents on a wide ABI keeps the untyped shape', async () => {
  const client = {} as Client
  for (const abi of [eventsAbi as Abi, eventsAbi as readonly unknown[]]) {
    const contract = getContract({ abi, address, client })
    const logs = await contract.getEvents.Anything!({
      args: { whatever: 1 },
      strict: true,
    })
    expectTypeOf(logs).toEqualTypeOf<Log[]>()
  }
  const contract = getContract({ abi: eventsAbi as Abi, address, client })
  expectTypeOf(contract.getEvents.Transfer!).toEqualTypeOf<
    (options?: GetEventsOptions) => Promise<Log[]>
  >()
})

test('GetEventsOptions stays usable without type arguments', () => {
  expectTypeOf<GetEventsOptions['args']>().toEqualTypeOf<
    Record<string, unknown> | readonly unknown[] | undefined
  >()
  expectTypeOf<GetEventsOptions['strict']>().toEqualTypeOf<
    boolean | undefined
  >()
  expectTypeOf<GetEventsOptions>().toEqualTypeOf<GetEventsOptions<AbiEvent>>()
  const options: GetEventsOptions = {
    args: { from: 'T...' },
    strict: true,
    fromBlock: 1n,
    toBlock: 'latest',
  }

  // Options built without type arguments are accepted by a typed event, with
  // or without `args`; the logs are still inferred from the event.
  const client = {} as Client
  const contract = getContract({ abi: eventsAbi, address, client })
  type Transfer = (typeof eventsAbi)[3]
  expectTypeOf(contract.getEvents.Transfer(options)).resolves.toEqualTypeOf<
    Log<Transfer>[]
  >()
  const range: GetEventsOptions = { fromBlock: 1n, toBlock: 'latest' }
  expectTypeOf(contract.getEvents.Transfer(range)).resolves.toEqualTypeOf<
    Log<Transfer>[]
  >()
  expectTypeOf(
    contract.getEvents.Transfer({ ...range, strict: true }),
  ).resolves.toEqualTypeOf<Log<Transfer, true>[]>()
  // A wrapper declared with the unparameterised name type-checks.
  const transfers = (options?: GetEventsOptions) =>
    contract.getEvents.Transfer(options)
  expectTypeOf(transfers).returns.resolves.toEqualTypeOf<Log<Transfer>[]>()
  // ...as does one that picks the event by name.
  const events = (
    name: 'Transfer' | 'Approval',
    options?: GetEventsOptions,
  ): Promise<Log[]> => contract.getEvents[name](options)
  expectTypeOf(events).toBeFunction()

  // With an event, `args` and `strict` are typed.
  expectTypeOf<
    NonNullable<GetEventsOptions<Transfer, true>['args']>
  >().toEqualTypeOf<EventFilterArgs<Transfer>>()
  expectTypeOf<GetEventsOptions<Transfer, true>['strict']>().toEqualTypeOf<
    true | undefined
  >()
})

//////////////////////////////////////////////////////////////////////
// Helper types and call value options

test('read.<fn> agrees with ContractFunctionArgs / ContractFunctionReturnType', () => {
  const contract = getContract({
    abi: vaultAbi,
    address,
    client: {} as PublicClient,
  })

  expectTypeOf(contract.read.balanceOf)
    .parameter(0)
    .toEqualTypeOf<ContractFunctionArgs<typeof vaultAbi, 'view', 'balanceOf'>>()
  expectTypeOf(contract.read.balanceOf).returns.resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'balanceOf'>
  >()
  expectTypeOf(contract.read.owner).returns.resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'owner'>
  >()
  expectTypeOf(contract.read.owner).returns.resolves.toEqualTypeOf<Address>()
  expectTypeOf(contract.read.decimals).returns.resolves.toEqualTypeOf<bigint>()
  expectTypeOf(contract.read.holders).returns.resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'holders'>
  >()
  expectTypeOf(contract.read.position).returns.resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'position'>
  >()
  expectTypeOf(contract.read.pair).returns.resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'pair'>
  >()

  const args: ContractFunctionArgs<typeof vaultAbi, 'view', 'balanceOf'> = [
    hexAddress,
  ]
  contract.read.balanceOf(args)
  contract.read.balanceOf([base58Address])
  contract.read.balanceOf([evmAddress])
  // overloads take each overload's args
  contract.read.lookup()
  contract.read.lookup([hexAddress])
  contract.read.lookup([evmAddress, 1])
})

test('write.<fn> / estimateEnergy.<fn> args are ContractFunctionArgs', () => {
  const contract = getContract({
    abi: vaultAbi,
    address,
    client: {} as WalletClient,
  })

  expectTypeOf(contract.write.transfer)
    .parameter(0)
    .toEqualTypeOf<
      ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'>
    >()
  expectTypeOf(contract.estimateEnergy.transfer)
    .parameter(0)
    .toEqualTypeOf<
      ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'>
    >()
  expectTypeOf(contract.write.batch)
    .parameter(0)
    .toEqualTypeOf<
      ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'batch'>
    >()
  expectTypeOf(contract.write.depositFor)
    .parameter(0)
    .toEqualTypeOf<
      ContractFunctionArgs<typeof vaultAbi, 'payable', 'depositFor'>
    >()

  const args: ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'> =
    [hexAddress, 1]
  contract.write.transfer(args)
  contract.estimateEnergy.transfer(args)
  contract.write.transfer([base58Address, 1n])
  contract.write.transfer([evmAddress, 1n])
})

test('write.<fn>: call value options follow the function mutability', () => {
  const contract = getContract({
    abi: vaultAbi,
    address,
    client: {} as WalletClient,
  })

  // payable
  contract.write.deposit({
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  contract.write.depositFor([hexAddress], {
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  contract.write.deposit()
  contract.write.deposit({ feeLimit: 1n })
  contract.write.depositFor([hexAddress])
  contract.write.deposit({ callValue: undefined })

  // nonpayable
  contract.write.transfer([base58Address, 1n])
  contract.write.transfer([base58Address, 1n], { feeLimit: 1n })
  contract.write.transfer([base58Address, 1n], { callValue: undefined })
  contract.write.burn()
  contract.write.burn({ feeLimit: 1n })
  // @ts-expect-error `transfer` is not payable
  contract.write.transfer([base58Address, 1n], { callValue: 1n })
  // @ts-expect-error `transfer` is not payable
  contract.write.transfer([base58Address, 1n], { callTokenValue: 1n })
  // @ts-expect-error `transfer` is not payable
  contract.write.transfer([base58Address, 1n], { tokenId: 1000001n })
  // @ts-expect-error `burn` is not payable
  contract.write.burn({ callValue: 1n })

  type DepositOptions = NonNullable<
    Parameters<typeof contract.write.deposit>[0]
  >
  expectTypeOf<DepositOptions['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<DepositOptions['callTokenValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<DepositOptions['tokenId']>().toEqualTypeOf<bigint | undefined>()
  type BurnOptions = NonNullable<Parameters<typeof contract.write.burn>[0]>
  expectTypeOf<BurnOptions['callValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<BurnOptions['callTokenValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<BurnOptions['tokenId']>().toEqualTypeOf<undefined>()
  // the other options are the same either way
  expectTypeOf<
    Omit<BurnOptions, 'callValue' | 'callTokenValue' | 'tokenId'>
  >().toEqualTypeOf<
    Omit<DepositOptions, 'callValue' | 'callTokenValue' | 'tokenId'>
  >()
})

test('estimateEnergy.<fn>: call value options follow the function mutability', () => {
  const contract = getContract({
    abi: vaultAbi,
    address,
    client: {} as WalletClient,
  })

  // payable
  contract.estimateEnergy.deposit({
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  contract.estimateEnergy.depositFor([evmAddress], { callValue: 1n })
  contract.estimateEnergy.deposit()
  contract.estimateEnergy.depositFor([evmAddress])

  // nonpayable
  contract.estimateEnergy.transfer([base58Address, 1n])
  contract.estimateEnergy.transfer([base58Address, 1n], { confirmed: true })
  contract.estimateEnergy.burn()
  // @ts-expect-error `transfer` is not payable
  contract.estimateEnergy.transfer([base58Address, 1n], { callValue: 1n })
  // @ts-expect-error `transfer` is not payable
  contract.estimateEnergy.transfer([base58Address, 1n], { callTokenValue: 1n })
  // @ts-expect-error `transfer` is not payable
  contract.estimateEnergy.transfer([base58Address, 1n], { tokenId: 1000001n })
  // @ts-expect-error `burn` is not payable
  contract.estimateEnergy.burn({ callValue: 1n })
})

test('write.<fn> / estimateEnergy.<fn>: each overload has its own options', () => {
  const contract = getContract({
    abi: vaultAbi,
    address,
    client: {} as WalletClient,
  })

  // `send(address)` is payable, `send(address,uint256)` is not
  contract.write.send([base58Address], { callValue: 1n })
  contract.write.send([hexAddress], { callTokenValue: 1n, tokenId: 1000001n })
  contract.write.send([evmAddress, 1n])
  contract.write.send([evmAddress, 1n], { feeLimit: 1n })
  // @ts-expect-error `send(address,uint256)` is not payable
  contract.write.send([evmAddress, 1n], { callValue: 1n })
  contract.estimateEnergy.send([base58Address], { callValue: 1n })
  // @ts-expect-error `send(address,uint256)` is not payable
  contract.estimateEnergy.send([evmAddress, 1n], { callValue: 1n })

  // `stake()` is not payable, `stake(address)` is
  contract.write.stake()
  contract.write.stake({ feeLimit: 1n })
  contract.write.stake([hexAddress], { callValue: 1n })
  // @ts-expect-error `stake()` is not payable
  contract.write.stake({ callValue: 1n })

  // no overload of `move` is payable
  contract.write.move([base58Address])
  // @ts-expect-error `move(address)` is not payable
  contract.write.move([base58Address], { callValue: 1n })
  // @ts-expect-error `move(address,address)` is not payable
  contract.write.move([base58Address, hexAddress], { callValue: 1n })
})

test('a readonly unknown[] abi keeps the call value options', () => {
  const contract = getContract({
    abi: [] as readonly unknown[],
    address,
    client: {} as WalletClient,
  })
  contract.write.anything?.(['x', 1n], {
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  contract.estimateEnergy.anything?.(['x', 1n], {
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
})

test('a wide Abi keeps write / estimateEnergy callable, with the call value options', () => {
  const contract = getContract({
    abi: [] as unknown as Abi,
    address,
    client: {} as WalletClient,
  })
  contract.write.anything?.(['x', 1n])
  contract.write.anything?.(['x', 1n], {
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  contract.estimateEnergy.anything?.([])
  contract.estimateEnergy.anything?.(['x', 1n], {
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })

  // the same functions as a `readonly unknown[]` abi gives
  const untyped = getContract({
    abi: [] as readonly unknown[],
    address,
    client: {} as WalletClient,
  })
  expectTypeOf(contract.write).toEqualTypeOf<typeof untyped.write>()
  expectTypeOf(contract.estimateEnergy).toEqualTypeOf<
    typeof untyped.estimateEnergy
  >()
  type WriteAnything = NonNullable<typeof contract.write.anything>
  expectTypeOf<Parameters<WriteAnything>[0]>().toEqualTypeOf<
    readonly unknown[]
  >()
  expectTypeOf<
    NonNullable<Parameters<WriteAnything>[1]>['callValue']
  >().toEqualTypeOf<bigint | undefined>()
  type EstimateAnything = NonNullable<typeof contract.estimateEnergy.anything>
  expectTypeOf<Parameters<EstimateAnything>[0]>().toEqualTypeOf<
    readonly unknown[]
  >()
  expectTypeOf<
    NonNullable<Parameters<EstimateAnything>[1]>['tokenId']
  >().toEqualTypeOf<bigint | undefined>()
})

test('write.<fn>: a tuple argument with unnamed components', () => {
  const contract = getContract({
    abi: vaultAbi,
    address,
    client: {} as WalletClient,
  })
  // a `readonly` or a mutable tuple
  const raw = [evmAddress, true] as const
  const mutableRaw: [AddressInput, boolean] = [hexAddress, false]
  contract.write.batch([
    [hexAddress],
    [1, 2n],
    { to: base58Address, amount: 1n },
    raw,
  ])
  contract.estimateEnergy.batch([
    [hexAddress],
    [1, 2n],
    { to: base58Address, amount: 1n },
    mutableRaw,
  ])
})

test('a thirty-function abi resolves through the facade', () => {
  const contract = getContract({
    abi: largeAbi,
    address,
    client: {} as PublicClient & WalletClient,
  })

  expectTypeOf(contract.read.owner).returns.resolves.toEqualTypeOf<Address>()
  expectTypeOf(contract.read.getReserves).returns.resolves.toEqualTypeOf<
    readonly [bigint, bigint, bigint]
  >()
  expectTypeOf(contract.read.allowance)
    .parameter(0)
    .toEqualTypeOf<readonly [AddressInput, AddressInput]>()
  contract.read.quote([1n, [base58Address, hexAddress]])
  contract.write.permit([base58Address, hexAddress, 1n, 2, 27, '0x', '0x'])
  contract.write.deposit({ callValue: 1n })
  contract.write.multicall([['0x']], { callValue: 1n })
  contract.write.safeTransfer([evmAddress, 1n, '0x'], { callValue: 1n })
  // @ts-expect-error `safeTransfer(address,uint256)` is not payable
  contract.write.safeTransfer([evmAddress, 1n], { callValue: 1n })
  // @ts-expect-error `mint` is not payable
  contract.estimateEnergy.mint([evmAddress, 1n], { callValue: 1n })
  contract.getEvents.OwnershipTransferred({
    args: { previousOwner: hexAddress },
  })
})
