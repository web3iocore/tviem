import type { Abi, AbiFunction } from 'abitype'
import { expectTypeOf, test } from 'vitest'
import {
  type BuildDeployContractParameters,
  buildDeployContract,
  type DeployContractParameters,
  deployContract,
} from '../../../src/actions/wallet/deployContract.js'
import type { Client } from '../../../src/clients/createClient.js'
import type { WalletClient } from '../../../src/clients/createWalletClient.js'
import type { AddressInput } from '../../../src/types/address.js'
import type {
  AbiItem,
  ContractConstructorArgs,
} from '../../../src/types/contract.js'
import {
  base58Address,
  evmAddress,
  hexAddress,
  largeAbi,
  noConstructorAbi,
  nonpayableConstructorAbi,
  payableConstructorAbi,
  payableNoArgsConstructorAbi,
} from '../../fixtures/abi/contractTypes.js'

const client = {} as WalletClient
const bareClient = {} as Client

const withArgs = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'cap', type: 'uint256' },
    ],
  },
] as const

const noArgs = [
  { type: 'constructor', stateMutability: 'nonpayable', inputs: [] },
] as const

const noCtor = [
  {
    type: 'function',
    name: 'f',
    stateMutability: 'view',
    inputs: [],
    outputs: [],
  },
] as const

test('a constructor with inputs makes args required and typed', () => {
  // The generic must survive the client decorator — a non-generic decorator
  // declaration widens `abi` to `Abi` and erases all of this.
  client.deployContract({
    abi: withArgs,
    bytecode: '0x60',
    args: ['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC', 100n],
  })

  // @ts-expect-error — args are required when the constructor declares inputs.
  client.deployContract({ abi: withArgs, bytecode: '0x60' })

  client.deployContract({
    abi: withArgs,
    bytecode: '0x60',
    // @ts-expect-error — wrong arity.
    args: ['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'],
  })

  client.deployContract({
    abi: withArgs,
    bytecode: '0x60',
    // @ts-expect-error — wrong types.
    args: [123, 'junk'],
  })
})

test('an argless or absent constructor keeps args optional', () => {
  client.buildDeployContract({ abi: noArgs, bytecode: '0x60' })
  client.buildDeployContract({ abi: noCtor, bytecode: '0x60' })
})

test('the wide (non-const) instantiation keeps args optional', () => {
  // Callers holding a runtime `Abi` (no `as const`) must keep the wide call
  // shape: args optional, any array accepted.
  const runtimeAbi = [] as unknown as Abi
  client.deployContract({ abi: runtimeAbi, bytecode: '0x60' })
  client.deployContract({
    abi: runtimeAbi,
    bytecode: '0x60',
    args: ['anything', 1n],
  })
})

//////////////////////////////////////////////////////////////////////
// Helper types and call value options

test('args are ContractConstructorArgs', () => {
  expectTypeOf<
    DeployContractParameters<typeof nonpayableConstructorAbi>['args']
  >().toEqualTypeOf<ContractConstructorArgs<typeof nonpayableConstructorAbi>>()
  expectTypeOf<
    DeployContractParameters<typeof nonpayableConstructorAbi>['args']
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()

  const args: ContractConstructorArgs<typeof nonpayableConstructorAbi> = [
    base58Address,
    100n,
  ]
  deployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args,
  })
  // every address form, `bigint` and `number`
  deployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [hexAddress, 100],
  })
  buildDeployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [evmAddress, 100n],
  })
  client.deployContract({
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args,
  })
})

test('call value options on a payable constructor', () => {
  deployContract(bareClient, {
    abi: payableConstructorAbi,
    bytecode: '0x60',
    args: [base58Address],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  buildDeployContract(bareClient, {
    abi: payableNoArgsConstructorAbi,
    bytecode: '0x60',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  client.deployContract({
    abi: payableConstructorAbi,
    bytecode: '0x60',
    args: [hexAddress],
    callValue: 1n,
  })
  client.buildDeployContract({
    abi: payableNoArgsConstructorAbi,
    bytecode: '0x60',
    tokenId: 1000001n,
    callTokenValue: 2n,
  })

  // omitted, or explicitly `undefined`
  deployContract(bareClient, {
    abi: payableConstructorAbi,
    bytecode: '0x60',
    args: [evmAddress],
  })
  deployContract(bareClient, {
    abi: payableNoArgsConstructorAbi,
    bytecode: '0x60',
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })

  type Payable = DeployContractParameters<typeof payableConstructorAbi>
  expectTypeOf<Payable['callValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Payable['callTokenValue']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Payable['tokenId']>().toEqualTypeOf<bigint | undefined>()
})

test('call value options on a nonpayable constructor', () => {
  // omitted, or explicitly `undefined`
  deployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [base58Address, 1n],
  })
  deployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [base58Address, 1n],
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })

  deployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [base58Address, 1n],
    // @ts-expect-error the constructor is not payable
    callValue: 1n,
  })
  deployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [base58Address, 1n],
    // @ts-expect-error the constructor is not payable
    callTokenValue: 1n,
  })
  deployContract(bareClient, {
    abi: nonpayableConstructorAbi,
    bytecode: '0x60',
    args: [base58Address, 1n],
    // @ts-expect-error the constructor is not payable
    tokenId: 1000001n,
  })
  buildDeployContract(bareClient, {
    abi: noArgs,
    bytecode: '0x60',
    // @ts-expect-error the constructor is not payable
    callValue: 1n,
  })
  client.deployContract({
    abi: withArgs,
    bytecode: '0x60',
    args: [base58Address, 1n],
    // @ts-expect-error the constructor is not payable
    callValue: 1n,
  })
  client.buildDeployContract({
    abi: noArgs,
    bytecode: '0x60',
    // @ts-expect-error the constructor is not payable
    tokenId: 1000001n,
  })

  type Nonpayable = DeployContractParameters<typeof nonpayableConstructorAbi>
  expectTypeOf<Nonpayable['callValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Nonpayable['callTokenValue']>().toEqualTypeOf<undefined>()
  expectTypeOf<Nonpayable['tokenId']>().toEqualTypeOf<undefined>()
  expectTypeOf<
    BuildDeployContractParameters<typeof nonpayableConstructorAbi>['callValue']
  >().toEqualTypeOf<undefined>()
  // the other options are not affected
  expectTypeOf<Nonpayable['feeLimit']>().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<Nonpayable['originEnergyLimit']>().toEqualTypeOf<
    bigint | undefined
  >()
})

test('call value options without a constructor', () => {
  deployContract(bareClient, { abi: noConstructorAbi, bytecode: '0x60' })
  deployContract(bareClient, {
    abi: noConstructorAbi,
    bytecode: '0x60',
    callValue: undefined,
  })
  deployContract(bareClient, {
    abi: noConstructorAbi,
    bytecode: '0x60',
    // @ts-expect-error an abi without a constructor is not payable
    callValue: 1n,
  })
  buildDeployContract(bareClient, {
    abi: noConstructorAbi,
    bytecode: '0x60',
    // @ts-expect-error an abi without a constructor is not payable
    callTokenValue: 1n,
  })
  client.deployContract({
    abi: noCtor,
    bytecode: '0x60',
    // @ts-expect-error an abi without a constructor is not payable
    tokenId: 1000001n,
  })
  deployContract(bareClient, {
    abi: [],
    bytecode: '0x60',
    // @ts-expect-error an empty abi has no constructor
    callValue: 1n,
  })

  expectTypeOf<
    DeployContractParameters<typeof noConstructorAbi>['callValue']
  >().toEqualTypeOf<undefined>()
})

test('a wide abi keeps the call value options', () => {
  const runtimeAbi = [] as unknown as Abi
  const unknownAbi = [] as readonly unknown[]
  deployContract(bareClient, {
    abi: runtimeAbi,
    bytecode: '0x60',
    args: ['anything'],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  buildDeployContract(bareClient, {
    abi: unknownAbi,
    bytecode: '0x60',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  client.deployContract({
    abi: runtimeAbi,
    bytecode: '0x60',
    callValue: 1n,
  })
  client.buildDeployContract({
    abi: unknownAbi,
    bytecode: '0x60',
    tokenId: 1000001n,
  })

  // an abi literal without `as const`
  const looseAbi = [
    { type: 'constructor', stateMutability: 'nonpayable', inputs: [] },
  ]
  deployContract(bareClient, {
    abi: looseAbi,
    bytecode: '0x60',
    callValue: 1n,
  })

  // abi types that are not a tuple of items
  const fragments = [] as AbiFunction[]
  const readonlyFragments = [] as readonly AbiFunction[]
  const items = [] as AbiItem[]
  deployContract(bareClient, {
    abi: fragments,
    bytecode: '0x60',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  buildDeployContract(bareClient, {
    abi: readonlyFragments,
    bytecode: '0x60',
    callValue: 1n,
  })
  client.deployContract({
    abi: items,
    bytecode: '0x60',
    args: ['anything'],
    callValue: 1n,
  })
  expectTypeOf<
    DeployContractParameters<readonly AbiFunction[]>['callValue']
  >().toEqualTypeOf<bigint | undefined>()
  expectTypeOf<
    DeployContractParameters<AbiItem[]>['callValue']
  >().toEqualTypeOf<bigint | undefined>()
  // … an array of literal items follows the constructor it lists
  const constructors = [...nonpayableConstructorAbi]
  deployContract(bareClient, {
    abi: constructors,
    bytecode: '0x60',
    args: [base58Address, 1n],
    // @ts-expect-error the constructor is not payable
    callValue: 1n,
  })
  // … a tuple lists every item: a function is not a constructor
  deployContract(bareClient, {
    abi: [{} as AbiFunction],
    bytecode: '0x60',
    // @ts-expect-error the abi tuple has no constructor
    callValue: 1n,
  })

  // unparameterised
  expectTypeOf<DeployContractParameters['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<DeployContractParameters['callTokenValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<DeployContractParameters['tokenId']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<BuildDeployContractParameters['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<DeployContractParameters['args']>().toEqualTypeOf<
    readonly unknown[] | undefined
  >()
})

test('a thirty-function abi with a payable constructor', () => {
  deployContract(bareClient, {
    abi: largeAbi,
    bytecode: '0x60',
    args: [hexAddress, 1],
    callValue: 1n,
  })
  expectTypeOf(
    client.deployContract({
      abi: largeAbi,
      bytecode: '0x60',
      args: [base58Address, 1n],
      callTokenValue: 1n,
      tokenId: 1000001n,
    }),
  ).resolves.toHaveProperty('contractAddress')
})
