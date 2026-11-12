// Type-surface tests for `estimateEnergy`: `args` are `ContractFunctionArgs`,
// and the call value options (`callValue`, `callTokenValue`, `tokenId`) take a
// value when the selected function is `payable`.
import { type Abi, type AbiFunction, parseAbi } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import {
  type EstimateEnergyParameters,
  estimateEnergy,
} from '../../../src/actions/public/estimateEnergy.js'
import type { Client } from '../../../src/clients/createClient.js'
import type { Address, AddressInput } from '../../../src/types/address.js'
import type {
  AbiItem,
  ContractFunctionArgs,
  ContractFunctionName,
} from '../../../src/types/contract.js'
import {
  base58Address,
  evmAddress,
  hexAddress,
  largeAbi,
  noConstructorAbi,
  vaultAbi,
} from '../../fixtures/abi/contractTypes.js'

const client = {} as Client
const address = base58Address
const wideAbi = [] as unknown as Abi
const unknownAbi = [] as readonly unknown[]
// abi types that are not a tuple of literal items
const fragment = {} as AbiFunction
const readonlyFragments = [] as readonly AbiFunction[]
const items = [] as AbiItem[]

/** A `payable` overload without inputs and a `nonpayable` one with. */
const tipAbi = parseAbi(['function tip() payable', 'function tip(address to)'])

type Write = 'nonpayable' | 'payable'

test('estimateEnergy: args are ContractFunctionArgs', () => {
  expectTypeOf<
    EstimateEnergyParameters<typeof vaultAbi, 'transfer'>['args']
  >().toEqualTypeOf<ContractFunctionArgs<typeof vaultAbi, Write, 'transfer'>>()
  expectTypeOf<
    EstimateEnergyParameters<typeof vaultAbi, 'transfer'>['args']
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()

  const args: ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'> =
    [base58Address, 1n]
  expectTypeOf(
    estimateEnergy(client, {
      abi: vaultAbi,
      address,
      functionName: 'transfer',
      args,
    }),
  ).resolves.toEqualTypeOf<bigint>()
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [hexAddress, 1],
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [evmAddress, 1n],
  })
})

test('estimateEnergy: call value options on a payable function', () => {
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'depositFor',
    args: [hexAddress],
    callValue: 1n,
  })

  // omitted, or explicitly `undefined`
  estimateEnergy(client, { abi: vaultAbi, address, functionName: 'deposit' })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'deposit',
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })

  type Deposit = EstimateEnergyParameters<typeof vaultAbi, 'deposit'>
  expectTypeOf<Deposit['callValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Deposit['callTokenValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Deposit['tokenId']>().toEqualTypeOf<bigint | undefined>()
})

test('estimateEnergy: call value options on a nonpayable function', () => {
  // omitted, or explicitly `undefined`
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'burn',
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })

  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callTokenValue: 1n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    tokenId: 1000001n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'burn',
    // @ts-expect-error `burn` is not payable
    callValue: 1n,
  })

  type Transfer = EstimateEnergyParameters<typeof vaultAbi, 'transfer'>
  expectTypeOf<Transfer['callValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Transfer['callTokenValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Transfer['tokenId']>().toEqualTypeOf<undefined>()
  // the other options are not affected
  expectTypeOf<Transfer['confirmed']>().toEqualTypeOf<boolean | undefined>()
})

test('estimateEnergy: overloads — the overload selected by args decides', () => {
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address],
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress],
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [evmAddress, 1],
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [evmAddress, 1],
    // @ts-expect-error `send(address,uint256)` is not payable
    callValue: 1n,
  })
  // a call without args selects `stake()`, which is not payable
  estimateEnergy(client, { abi: vaultAbi, address, functionName: 'stake' })
  // @ts-expect-error `stake()` is not payable
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    callValue: 1n,
  })
  // @ts-expect-error `stake()` is not payable
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    callTokenValue: 1n,
  })
  // @ts-expect-error `stake()` is not payable
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    tokenId: 1000001n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [],
    // @ts-expect-error `stake()` is not payable
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [hexAddress],
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: [base58Address, hexAddress],
    // @ts-expect-error `move(address,address)` is not payable
    callValue: 1n,
  })
})

test('estimateEnergy: overloads — args that select no single overload', () => {
  const sendArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'send'
  >
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: sendArgs,
    callValue: 1n,
    callTokenValue: 1n,
    tokenId: 1000001n,
  })

  const moveArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'move'
  >
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: moveArgs,
    // @ts-expect-error no overload of `move` is payable
    callValue: 1n,
  })
})

test('estimateEnergy: overloads — undetermined args on a name with an overload without inputs', () => {
  // args typed as the union of `stake()` and `stake(address)`
  const stakeArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'stake'
  >
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: stakeArgs,
    callValue: 1n,
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
  const either = [] as readonly [] | readonly [Address]
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: either,
    callValue: 1n,
  })
  const untyped = [] as any
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: untyped,
    callValue: 1n,
  })

  // the parameters type without `args`: either overload
  const parameters: EstimateEnergyParameters<typeof vaultAbi, 'stake'> = {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [base58Address],
    callValue: 1n,
  }
  estimateEnergy(client, parameters)
  estimateEnergy<typeof vaultAbi, 'stake'>(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [base58Address],
    callValue: 1n,
  })
  // … and without `args` the options are those of `stake()`
  expectTypeOf<{
    abi: typeof vaultAbi
    address: Address
    functionName: 'stake'
  }>().toExtend<EstimateEnergyParameters<typeof vaultAbi, 'stake'>>()
  expectTypeOf<{
    abi: typeof vaultAbi
    address: Address
    functionName: 'stake'
    callValue: bigint
  }>().not.toExtend<EstimateEnergyParameters<typeof vaultAbi, 'stake'>>()

  type Stake<
    args extends ContractFunctionArgs<
      typeof vaultAbi,
      Write,
      'stake'
    > = ContractFunctionArgs<typeof vaultAbi, Write, 'stake'>,
  > = EstimateEnergyParameters<typeof vaultAbi, 'stake', args>
  expectTypeOf<Stake['callValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Stake['args']>().toEqualTypeOf<
    readonly [] | readonly [AddressInput] | undefined
  >()
  expectTypeOf<Stake<readonly []>['callValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Stake<readonly [Address]>['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()

  // a `payable` overload without inputs, a `nonpayable` one with
  estimateEnergy(client, {
    abi: tipAbi,
    address,
    functionName: 'tip',
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: tipAbi,
    address,
    functionName: 'tip',
    args: [base58Address],
    // @ts-expect-error `tip(address)` is not payable
    callValue: 1n,
  })
})

test('estimateEnergy: a tuple argument with unnamed components', () => {
  const raw = [evmAddress, true] as const
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName: 'batch',
    args: [[hexAddress], [1, 2n], { to: base58Address, amount: 1n }, raw],
  })
})

test('estimateEnergy: a function the abi type does not list keeps the options', () => {
  // abi types that are not a tuple of literal items, with a literal name
  estimateEnergy(client, {
    abi: [fragment],
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  estimateEnergy(client, {
    abi: readonlyFragments,
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: items,
    address,
    functionName: 'deposit',
    args: [1n],
    callValue: 1n,
  })
  expectTypeOf<
    EstimateEnergyParameters<readonly AbiFunction[], 'deposit'>['callValue']
  >().toEqualTypeOf<bigint | undefined>()

  // literal abis without a `nonpayable` / `payable` function
  estimateEnergy(client, {
    abi: [],
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: noConstructorAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  // … and a name typed `string`
  const name = 'deposit' as string
  estimateEnergy(client, {
    abi: noConstructorAbi,
    address,
    functionName: name,
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  expectTypeOf<
    EstimateEnergyParameters<typeof noConstructorAbi, string>['callValue']
  >().toEqualTypeOf<bigint | undefined>()
})

test('estimateEnergy: a wide abi or a non-literal name keeps the options', () => {
  estimateEnergy(client, {
    abi: wideAbi,
    address,
    functionName: 'anything',
    args: ['x', 1n],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  estimateEnergy(client, {
    abi: unknownAbi,
    address,
    functionName: 'anything',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })

  const functionName = 'burn' as ContractFunctionName<typeof vaultAbi, Write>
  estimateEnergy(client, {
    abi: vaultAbi,
    address,
    functionName,
    args: [],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })

  // unparameterised
  expectTypeOf<EstimateEnergyParameters['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<EstimateEnergyParameters['callTokenValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<EstimateEnergyParameters['tokenId']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<EstimateEnergyParameters<Abi>['args']>().toEqualTypeOf<
    readonly unknown[] | undefined
  >()
})

test('estimateEnergy resolves on a thirty-function abi', () => {
  estimateEnergy(client, {
    abi: largeAbi,
    address,
    functionName: 'transferFrom',
    args: [base58Address, hexAddress, 1],
  })
  estimateEnergy(client, {
    abi: largeAbi,
    address,
    functionName: 'depositFor',
    args: [evmAddress],
    callValue: 1n,
  })
  estimateEnergy(client, {
    abi: largeAbi,
    address,
    functionName: 'safeTransfer',
    args: [evmAddress, 1n],
    // @ts-expect-error `safeTransfer(address,uint256)` is not payable
    callValue: 1n,
  })
})
