// Type-surface tests for the contract methods of the Public Client: the
// inference of `readContract`, `triggerConstantContract` and `estimateEnergy`
// survives through the decorator, with the same helper types.
import type { Abi } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import { estimateEnergy } from '../../../src/actions/public/estimateEnergy.js'
import { readContract } from '../../../src/actions/public/readContract.js'
import type { Client } from '../../../src/clients/createClient.js'
import type { PublicClient } from '../../../src/clients/createPublicClient.js'
import type { Address } from '../../../src/types/address.js'
import type {
  AbiItem,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
} from '../../../src/types/contract.js'
import {
  base58Address,
  evmAddress,
  hexAddress,
  largeAbi,
  noConstructorAbi,
  vaultAbi,
} from '../../fixtures/abi/contractTypes.js'

const client = {} as PublicClient
const bareClient = {} as Client
const address = base58Address
const wideAbi = [] as unknown as Abi
const unknownAbi = [] as readonly unknown[]

type Write = 'nonpayable' | 'payable'

test('client.readContract: same types as the action', () => {
  const args: ContractFunctionArgs<typeof vaultAbi, 'view', 'balanceOf'> = [
    hexAddress,
  ]
  const viaClient = client.readContract({
    abi: vaultAbi,
    address,
    functionName: 'balanceOf',
    args,
  })
  const viaAction = readContract(bareClient, {
    abi: vaultAbi,
    address,
    functionName: 'balanceOf',
    args,
  })
  expectTypeOf(viaClient).toEqualTypeOf<typeof viaAction>()
  expectTypeOf(viaClient).resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'balanceOf'>
  >()

  expectTypeOf(
    client.readContract({ abi: vaultAbi, address, functionName: 'owner' }),
  ).resolves.toEqualTypeOf<Address>()
  expectTypeOf(
    client.readContract({ abi: vaultAbi, address, functionName: 'holders' }),
  ).resolves.toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'holders'>
  >()

  // any address form selects the overload
  expectTypeOf(
    client.readContract({ abi: vaultAbi, address, functionName: 'lookup' }),
  ).resolves.toEqualTypeOf<bigint>()
  expectTypeOf(
    client.readContract({
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [base58Address],
    }),
  ).resolves.toEqualTypeOf<Address>()
  expectTypeOf(
    client.readContract({
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [hexAddress],
    }),
  ).resolves.toEqualTypeOf<Address>()
  expectTypeOf(
    client.readContract({
      abi: vaultAbi,
      address,
      functionName: 'lookup',
      args: [evmAddress, 1n],
    }),
  ).resolves.toEqualTypeOf<readonly [Address, boolean]>()

  // wide abi
  expectTypeOf(
    client.readContract({ abi: wideAbi, address, functionName: 'f' }),
  ).resolves.toEqualTypeOf<unknown>()
})

test('client.triggerConstantContract: result is ContractFunctionReturnType', async () => {
  const { result } = await client.triggerConstantContract({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress],
    callValue: 1n,
  })
  expectTypeOf(result).toEqualTypeOf<Address>()

  const transferred = await client.triggerConstantContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [evmAddress, 1],
  })
  expectTypeOf(transferred.result).toEqualTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'nonpayable', 'transfer'>
  >()
})

test('client.estimateEnergy: same types as the action', () => {
  const args: ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'> =
    [base58Address, 1n]
  const viaClient = client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args,
  })
  const viaAction = estimateEnergy(bareClient, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args,
  })
  expectTypeOf(viaClient).toEqualTypeOf<typeof viaAction>()
  expectTypeOf(viaClient).resolves.toEqualTypeOf<bigint>()

  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [hexAddress, 1],
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [evmAddress, 1n],
  })
})

test('client.estimateEnergy: call value options follow the function mutability', () => {
  // payable
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'depositFor',
    args: [hexAddress],
    callValue: 1n,
  })
  client.estimateEnergy({ abi: vaultAbi, address, functionName: 'deposit' })

  // nonpayable
  client.estimateEnergy({ abi: vaultAbi, address, functionName: 'burn' })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'burn',
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callValue: 1n,
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callTokenValue: 1n,
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'burn',
    // @ts-expect-error `burn` is not payable
    tokenId: 1000001n,
  })
})

test('client.estimateEnergy: overloads, wide abi, non-literal name', () => {
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address],
    callValue: 1n,
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress, 1n],
    // @ts-expect-error `send(address,uint256)` is not payable
    callValue: 1n,
  })
  // args that select no single overload: any payable overload
  const sendArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'send'
  >
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: sendArgs,
    callValue: 1n,
  })

  // a call without args selects `stake()`, which is not payable
  client.estimateEnergy({ abi: vaultAbi, address, functionName: 'stake' })
  // @ts-expect-error `stake()` is not payable
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    callValue: 1n,
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [],
    // @ts-expect-error `stake()` is not payable
    tokenId: 1000001n,
  })
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [evmAddress],
    callValue: 1n,
  })
  // … and args typed as the union of both overloads select either
  const stakeArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'stake'
  >
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: stakeArgs,
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })

  // a function the abi type does not list
  client.estimateEnergy({
    abi: [] as AbiItem[],
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  client.estimateEnergy({
    abi: noConstructorAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  const name = 'deposit' as string
  client.estimateEnergy({
    abi: noConstructorAbi,
    address,
    functionName: name,
    callValue: 1n,
  })

  client.estimateEnergy({
    abi: wideAbi,
    address,
    functionName: 'anything',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  client.estimateEnergy({
    abi: unknownAbi,
    address,
    functionName: 'anything',
    callValue: 1n,
  })
  const functionName = 'burn' as ContractFunctionName<typeof vaultAbi, Write>
  client.estimateEnergy({
    abi: vaultAbi,
    address,
    functionName,
    args: [],
    callValue: 1n,
  })
})

test('the client methods resolve on a thirty-function abi', () => {
  expectTypeOf(
    client.readContract({
      abi: largeAbi,
      address,
      functionName: 'getReserves',
    }),
  ).resolves.toEqualTypeOf<readonly [bigint, bigint, bigint]>()
  client.estimateEnergy({
    abi: largeAbi,
    address,
    functionName: 'multicall',
    args: [['0x']],
    callValue: 1n,
  })
  client.estimateEnergy({
    abi: largeAbi,
    address,
    functionName: 'approve',
    args: [hexAddress, 1],
    // @ts-expect-error `approve` is not payable
    callValue: 1n,
  })
})
