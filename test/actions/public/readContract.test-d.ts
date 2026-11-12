// Type-surface tests tying `readContract` / `triggerConstantContract` to the
// contract helper types: `ContractFunctionArgs` is the type of `args`,
// `ContractFunctionReturnType` the resolved value.
import type { Abi } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import {
  type ReadContractParameters,
  type ReadContractReturnType,
  readContract,
} from '../../../src/actions/public/readContract.js'
import { triggerConstantContract } from '../../../src/actions/public/triggerConstantContract.js'
import type { Client } from '../../../src/clients/createClient.js'
import type { Address, AddressInput } from '../../../src/types/address.js'
import type {
  ContractFunctionArgs,
  ContractFunctionReturnType,
} from '../../../src/types/contract.js'
import type { Hex } from '../../../src/types/misc.js'
import {
  base58Address,
  evmAddress,
  hexAddress,
  largeAbi,
  vaultAbi,
} from '../../fixtures/abi/contractTypes.js'

const client = {} as Client
const address = base58Address
const wideAbi = [] as unknown as Abi
const unknownAbi = [] as readonly unknown[]

test('readContract: args are ContractFunctionArgs', () => {
  expectTypeOf<
    ReadContractParameters<typeof vaultAbi, 'balanceOf'>['args']
  >().toEqualTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'view', 'balanceOf'>
  >()
  expectTypeOf<
    ReadContractParameters<typeof vaultAbi, 'balanceOf'>['args']
  >().toEqualTypeOf<readonly [AddressInput]>()
  expectTypeOf<
    ReadContractParameters<typeof vaultAbi, 'name'>['args']
  >().toEqualTypeOf<readonly [] | undefined>()

  const args: ContractFunctionArgs<typeof vaultAbi, 'view', 'balanceOf'> = [
    base58Address,
  ]
  expectTypeOf(
    readContract(client, {
      abi: vaultAbi,
      address,
      functionName: 'balanceOf',
      args,
    }),
  ).resolves.toEqualTypeOf<bigint>()

  // every address form
  readContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'balanceOf',
    args: [hexAddress],
  })
  readContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'balanceOf',
    args: [evmAddress],
  })
  readContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'balanceOf',
    // @ts-expect-error a string without an address prefix is not an address
    args: ['abc'],
  })
})

test('readContract: resolves to ContractFunctionReturnType', () => {
  expectTypeOf<
    ReadContractReturnType<typeof vaultAbi, 'owner'>
  >().toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'owner'>
  >()

  const owner = readContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'owner',
  })
  expectTypeOf(owner).resolves.toEqualTypeOf<Address>()
  expectTypeOf(owner).resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'owner'>
  >()

  expectTypeOf(
    readContract(client, { abi: vaultAbi, address, functionName: 'decimals' }),
  ).resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'decimals'>
  >()
  expectTypeOf(
    readContract(client, { abi: vaultAbi, address, functionName: 'decimals' }),
  ).resolves.toEqualTypeOf<bigint>()
  expectTypeOf(
    readContract(client, { abi: vaultAbi, address, functionName: 'holders' }),
  ).resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'holders'>
  >()
  expectTypeOf(
    readContract(client, {
      abi: vaultAbi,
      address,
      functionName: 'position',
      args: [hexAddress],
    }),
  ).resolves.toEqualTypeOf<{
    holder: Address
    amount: bigint
    tags: readonly Hex[]
  }>()
  expectTypeOf(
    readContract(client, { abi: vaultAbi, address, functionName: 'pair' }),
  ).resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'pair'>
  >()
})

test('readContract: any address form selects the overload', () => {
  expectTypeOf(
    readContract(client, { abi: vaultAbi, address, functionName: 'lookup' }),
  ).resolves.toEqualTypeOf<bigint>()
  expectTypeOf(
    readContract(client, {
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [base58Address],
    }),
  ).resolves.toEqualTypeOf<Address>()
  expectTypeOf(
    readContract(client, {
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [hexAddress],
    }),
  ).resolves.toEqualTypeOf<Address>()
  expectTypeOf(
    readContract(client, {
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [evmAddress],
    }),
  ).resolves.toEqualTypeOf<Address>()
  expectTypeOf(
    readContract(client, {
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [evmAddress, 1],
    }),
  ).resolves.toEqualTypeOf<
    ContractFunctionReturnType<
      typeof vaultAbi,
      'view',
      'lookup',
      readonly [typeof evmAddress, 1]
    >
  >()
  expectTypeOf(
    readContract(client, {
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [hexAddress, 1n],
    }),
  ).resolves.toEqualTypeOf<readonly [Address, boolean]>()
})

test('readContract: wide abis keep the wide call shape', () => {
  const wideArgs: ContractFunctionArgs = ['x', 1n]
  expectTypeOf(
    readContract(client, {
      abi: wideAbi,
      address,
      functionName: 'f',
      args: wideArgs,
    }),
  ).resolves.toEqualTypeOf<unknown>()
  expectTypeOf(
    readContract(client, { abi: unknownAbi, address, functionName: 'f' }),
  ).resolves.toEqualTypeOf<unknown>()
  expectTypeOf<ReadContractReturnType>().toEqualTypeOf<unknown>()
  expectTypeOf<ReadContractParameters['args']>().toEqualTypeOf<
    readonly unknown[] | undefined
  >()
})

test('triggerConstantContract: result is ContractFunctionReturnType', async () => {
  const args: ContractFunctionArgs<typeof vaultAbi, 'payable', 'depositFor'> = [
    hexAddress,
  ]
  const { result } = await triggerConstantContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'depositFor',
    args,
    callValue: 1n,
  })
  expectTypeOf(result).toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'payable', 'depositFor'>
  >()
  expectTypeOf(result).toEqualTypeOf<bigint>()

  const sent = await triggerConstantContract(client, {
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address],
  })
  expectTypeOf(sent.result).toEqualTypeOf<Address>()
})

test('readContract resolves on a thirty-function abi', () => {
  expectTypeOf(
    readContract(client, {
      abi: largeAbi,
      address,
      functionName: 'allowance',
      args: [base58Address, hexAddress],
    }),
  ).resolves.toEqualTypeOf<bigint>()
  expectTypeOf(
    readContract(client, {
      abi: largeAbi,
      address,
      functionName: 'holdersOf',
      args: [0, 10n],
    }),
  ).resolves.toEqualTypeOf<readonly [readonly Address[], bigint]>()
  expectTypeOf(
    readContract(client, {
      abi: largeAbi,
      address,
      functionName: 'quote',
      args: [1n, [base58Address, evmAddress]],
    }),
  ).resolves.toEqualTypeOf<readonly bigint[]>()
  expectTypeOf(
    readContract(client, { abi: largeAbi, address, functionName: 'owner' }),
  ).resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof largeAbi, 'view', 'owner'>
  >()
})
