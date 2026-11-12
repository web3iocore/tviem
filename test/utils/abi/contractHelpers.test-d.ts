// Type-surface tests tying the contract helper types of `src/types/contract.ts`
// to the ABI codecs they describe: each helper resolves to the type the
// function takes or returns, and a value annotated with the helper is accepted
// by the function.
import type { Abi } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import type { Address, AddressInput } from '../../../src/types/address.js'
import type {
  AbiItemArgs,
  ContractConstructorArgs,
  ContractErrorArgs,
  ContractEventArgsFromTopics,
  ContractFunctionArgs,
  ContractFunctionReturnType,
  ExtractAbiItemForArgs,
} from '../../../src/types/contract.js'
import type { Hex } from '../../../src/types/misc.js'
import { decodeAbiParameters } from '../../../src/utils/abi/decodeAbiParameters.js'
import { decodeDeployData } from '../../../src/utils/abi/decodeDeployData.js'
import { decodeErrorResult } from '../../../src/utils/abi/decodeErrorResult.js'
import { decodeEventLog } from '../../../src/utils/abi/decodeEventLog.js'
import { decodeFunctionData } from '../../../src/utils/abi/decodeFunctionData.js'
import { decodeFunctionResult } from '../../../src/utils/abi/decodeFunctionResult.js'
import { encodeAbiParameters } from '../../../src/utils/abi/encodeAbiParameters.js'
import { encodeDeployData } from '../../../src/utils/abi/encodeDeployData.js'
import { encodeErrorResult } from '../../../src/utils/abi/encodeErrorResult.js'
import { encodeFunctionData } from '../../../src/utils/abi/encodeFunctionData.js'
import { getAbiItem } from '../../../src/utils/abi/getAbiItem.js'
import { prepareEncodeFunctionData } from '../../../src/utils/abi/prepareEncodeFunctionData.js'
import {
  base58Address,
  evmAddress,
  hexAddress,
  largeAbi,
  noConstructorAbi,
  nonpayableConstructorAbi,
  payableConstructorAbi,
  vaultAbi,
} from '../../fixtures/abi/contractTypes.js'

const wideAbi = [] as unknown as Abi
const unknownAbi = [] as readonly unknown[]

type AllMutabilities = 'nonpayable' | 'payable' | 'pure' | 'view'

test('encodeFunctionData: args show the TRON input mapping', () => {
  type Parameters_ = Parameters<
    typeof encodeFunctionData<typeof vaultAbi, 'transfer'>
  >[0]
  expectTypeOf<Parameters_['args']>().toEqualTypeOf<
    readonly [AddressInput, bigint | number] | readonly unknown[] | undefined
  >()
  // the helper is the typed member of `args`
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, AllMutabilities, 'transfer'>
  >().toExtend<Parameters_['args']>()

  // an overloaded name: one tuple per overload
  expectTypeOf<
    Parameters<typeof encodeFunctionData<typeof vaultAbi, 'send'>>[0]['args']
  >().toEqualTypeOf<
    | readonly [AddressInput, bigint | number]
    | readonly [AddressInput]
    | readonly unknown[]
    | undefined
  >()

  // wide abi
  expectTypeOf<
    Parameters<typeof encodeFunctionData<Abi, string>>[0]['args']
  >().toEqualTypeOf<readonly unknown[] | undefined>()
})

test('encodeFunctionData: a value annotated with ContractFunctionArgs is accepted', () => {
  const transferArgs: ContractFunctionArgs<
    typeof vaultAbi,
    'nonpayable',
    'transfer'
  > = [base58Address, 1n]
  expectTypeOf(
    encodeFunctionData({
      abi: vaultAbi,
      functionName: 'transfer',
      args: transferArgs,
    }),
  ).toEqualTypeOf<Hex>()

  // every address form, `bigint` and `number` amounts
  encodeFunctionData({
    abi: vaultAbi,
    functionName: 'transfer',
    args: [hexAddress, 1],
  })
  encodeFunctionData({
    abi: vaultAbi,
    functionName: 'transfer',
    args: [evmAddress, 1n],
  })

  const batchArgs: ContractFunctionArgs<
    typeof vaultAbi,
    'nonpayable',
    'batch'
  > = [
    [base58Address, hexAddress],
    [1n, 2],
    { to: evmAddress, amount: 3 },
    [base58Address, false],
  ]
  encodeFunctionData({ abi: vaultAbi, functionName: 'batch', args: batchArgs })

  const sendArgs: ContractFunctionArgs<
    typeof vaultAbi,
    'nonpayable' | 'payable',
    'send'
  > = [hexAddress]
  encodeFunctionData({ abi: vaultAbi, functionName: 'send', args: sendArgs })

  // wide abis keep taking any array
  encodeFunctionData({ abi: wideAbi, functionName: 'f', args: ['x', 1n] })
  encodeFunctionData({ abi: unknownAbi, functionName: 'f', args: ['x', 1n] })
  const wideArgs: ContractFunctionArgs = [base58Address, 1n]
  encodeFunctionData({ abi: wideAbi, functionName: 'f', args: wideArgs })
})

test('prepareEncodeFunctionData: args show the TRON input mapping', () => {
  expectTypeOf<
    Parameters<
      typeof prepareEncodeFunctionData<typeof vaultAbi, 'transfer'>
    >[0]['args']
  >().toEqualTypeOf<
    readonly [AddressInput, bigint | number] | readonly unknown[] | undefined
  >()

  const args: ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'> =
    [hexAddress, 1]
  prepareEncodeFunctionData({ abi: vaultAbi, functionName: 'transfer', args })
})

test('decodeFunctionData: decoded args are the TRON output mapping', () => {
  const decoded = decodeFunctionData({ abi: vaultAbi, data: '0x' })

  type Transfer = Extract<typeof decoded, { functionName: 'transfer' }>
  expectTypeOf<Transfer['args']>().toEqualTypeOf<readonly [Address, bigint]>()

  type Batch = Extract<typeof decoded, { functionName: 'batch' }>
  expectTypeOf<Batch['args']>().toEqualTypeOf<
    readonly [
      readonly Address[],
      readonly bigint[],
      { to: Address; amount: bigint },
      [Address, boolean],
    ]
  >()

  // a function without inputs decodes to no args
  type Burn = Extract<typeof decoded, { functionName: 'burn' }>
  expectTypeOf<Burn['args']>().toEqualTypeOf<undefined>()

  // an overloaded name decodes to either overload
  type Send = Extract<typeof decoded, { functionName: 'send' }>
  expectTypeOf<Send['args']>().toEqualTypeOf<
    readonly [Address, bigint] | readonly [Address]
  >()

  // decoded args can be encoded again: the outputs are valid inputs
  expectTypeOf<Transfer['args']>().toExtend<
    ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'>
  >()
  expectTypeOf<Batch['args']>().toExtend<
    ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'batch'>
  >()
  if (decoded.functionName === 'transfer')
    encodeFunctionData({
      abi: vaultAbi,
      functionName: decoded.functionName,
      args: decoded.args,
    })

  // wide abi
  expectTypeOf(decodeFunctionData({ abi: wideAbi, data: '0x' })).toEqualTypeOf<{
    args: readonly unknown[] | undefined
    functionName: string
  }>()
  expectTypeOf(
    decodeFunctionData({ abi: unknownAbi, data: '0x' }),
  ).toEqualTypeOf<{
    args: readonly unknown[] | undefined
    functionName: string
  }>()
})

test('decodeFunctionResult: returns ContractFunctionReturnType', () => {
  const owner = decodeFunctionResult({
    abi: vaultAbi,
    functionName: 'owner',
    data: '0x',
  })
  expectTypeOf(owner).toEqualTypeOf<Address>()
  expectTypeOf(owner).toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'owner'>
  >()

  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'decimals',
      data: '0x',
    }),
  ).toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'decimals'>
  >()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'holders',
      data: '0x',
    }),
  ).toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'holders'>
  >()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'position',
      data: '0x',
    }),
  ).toEqualTypeOf<{ holder: Address; amount: bigint; tags: readonly Hex[] }>()
  expectTypeOf(
    decodeFunctionResult({ abi: vaultAbi, functionName: 'pair', data: '0x' }),
  ).toEqualTypeOf<ContractFunctionReturnType<typeof vaultAbi, 'view', 'pair'>>()
  expectTypeOf(
    decodeFunctionResult({ abi: vaultAbi, functionName: 'burn', data: '0x' }),
  ).toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'nonpayable', 'burn'>
  >()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'depositFor',
      data: '0x',
    }),
  ).toEqualTypeOf<bigint>()

  // wide abi
  expectTypeOf(
    decodeFunctionResult({ abi: wideAbi, functionName: 'f', data: '0x' }),
  ).toEqualTypeOf<unknown>()
  expectTypeOf(
    decodeFunctionResult({ abi: unknownAbi, functionName: 'f', data: '0x' }),
  ).toEqualTypeOf<unknown>()
})

test('decodeFunctionResult: any address form selects the overload', () => {
  expectTypeOf(
    decodeFunctionResult({ abi: vaultAbi, functionName: 'lookup', data: '0x' }),
  ).toEqualTypeOf<bigint>()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'lookup',
      args: [],
      data: '0x',
    }),
  ).toEqualTypeOf<bigint>()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'lookup',
      args: [base58Address],
      data: '0x',
    }),
  ).toEqualTypeOf<Address>()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'lookup',
      args: [hexAddress],
      data: '0x',
    }),
  ).toEqualTypeOf<Address>()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'lookup',
      args: [evmAddress],
      data: '0x',
    }),
  ).toEqualTypeOf<Address>()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'lookup',
      args: [hexAddress, 1],
      data: '0x',
    }),
  ).toEqualTypeOf<readonly [Address, boolean]>()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'send',
      args: [evmAddress, 1n],
      data: '0x',
    }),
  ).toEqualTypeOf<boolean>()
  expectTypeOf(
    decodeFunctionResult({
      abi: vaultAbi,
      functionName: 'send',
      args: [base58Address],
      data: '0x',
    }),
  ).toEqualTypeOf<
    ContractFunctionReturnType<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send',
      readonly [typeof base58Address]
    >
  >()
})

test('encodeErrorResult: args are ContractErrorArgs', () => {
  expectTypeOf<
    Parameters<
      typeof encodeErrorResult<typeof vaultAbi, 'InsufficientBalance'>
    >[0]['args']
  >().toEqualTypeOf<
    readonly [AddressInput, bigint | number] | readonly unknown[] | undefined
  >()

  const args: ContractErrorArgs<typeof vaultAbi, 'InsufficientBalance'> = [
    base58Address,
    1n,
  ]
  expectTypeOf(
    encodeErrorResult({
      abi: vaultAbi,
      errorName: 'InsufficientBalance',
      args,
    }),
  ).toEqualTypeOf<Hex>()
  encodeErrorResult({
    abi: vaultAbi,
    errorName: 'InsufficientBalance',
    args: [hexAddress, 1],
  })
  encodeErrorResult({
    abi: vaultAbi,
    errorName: 'InsufficientBalance',
    args: [evmAddress, 1n],
  })
  encodeErrorResult({ abi: vaultAbi, errorName: 'Locked' })

  // wide abi
  const wideArgs: ContractErrorArgs = ['x']
  encodeErrorResult({ abi: wideAbi, errorName: 'Anything', args: wideArgs })
})

test('decodeErrorResult: the error name is typed, the args are not', () => {
  const decoded = decodeErrorResult({ abi: vaultAbi, data: '0x00000000' })
  expectTypeOf(decoded.errorName).toEqualTypeOf<
    'InsufficientBalance' | 'Locked' | 'Error' | 'Panic'
  >()
  expectTypeOf(decoded.args).toEqualTypeOf<readonly unknown[] | undefined>()

  expectTypeOf(
    decodeErrorResult({ abi: wideAbi, data: '0x00000000' }).errorName,
  ).toEqualTypeOf<string>()
  expectTypeOf(
    decodeErrorResult({ data: '0x00000000' }).errorName,
  ).toEqualTypeOf<string>()
})

test('encodeDeployData: args are ContractConstructorArgs', () => {
  expectTypeOf<
    Parameters<
      typeof encodeDeployData<typeof nonpayableConstructorAbi>
    >[0]['args']
  >().toEqualTypeOf<
    readonly [AddressInput, bigint | number] | readonly unknown[] | undefined
  >()

  const args: ContractConstructorArgs<typeof nonpayableConstructorAbi> = [
    base58Address,
    100n,
  ]
  expectTypeOf(
    encodeDeployData({ abi: nonpayableConstructorAbi, bytecode: '0x60', args }),
  ).toEqualTypeOf<Hex>()
  encodeDeployData({
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [hexAddress, 100],
  })
  encodeDeployData({
    abi: payableConstructorAbi,
    bytecode: '0x60',
    args: [evmAddress],
  })
  encodeDeployData({ abi: noConstructorAbi, bytecode: '0x60' })

  // wide abi
  const wideArgs: ContractConstructorArgs = ['x', 1n]
  encodeDeployData({ abi: wideAbi, bytecode: '0x60', args: wideArgs })
  encodeDeployData({ abi: unknownAbi, bytecode: '0x60', args: wideArgs })
})

test('decodeDeployData: decoded args are the TRON output mapping', () => {
  const decoded = decodeDeployData({
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    data: '0x60',
  })
  expectTypeOf(decoded.args).toEqualTypeOf<
    readonly [Address, bigint] | undefined
  >()
  // decoded args can be encoded again
  expectTypeOf<NonNullable<typeof decoded.args>>().toExtend<
    ContractConstructorArgs<typeof nonpayableConstructorAbi>
  >()

  expectTypeOf(
    decodeDeployData({ abi: wideAbi, bytecode: '0x60', data: '0x60' }).args,
  ).toEqualTypeOf<readonly unknown[] | undefined>()
})

test('getAbiItem: args are AbiItemArgs, any address form selects the overload', () => {
  expectTypeOf<
    Parameters<
      typeof getAbiItem<
        typeof vaultAbi,
        'transfer',
        AbiItemArgs<typeof vaultAbi, 'transfer'>
      >
    >[0]['args']
  >().toEqualTypeOf<
    readonly [AddressInput, bigint | number] | readonly unknown[] | undefined
  >()

  const args: AbiItemArgs<typeof vaultAbi, 'transfer'> = [base58Address, 1n]
  const transfer = getAbiItem({ abi: vaultAbi, name: 'transfer', args })
  expectTypeOf<
    NonNullable<typeof transfer>['name']
  >().toEqualTypeOf<'transfer'>()

  const payable = getAbiItem({
    abi: vaultAbi,
    name: 'send',
    args: [base58Address],
  })
  expectTypeOf<
    NonNullable<typeof payable>['stateMutability']
  >().toEqualTypeOf<'payable'>()
  expectTypeOf(payable).toEqualTypeOf<
    | ExtractAbiItemForArgs<
        typeof vaultAbi,
        'send',
        readonly [typeof base58Address]
      >
    | undefined
  >()

  const payableHex = getAbiItem({
    abi: vaultAbi,
    name: 'send',
    args: [hexAddress],
  })
  expectTypeOf<
    NonNullable<typeof payableHex>['stateMutability']
  >().toEqualTypeOf<'payable'>()

  const payableEvm = getAbiItem({
    abi: vaultAbi,
    name: 'send',
    args: [evmAddress],
  })
  expectTypeOf<
    NonNullable<typeof payableEvm>['stateMutability']
  >().toEqualTypeOf<'payable'>()

  const nonpayable = getAbiItem({
    abi: vaultAbi,
    name: 'send',
    args: [hexAddress, 1],
  })
  expectTypeOf<
    NonNullable<typeof nonpayable>['stateMutability']
  >().toEqualTypeOf<'nonpayable'>()

  const lookup = getAbiItem({
    abi: vaultAbi,
    name: 'lookup',
    args: [evmAddress, 1n],
  })
  expectTypeOf<
    NonNullable<typeof lookup>['outputs']['length']
  >().toEqualTypeOf<2>()

  // events and errors
  const event = getAbiItem({ abi: vaultAbi, name: 'Transfer' })
  expectTypeOf<NonNullable<typeof event>['type']>().toEqualTypeOf<'event'>()
  const error = getAbiItem({
    abi: vaultAbi,
    name: 'InsufficientBalance',
    args: [hexAddress, 1],
  })
  expectTypeOf<NonNullable<typeof error>['type']>().toEqualTypeOf<'error'>()

  // wide abi
  expectTypeOf(
    getAbiItem({ abi: wideAbi, name: 'f', args: ['x'] }),
  ).toEqualTypeOf<Abi[number] | undefined>()
  expectTypeOf(
    getAbiItem({ abi: unknownAbi, name: 'f', args: ['x'] }),
  ).toEqualTypeOf<Abi[number] | undefined>()
})

test('decodeEventLog: args are ContractEventArgsFromTopics', () => {
  const decoded = decodeEventLog({
    abi: vaultAbi,
    eventName: 'Transfer',
    topics: ['0x'],
    data: '0x',
  })
  expectTypeOf(decoded.args).toEqualTypeOf<
    ContractEventArgsFromTopics<typeof vaultAbi, 'Transfer'>
  >()

  const note = decodeEventLog({
    abi: vaultAbi,
    eventName: 'Note',
    topics: ['0x'],
    data: '0x',
  })
  expectTypeOf(note.args).toEqualTypeOf<
    ContractEventArgsFromTopics<typeof vaultAbi, 'Note'>
  >()

  const loose = decodeEventLog({
    abi: vaultAbi,
    eventName: 'Transfer',
    topics: ['0x'],
    data: '0x',
    strict: false,
  })
  expectTypeOf(loose.args).toEqualTypeOf<
    ContractEventArgsFromTopics<typeof vaultAbi, 'Transfer', false>
  >()
})

test('the codecs resolve on a thirty-function abi', () => {
  encodeFunctionData({
    abi: largeAbi,
    functionName: 'permit',
    args: [base58Address, hexAddress, 1n, 2, 27, '0x', '0x'],
  })
  encodeFunctionData({
    abi: largeAbi,
    functionName: 'safeTransfer',
    args: [evmAddress, 1n, '0x'],
  })
  expectTypeOf(
    decodeFunctionResult({
      abi: largeAbi,
      functionName: 'getReserves',
      data: '0x',
    }),
  ).toEqualTypeOf<readonly [bigint, bigint, bigint]>()
  expectTypeOf(
    decodeFunctionResult({ abi: largeAbi, functionName: 'owner', data: '0x' }),
  ).toEqualTypeOf<Address>()

  const decoded = decodeFunctionData({ abi: largeAbi, data: '0x' })
  type Swap = Extract<typeof decoded, { functionName: 'swap' }>
  expectTypeOf<Swap['args']>().toEqualTypeOf<
    readonly [bigint, bigint, Address, Hex]
  >()

  const item = getAbiItem({
    abi: largeAbi,
    name: 'safeTransfer',
    args: [base58Address, 1n, '0x'],
  })
  expectTypeOf<
    NonNullable<typeof item>['stateMutability']
  >().toEqualTypeOf<'payable'>()

  encodeErrorResult({
    abi: largeAbi,
    errorName: 'Unauthorized',
    args: [hexAddress],
  })
  encodeDeployData({ abi: largeAbi, bytecode: '0x60', args: [evmAddress, 1] })
})

test('a tuple with unnamed components: readonly in, mutable out', () => {
  const params = [
    { type: 'tuple', components: [{ type: 'address' }, { type: 'bool' }] },
  ] as const
  expectTypeOf<
    Parameters<typeof encodeAbiParameters<typeof params>>[1]
  >().toEqualTypeOf<readonly [readonly [AddressInput, boolean]]>()

  // a `readonly` or a mutable tuple encodes
  const raw = [evmAddress, true] as const
  const mutableRaw: [AddressInput, boolean] = [hexAddress, false]
  encodeAbiParameters(params, [raw])
  encodeAbiParameters(params, [mutableRaw])
  encodeAbiParameters(params, [[base58Address, true]])
  // @ts-expect-error the arity is the tuple's
  encodeAbiParameters(params, [[base58Address]])

  const args: ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'batch'> = [
    [hexAddress],
    [1, 2n],
    { to: base58Address, amount: 1n },
    raw,
  ]
  encodeFunctionData({ abi: vaultAbi, functionName: 'batch', args })

  // the decoded tuple is mutable
  expectTypeOf(decodeAbiParameters(params, '0x')).toEqualTypeOf<
    readonly [[Address, boolean]]
  >()
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'pair'>
  >().toEqualTypeOf<[Address, bigint]>()
  const decoded = decodeFunctionData({ abi: vaultAbi, data: '0x' })
  if (decoded.functionName === 'batch')
    expectTypeOf(decoded.args[3]).toEqualTypeOf<[Address, boolean]>()
})

test('trcToken encodes and decodes like uint256', () => {
  const tokenAbi = [
    {
      type: 'function',
      name: 'transferToken',
      stateMutability: 'payable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'id', type: 'trcToken' },
      ],
      outputs: [{ name: '', type: 'trcToken' }],
    },
  ] as const

  const args: ContractFunctionArgs<
    typeof tokenAbi,
    'payable',
    'transferToken'
  > = [hexAddress, 1000001]
  encodeFunctionData({ abi: tokenAbi, functionName: 'transferToken', args })
  encodeFunctionData({
    abi: tokenAbi,
    functionName: 'transferToken',
    args: [base58Address, 1000001n],
  })
  expectTypeOf(
    decodeFunctionResult({
      abi: tokenAbi,
      functionName: 'transferToken',
      data: '0x',
    }),
  ).toEqualTypeOf<bigint>()
  expectTypeOf(
    decodeFunctionData({ abi: tokenAbi, data: '0x' }).args,
  ).toEqualTypeOf<readonly [Address, bigint]>()
})
