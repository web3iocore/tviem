// Type-surface tests for `writeContract` / `buildWriteContract`: `args` are
// `ContractFunctionArgs`, and the call value options (`callValue`,
// `callTokenValue`, `tokenId`) take a value when the selected function is
// `payable`.
import { type Abi, type AbiFunction, parseAbi } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import {
  type BuildWriteContractParameters,
  buildWriteContract,
  type WriteContractParameters,
  writeContract,
} from '../../../src/actions/wallet/writeContract.js'
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
const fragments = [] as AbiFunction[]
const readonlyFragments = [] as readonly AbiFunction[]
const items = [] as AbiItem[]

/** A `payable` overload without inputs and a `nonpayable` one with. */
const tipAbi = parseAbi(['function tip() payable', 'function tip(address to)'])

/** Overloads told apart by a tuple argument with unnamed components. */
const pairAbi = [
  {
    type: 'function',
    name: 'set',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'set',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'pair',
        type: 'tuple',
        components: [{ type: 'address' }, { type: 'bool' }],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'set',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'pair',
        type: 'tuple',
        components: [{ type: 'address' }, { type: 'bool' }],
      },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

type Write = 'nonpayable' | 'payable'

test('writeContract: args are ContractFunctionArgs', () => {
  expectTypeOf<
    WriteContractParameters<typeof vaultAbi, 'transfer'>['args']
  >().toEqualTypeOf<ContractFunctionArgs<typeof vaultAbi, Write, 'transfer'>>()
  expectTypeOf<
    WriteContractParameters<typeof vaultAbi, 'transfer'>['args']
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf<
    WriteContractParameters<typeof vaultAbi, 'burn'>['args']
  >().toEqualTypeOf<readonly [] | undefined>()

  const args: ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'> =
    [base58Address, 1n]
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [hexAddress, 1],
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [evmAddress, 1n],
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    // @ts-expect-error an integer input does not take a string
    args: [base58Address, '1'],
  })

  const batchArgs: ContractFunctionArgs<
    typeof vaultAbi,
    'nonpayable',
    'batch'
  > = [
    [hexAddress],
    [1, 2n],
    { to: base58Address, amount: 1n },
    [evmAddress, true],
  ]
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'batch',
    args: batchArgs,
  })
})

test('writeContract: call value options on a payable function', () => {
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'depositFor',
    args: [hexAddress],
    callValue: 1n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'depositFor',
    args: [base58Address],
    callTokenValue: 2n,
    tokenId: 1000001n,
    permissionId: 2,
  })

  // omitted, or explicitly `undefined`
  writeContract(client, { abi: vaultAbi, address, functionName: 'deposit' })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'deposit',
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })

  type Deposit = WriteContractParameters<typeof vaultAbi, 'deposit'>
  expectTypeOf<Deposit['callValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Deposit['callTokenValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Deposit['tokenId']>().toEqualTypeOf<bigint | undefined>()
})

test('writeContract: call value options on a nonpayable function', () => {
  // omitted, or explicitly `undefined`
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
  })
  writeContract(client, { abi: vaultAbi, address, functionName: 'burn' })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'burn',
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })

  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callValue: 1n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callTokenValue: 1n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    tokenId: 1000001n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'burn',
    // @ts-expect-error `burn` is not payable
    callValue: 1n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callValue: 1n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'burn',
    // @ts-expect-error `burn` is not payable
    tokenId: 1000001n,
  })

  type Transfer = WriteContractParameters<typeof vaultAbi, 'transfer'>
  expectTypeOf<Transfer['callValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Transfer['callTokenValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Transfer['tokenId']>().toEqualTypeOf<undefined>()
  type BuildTransfer = BuildWriteContractParameters<typeof vaultAbi, 'transfer'>
  expectTypeOf<BuildTransfer['callValue']>().toEqualTypeOf<undefined>()
  // the other options are not affected
  expectTypeOf<Transfer['feeLimit']>().toEqualTypeOf<bigint | undefined>()
})

test('writeContract: overloads — the overload selected by args decides', () => {
  // `send(address)` is payable
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address],
    callValue: 1n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress],
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [evmAddress],
    callValue: 1n,
  })

  // `send(address,uint256)` is not
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address, 1n],
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address, 1n],
    // @ts-expect-error `send(address,uint256)` is not payable
    callValue: 1n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress, 1],
    // @ts-expect-error `send(address,uint256)` is not payable
    tokenId: 1000001n,
  })

  // `stake()` is not payable, `stake(address)` is
  writeContract(client, { abi: vaultAbi, address, functionName: 'stake' })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [],
    // @ts-expect-error `stake()` is not payable
    callValue: 1n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [evmAddress],
    callValue: 1n,
  })

  // no overload of `move` is payable
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: [base58Address],
    // @ts-expect-error `move(address)` is not payable
    callValue: 1n,
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: [base58Address, hexAddress],
    // @ts-expect-error `move(address,address)` is not payable
    callValue: 1n,
  })
})

test('writeContract: overloads — a call without args selects the overload without inputs', () => {
  // `stake()` is not payable: a call value takes the args of `stake(address)`
  writeContract(client, { abi: vaultAbi, address, functionName: 'stake' })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: undefined,
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })
  // @ts-expect-error `stake()` is not payable
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    callValue: 1n,
  })
  // @ts-expect-error `stake()` is not payable
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    callTokenValue: 1n,
  })
  // @ts-expect-error `stake()` is not payable
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    tokenId: 1000001n,
  })
  // @ts-expect-error `stake()` is not payable
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: undefined,
    callValue: 1n,
  })
  // @ts-expect-error `stake()` is not payable
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    callValue: 1n,
  })

  // a `payable` overload without inputs, a `nonpayable` one with
  writeContract(client, {
    abi: tipAbi,
    address,
    functionName: 'tip',
    callValue: 1n,
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
  writeContract(client, {
    abi: tipAbi,
    address,
    functionName: 'tip',
    args: [],
    callValue: 1n,
  })
  writeContract(client, {
    abi: tipAbi,
    address,
    functionName: 'tip',
    args: [base58Address],
  })
  writeContract(client, {
    abi: tipAbi,
    address,
    functionName: 'tip',
    args: [base58Address],
    // @ts-expect-error `tip(address)` is not payable
    callValue: 1n,
  })
})

test('buildWriteContract: overloads — the overload selected by args decides', () => {
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address],
    callValue: 1n,
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress, 1],
    // @ts-expect-error `send(address,uint256)` is not payable
    callValue: 1n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [evmAddress],
    callValue: 1n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [],
    // @ts-expect-error `stake()` is not payable
    callValue: 1n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: [base58Address, hexAddress],
    // @ts-expect-error `move(address,address)` is not payable
    tokenId: 1000001n,
  })
})

test('writeContract: overloads — args that select no single overload', () => {
  // args typed as the union of both overloads: any payable overload offers
  // the options
  const sendArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'send'
  >
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: sendArgs,
    callValue: 1n,
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
  expectTypeOf<
    WriteContractParameters<typeof vaultAbi, 'send'>['callValue']
  >().toEqualTypeOf<bigint | undefined>()

  // none of the overloads is payable
  const moveArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'move'
  >
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: moveArgs,
    // @ts-expect-error no overload of `move` is payable
    callValue: 1n,
  })
  expectTypeOf<
    WriteContractParameters<typeof vaultAbi, 'move'>['callValue']
  >().toEqualTypeOf<undefined>()
})

test('writeContract: overloads — undetermined args on a name with an overload without inputs', () => {
  // args typed as the union of `stake()` and `stake(address)`
  const stakeArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'stake'
  >
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: stakeArgs,
    callValue: 1n,
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
  buildWriteContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: stakeArgs,
    callValue: 1n,
  })
  const either = [] as readonly [] | readonly [Address]
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: either,
    callValue: 1n,
  })
  const withAddress = true as boolean
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: withAddress ? [base58Address] : [],
    callValue: 1n,
  })
  const untyped = [] as any
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: untyped,
    callValue: 1n,
  })

  // the parameters type without `args`: either overload
  const parameters: WriteContractParameters<typeof vaultAbi, 'stake'> = {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [base58Address],
    callValue: 1n,
  }
  writeContract(client, parameters)
  // … and without `args` the options are those of `stake()`
  expectTypeOf<{
    abi: typeof vaultAbi
    address: Address
    functionName: 'stake'
    args: readonly [Address]
    callValue: bigint
  }>().toExtend<WriteContractParameters<typeof vaultAbi, 'stake'>>()
  expectTypeOf<{
    abi: typeof vaultAbi
    address: Address
    functionName: 'stake'
  }>().toExtend<WriteContractParameters<typeof vaultAbi, 'stake'>>()
  expectTypeOf<{
    abi: typeof vaultAbi
    address: Address
    functionName: 'stake'
    callValue: bigint
  }>().not.toExtend<WriteContractParameters<typeof vaultAbi, 'stake'>>()
  writeContract<typeof vaultAbi, 'stake'>(client, {
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [base58Address],
    callValue: 1n,
  })
  function forward<
    const abi extends Abi | readonly unknown[],
    functionName extends ContractFunctionName<abi, Write>,
  >(forwarded: WriteContractParameters<abi, functionName>) {
    return writeContract(client, forwarded)
  }
  forward({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [base58Address],
    callValue: 1n,
  })

  type Stake<
    args extends ContractFunctionArgs<
      typeof vaultAbi,
      Write,
      'stake'
    > = ContractFunctionArgs<typeof vaultAbi, Write, 'stake'>,
  > = WriteContractParameters<typeof vaultAbi, 'stake', args>
  expectTypeOf<Stake['callValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Stake['args']>().toEqualTypeOf<
    readonly [] | readonly [AddressInput] | undefined
  >()
  expectTypeOf<Stake<readonly []>['callValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Stake<readonly [Address]>['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()

  // every overload of `move` is nonpayable, whatever the args
  const moveEither = [base58Address] as
    | readonly [Address]
    | readonly [Address, Address]
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: moveEither,
    // @ts-expect-error no overload of `move` is payable
    callValue: 1n,
  })
})

test('writeContract: a tuple argument with unnamed components', () => {
  // a `readonly` or a mutable tuple
  const raw = [evmAddress, true] as const
  const mutableRaw: [AddressInput, boolean] = [hexAddress, false]
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'batch',
    args: [[hexAddress], [1, 2n], { to: base58Address, amount: 1n }, raw],
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'batch',
    args: [
      [hexAddress],
      [1, 2n],
      { to: base58Address, amount: 1n },
      mutableRaw,
    ],
  })
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'batch',
    args: [
      [hexAddress],
      [1, 2n],
      { to: base58Address, amount: 1n },
      [evmAddress, true],
    ],
  })

  // such a tuple selects its overload
  writeContract(client, {
    abi: pairAbi,
    address,
    functionName: 'set',
    args: [[base58Address, true]],
    callValue: 1n,
  })
  writeContract(client, {
    abi: pairAbi,
    address,
    functionName: 'set',
    args: [raw],
    callValue: 1n,
  })
  writeContract(client, {
    abi: pairAbi,
    address,
    functionName: 'set',
    args: [[base58Address, true], 1n],
    // @ts-expect-error `set((address,bool),uint256)` is not payable
    callValue: 1n,
  })
  writeContract(client, {
    abi: pairAbi,
    address,
    functionName: 'set',
    args: [raw, 1],
    // @ts-expect-error `set((address,bool),uint256)` is not payable
    callValue: 1n,
  })
})

test('writeContract: a wide abi keeps the call value options', () => {
  writeContract(client, {
    abi: wideAbi,
    address,
    functionName: 'anything',
    args: ['x', 1n],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  writeContract(client, {
    abi: unknownAbi,
    address,
    functionName: 'anything',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  buildWriteContract(client, {
    abi: wideAbi,
    address,
    functionName: 'anything',
    callValue: 1n,
  })

  // an abi literal without `as const`
  const looseAbi = [
    {
      type: 'function',
      name: 'transfer',
      stateMutability: 'nonpayable',
      inputs: [],
      outputs: [],
    },
  ]
  writeContract(client, {
    abi: looseAbi,
    address,
    functionName: 'transfer',
    callValue: 1n,
  })

  // abi types that are not a tuple of literal items, with a literal name
  writeContract(client, {
    abi: [fragment],
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  writeContract(client, {
    abi: fragments,
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  writeContract(client, {
    abi: readonlyFragments,
    address,
    functionName: 'deposit',
    args: [1n],
    callValue: 1n,
  })
  writeContract(client, {
    abi: items,
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  buildWriteContract(client, {
    abi: items,
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  expectTypeOf<
    WriteContractParameters<readonly AbiFunction[], 'deposit'>['callValue']
  >().toEqualTypeOf<bigint | undefined>()

  // literal abis without a `nonpayable` / `payable` function
  writeContract(client, {
    abi: [],
    address,
    functionName: 'deposit',
    args: [1],
    callValue: 1n,
  })
  writeContract(client, {
    abi: noConstructorAbi,
    address,
    functionName: 'deposit',
    args: [1],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  buildWriteContract(client, {
    abi: noConstructorAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
  })

  // unparameterised
  expectTypeOf<WriteContractParameters['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<WriteContractParameters['callTokenValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<WriteContractParameters['tokenId']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<BuildWriteContractParameters['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<WriteContractParameters<Abi>['args']>().toEqualTypeOf<
    readonly unknown[] | undefined
  >()
})

test('writeContract: a function name that is not a literal keeps the options', () => {
  const functionName = 'burn' as ContractFunctionName<typeof vaultAbi, Write>
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName,
    args: [],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })

  const either = 'burn' as 'burn' | 'deposit'
  writeContract(client, {
    abi: vaultAbi,
    address,
    functionName: either,
    callValue: 1n,
  })

  const name = 'burn' as string
  writeContract(client, {
    abi: wideAbi,
    address,
    functionName: name,
    callValue: 1n,
  })
  // a literal abi without a `nonpayable` / `payable` function
  writeContract(client, {
    abi: noConstructorAbi,
    address,
    functionName: name,
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  buildWriteContract(client, {
    abi: noConstructorAbi,
    address,
    functionName: name,
    callValue: 1n,
  })
  expectTypeOf<
    WriteContractParameters<typeof noConstructorAbi, string>['callValue']
  >().toEqualTypeOf<bigint | undefined>()
})

test('writeContract resolves on a thirty-function abi', () => {
  writeContract(client, {
    abi: largeAbi,
    address,
    functionName: 'permit',
    args: [base58Address, hexAddress, 1n, 2, 27, '0x', '0x'],
  })
  writeContract(client, {
    abi: largeAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  writeContract(client, {
    abi: largeAbi,
    address,
    functionName: 'multicall',
    args: [['0x']],
    callValue: 1n,
  })
  writeContract(client, {
    abi: largeAbi,
    address,
    functionName: 'safeTransfer',
    args: [evmAddress, 1n, '0x'],
    callValue: 1n,
  })
  writeContract(client, {
    abi: largeAbi,
    address,
    functionName: 'safeTransfer',
    args: [evmAddress, 1n],
    // @ts-expect-error `safeTransfer(address,uint256)` is not payable
    callValue: 1n,
  })
  writeContract(client, {
    abi: largeAbi,
    address,
    functionName: 'swap',
    args: [1n, 0, base58Address, '0x'],
    // @ts-expect-error `swap` is not payable
    callValue: 1n,
  })
})
