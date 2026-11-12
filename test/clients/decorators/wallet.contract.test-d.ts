// Type-surface tests for the contract methods of the Wallet Client: the
// inference of `writeContract` / `buildWriteContract` survives through the
// decorator, with the same helper types and call value options.
import type { Abi, AbiFunction } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import {
  buildWriteContract,
  writeContract,
} from '../../../src/actions/wallet/writeContract.js'
import type { Client } from '../../../src/clients/createClient.js'
import type { WalletClient } from '../../../src/clients/createWalletClient.js'
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

const client = {} as WalletClient
const bareClient = {} as Client
const address = base58Address
const wideAbi = [] as unknown as Abi
const unknownAbi = [] as readonly unknown[]

type Write = 'nonpayable' | 'payable'

test('client.writeContract: same types as the action', () => {
  const args: ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'> =
    [base58Address, 1n]
  const viaClient = client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args,
  })
  const viaAction = writeContract(bareClient, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args,
  })
  expectTypeOf(viaClient).toEqualTypeOf<typeof viaAction>()

  const builtViaClient = client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args,
  })
  const builtViaAction = buildWriteContract(bareClient, {
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args,
  })
  expectTypeOf(builtViaClient).toEqualTypeOf<typeof builtViaAction>()

  // every address form, `bigint` and `number`
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [hexAddress, 1],
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [evmAddress, 1n],
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    // @ts-expect-error a string without an address prefix is not an address
    args: ['abc', 1n],
  })
})

test('client.writeContract: call value options on a payable function', () => {
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'depositFor',
    args: [hexAddress],
    callValue: 1n,
  })
  client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'depositFor',
    args: [evmAddress],
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  // omitted
  client.writeContract({ abi: vaultAbi, address, functionName: 'deposit' })
  client.buildWriteContract({ abi: vaultAbi, address, functionName: 'deposit' })
})

test('client.writeContract: call value options on a nonpayable function', () => {
  // omitted, or explicitly `undefined`
  client.writeContract({ abi: vaultAbi, address, functionName: 'burn' })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'burn',
    callValue: undefined,
    callTokenValue: undefined,
    tokenId: undefined,
  })

  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callValue: 1n,
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    callTokenValue: 1n,
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'transfer',
    args: [base58Address, 1n],
    // @ts-expect-error `transfer` is not payable
    tokenId: 1000001n,
  })
  client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'burn',
    // @ts-expect-error `burn` is not payable
    callValue: 1n,
  })
})

test('client.writeContract: overloads', () => {
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address],
    callValue: 1n,
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress],
    callValue: 1n,
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [evmAddress],
    callValue: 1n,
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [base58Address, 1n],
    // @ts-expect-error `send(address,uint256)` is not payable
    callValue: 1n,
  })
  client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: [hexAddress, 1],
    // @ts-expect-error `send(address,uint256)` is not payable
    tokenId: 1000001n,
  })
  // a call without args selects `stake()`, which is not payable
  client.writeContract({ abi: vaultAbi, address, functionName: 'stake' })
  // @ts-expect-error `stake()` is not payable
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    callValue: 1n,
  })
  // @ts-expect-error `stake()` is not payable
  client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    tokenId: 1000001n,
  })
  client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [],
    // @ts-expect-error `stake()` is not payable
    callValue: 1n,
  })
  client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [evmAddress],
    callValue: 1n,
  })
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: [hexAddress],
    callValue: 1n,
  })

  // args that select no single overload: any payable overload
  const sendArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'send'
  >
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'send',
    args: sendArgs,
    callValue: 1n,
  })
  const moveArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'move'
  >
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'move',
    args: moveArgs,
    // @ts-expect-error no overload of `move` is payable
    callValue: 1n,
  })
  // … also on a name with an overload without inputs
  const stakeArgs = [base58Address] as ContractFunctionArgs<
    typeof vaultAbi,
    Write,
    'stake'
  >
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: stakeArgs,
    callValue: 1n,
  })
  client.buildWriteContract({
    abi: vaultAbi,
    address,
    functionName: 'stake',
    args: stakeArgs,
    callTokenValue: 1n,
    tokenId: 1000001n,
  })
})

test('client.writeContract: a function the abi type does not list keeps the options', () => {
  const items = [] as AbiItem[]
  client.writeContract({
    abi: items,
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  client.buildWriteContract({
    abi: [{} as AbiFunction],
    address,
    functionName: 'deposit',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  client.writeContract({
    abi: noConstructorAbi,
    address,
    functionName: 'deposit',
    callValue: 1n,
  })
  const name = 'deposit' as string
  client.buildWriteContract({
    abi: noConstructorAbi,
    address,
    functionName: name,
    callValue: 1n,
  })
})

test('client.writeContract: a wide abi or a non-literal name keeps the options', () => {
  client.writeContract({
    abi: wideAbi,
    address,
    functionName: 'anything',
    args: ['x', 1n],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  client.buildWriteContract({
    abi: unknownAbi,
    address,
    functionName: 'anything',
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
  const functionName = 'burn' as ContractFunctionName<typeof vaultAbi, Write>
  client.writeContract({
    abi: vaultAbi,
    address,
    functionName,
    args: [],
    callValue: 1n,
    callTokenValue: 2n,
    tokenId: 1000001n,
  })
})

test('client.writeContract resolves on a thirty-function abi', () => {
  client.writeContract({
    abi: largeAbi,
    address,
    functionName: 'transferFrom',
    args: [base58Address, hexAddress, 1],
  })
  client.writeContract({
    abi: largeAbi,
    address,
    functionName: 'depositFor',
    args: [evmAddress],
    callValue: 1n,
  })
  client.buildWriteContract({
    abi: largeAbi,
    address,
    functionName: 'safeTransfer',
    args: [evmAddress, 1n, '0x'],
    callValue: 1n,
  })
  client.writeContract({
    abi: largeAbi,
    address,
    functionName: 'safeTransfer',
    args: [evmAddress, 1n],
    // @ts-expect-error `safeTransfer(address,uint256)` is not payable
    callValue: 1n,
  })
})
