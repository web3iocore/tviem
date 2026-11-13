import { describe, expect, test } from 'vitest'

import { AbiErrorSignatureNotFoundError } from '../../src/errors/abi.js'
import { BaseError } from '../../src/errors/base.js'
import {
  AccountNotFoundError,
  AccountTypeNotSupportedError,
  BlockNotFoundError,
  ContractFunctionRevertedError,
  TransactionExpiredError,
  TransactionMismatchError,
  TransactionRevertedError,
  TronRpcError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from '../../src/errors/rpc.js'
import type { TransactionInfo } from '../../src/types/transaction.js'
import { encodeErrorResult } from '../../src/utils/abi/encodeErrorResult.js'

test('AccountNotFoundError is a BaseError with the expected name / message', () => {
  const err = new AccountNotFoundError()
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('AccountNotFoundError')
  expect(err.shortMessage).toContain(
    'Could not find an Account to execute with this Action.',
  )
  expect(err.message).toContain('`account` argument')
})

test('AccountTypeNotSupportedError names the account type', () => {
  const err = new AccountTypeNotSupportedError({
    type: 'json-rpc',
    docsPath: '/docs/accounts',
    metaMessages: ['- hint'],
  })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('AccountTypeNotSupportedError')
  expect(err.shortMessage).toBe('Account type "json-rpc" is not supported.')
  expect(err.metaMessages).toEqual(['- hint'])
  expect(err.docsPath).toBe('/docs/accounts')
})

test('BlockNotFoundError names the block number when provided', () => {
  const withNumber = new BlockNotFoundError({ blockNumber: 123n })
  expect(withNumber).toBeInstanceOf(BaseError)
  expect(withNumber.name).toBe('BlockNotFoundError')
  expect(withNumber.shortMessage).toBe('Block "123" could not be found.')

  const withoutNumber = new BlockNotFoundError()
  expect(withoutNumber.shortMessage).toBe('Block could not be found.')
})

test('TronRpcError carries cause / details / metaMessages and falls back on empty message', () => {
  const cause = new Error('underlying')
  const err = new TronRpcError('RPC blew up', {
    cause,
    details: 'extra detail',
    metaMessages: ['meta one', 'meta two'],
  })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('TronRpcError')
  expect(err.shortMessage).toBe('RPC blew up')
  expect(err.cause).toBe(cause)
  // details is derived from the cause when a cause is present.
  expect(err.details).toBe('underlying')
  expect(err.metaMessages).toEqual(['meta one', 'meta two'])
  expect(err.message).toContain('meta one')
  expect(err.message).toContain('meta two')

  const fallback = new TronRpcError('')
  expect(fallback.shortMessage).toBe('An RPC error occurred.')
})

test('TronRpcError surfaces standalone details when there is no cause', () => {
  const err = new TronRpcError('RPC failed', { details: 'the raw detail' })
  expect(err.details).toBe('the raw detail')
  expect(err.message).toContain('Details: the raw detail')
})

const insufficientBalanceAbi = [
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'balance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
] as const
const sender = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'

test('ContractFunctionRevertedError decodes an Error(string) payload into reason and data', () => {
  const data = encodeErrorResult({
    errorName: 'Error',
    args: ['insufficient balance'],
  })
  const err = new ContractFunctionRevertedError({
    abi: [],
    data,
    functionName: 'transfer',
  })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('ContractFunctionRevertedError')
  expect(err.reason).toBe('insufficient balance')
  expect(err.data?.errorName).toBe('Error')
  expect(err.data?.args).toEqual(['insufficient balance'])
  expect(err.raw).toBe(data)
  expect(err.signature).toBeUndefined()
  expect(err.shortMessage).toBe(
    'The contract function "transfer" reverted with the following reason:\ninsufficient balance',
  )
})

test('ContractFunctionRevertedError describes a Panic(uint256) code in reason', () => {
  const data = encodeErrorResult({ errorName: 'Panic', args: [0x11n] })
  const err = new ContractFunctionRevertedError({
    abi: [],
    data,
    functionName: 'transfer',
  })
  expect(err.reason).toBe(
    'Arithmetic operation resulted in underflow or overflow.',
  )
  expect(err.data?.errorName).toBe('Panic')
  expect(err.data?.args).toEqual([0x11n])
  expect(err.raw).toBe(data)
  expect('panicCode' in err).toBe(false)
  expect('code' in err).toBe(false)
  expect(err.shortMessage).toBe(
    'The contract function "transfer" reverted with the following reason:\nArithmetic operation resulted in underflow or overflow.',
  )
})

test('ContractFunctionRevertedError leaves reason empty for a panic code without a description', () => {
  const err = new ContractFunctionRevertedError({
    abi: [],
    data: encodeErrorResult({ errorName: 'Panic', args: [0x99n] }),
    functionName: 'transfer',
  })
  expect(err.reason).toBeUndefined()
  expect(err.data?.args).toEqual([0x99n])
  expect(err.shortMessage).toBe('The contract function "transfer" reverted.')
})

test('ContractFunctionRevertedError decodes a custom error found on the ABI', () => {
  const data = encodeErrorResult({
    abi: insufficientBalanceAbi,
    errorName: 'ERC20InsufficientBalance',
    args: [sender, 30n, 100n],
  })
  const err = new ContractFunctionRevertedError({
    abi: insufficientBalanceAbi,
    data,
    functionName: 'transfer',
  })
  expect(err.data?.errorName).toBe('ERC20InsufficientBalance')
  expect(err.data?.args).toEqual([sender, 30n, 100n])
  expect(err.data?.abiItem).toEqual(insufficientBalanceAbi[0])
  expect(err.raw).toBe(data)
  expect(err.reason).toBeUndefined()
  expect(err.signature).toBeUndefined()
  expect(err.shortMessage).toBe('The contract function "transfer" reverted.')
  expect(err.metaMessages).toEqual([
    'Error: ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
    `                               (${sender}, 30, 100)`,
  ])
})

test('ContractFunctionRevertedError reports the selector of an error missing from the ABI', () => {
  const data = `0xdeadbeef${'00'.repeat(32)}` as const
  const err = new ContractFunctionRevertedError({
    abi: insufficientBalanceAbi,
    data,
    functionName: 'transfer',
  })
  expect(err.signature).toBe('0xdeadbeef')
  expect(err.raw).toBe(data)
  expect(err.data).toBeUndefined()
  expect(err.reason).toBeUndefined()
  expect(err.cause).toBeInstanceOf(AbiErrorSignatureNotFoundError)
  expect(err.shortMessage).toBe(
    'The contract function "transfer" reverted with the following signature:\n0xdeadbeef',
  )
  expect(err.metaMessages?.[0]).toBe(
    'Unable to decode signature "0xdeadbeef" as it was not found on the provided ABI.',
  )
})

test('ContractFunctionRevertedError keeps the payload in raw when it does not decode', () => {
  const data = encodeErrorResult({ errorName: 'Error', args: ['x'] }).slice(
    0,
    20,
  ) as `0x${string}`
  const err = new ContractFunctionRevertedError({
    abi: [],
    data,
    functionName: 'transfer',
    message: 'REVERT opcode executed',
  })
  expect(err.raw).toBe(data)
  expect(err.data).toBeUndefined()
  expect(err.reason).toBeUndefined()
  expect(err.signature).toBeUndefined()
  expect(err.cause).toBeInstanceOf(Error)
  expect(err.shortMessage).toBe('The contract function "transfer" reverted.')
})

test.each([
  ['no payload', undefined],
  ['an empty payload', '0x'],
] as const)('ContractFunctionRevertedError uses message as the reason with %s', (_, data) => {
  const err = new ContractFunctionRevertedError({
    abi: [],
    data,
    functionName: 'transfer',
    message: 'REVERT opcode executed',
  })
  expect(err.reason).toBe('REVERT opcode executed')
  expect(err.data).toBeUndefined()
  expect(err.raw).toBe(data)
  expect(err.shortMessage).toBe(
    'The contract function "transfer" reverted with the following reason:\nREVERT opcode executed',
  )
})

test('WaitForTransactionReceiptTimeoutError names the hash when provided', () => {
  const err = new WaitForTransactionReceiptTimeoutError({ hash: '0xabc' })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('WaitForTransactionReceiptTimeoutError')
  expect(err.shortMessage).toBe(
    'Timed out while waiting for transaction "0xabc".',
  )
  expect(new WaitForTransactionReceiptTimeoutError().shortMessage).toBe(
    'Timed out while waiting for the transaction.',
  )

  // It names no cause: the poller cannot tell "never appeared" from "short of
  // the requested depth", so it does not guess at one.
  expect(err.metaMessages).toBeUndefined()
})

test('TransactionExpiredError names the hash when provided', () => {
  const err = new TransactionExpiredError({ hash: '0xabc' })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('TransactionExpiredError')
  expect(err.shortMessage).toBe(
    'Transaction "0xabc" expired before it could be included in a block.',
  )
  expect(new TransactionExpiredError().shortMessage).toBe(
    'Transaction expired before it could be included in a block.',
  )
})

test('TransactionMismatchError retains the mismatch fields', () => {
  const err = new TransactionMismatchError({
    localTxId: 'aaaa1111',
    nodeTxId: 'bbbb2222',
    path: 'getSignWeight',
  })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('TransactionMismatchError')
  expect(err.shortMessage).toContain('does not match the locally built one')
  expect(err.message).toContain(
    'No signature was produced over the node-supplied transaction.',
  )
  // The identifying fields are retained (via metaMessages) so a caller can see
  // exactly what mismatched.
  expect(err.metaMessages).toEqual([
    'Local txID: aaaa1111',
    'Node txID:  bbbb2222',
    'Path: getSignWeight',
  ])
  expect(err.message).toContain('Local txID: aaaa1111')
  expect(err.message).toContain('Node txID:  bbbb2222')
  expect(err.message).toContain('Path: getSignWeight')
})

test('TransactionMismatchError omits absent fields from its metaMessages', () => {
  const err = new TransactionMismatchError({ localTxId: 'aaaa1111' })
  expect(err.metaMessages).toEqual(['Local txID: aaaa1111'])
  expect(new TransactionMismatchError().metaMessages).toEqual([])
})

test('UserRejectedRequestError is a BaseError with code 4001 (static and instance)', () => {
  const err = new UserRejectedRequestError()
  expect(err).toBeInstanceOf(BaseError)
  expect(err).toBeInstanceOf(Error)
  expect(err.name).toBe('UserRejectedRequestError')
  expect(err.shortMessage).toBe('User rejected the request.')
  expect(err.message).toContain('User rejected the request.')
  expect(UserRejectedRequestError.code).toBe(4001)
  expect(err.code).toBe(4001)
  expect(err.code).toBe(UserRejectedRequestError.code)
  // No cause: nothing to walk to and no details line.
  expect(err.cause).toBeUndefined()
  expect(err.walk()).toBe(err)
  expect(err.message).not.toContain('Details:')
})

test('UserRejectedRequestError carries the wallet error as cause (details / walk)', () => {
  const walletErr = Object.assign(new Error('User rejected the signature'), {
    code: 4001,
  })
  const err = new UserRejectedRequestError({ cause: walletErr })
  expect(err.cause).toBe(walletErr)
  // details is derived from the cause's message.
  expect(err.details).toBe('User rejected the signature')
  expect(err.message).toContain('Details: User rejected the signature')
  // walk() reaches the innermost wallet error; a predicate can find either.
  expect(err.walk()).toBe(walletErr)
  expect(err.walk((e) => e instanceof UserRejectedRequestError)).toBe(err)
  expect(err.walk((e) => e === walletErr)).toBe(walletErr)

  // A BaseError cause contributes its own details.
  const inner = new TronRpcError('inner', { details: 'inner detail' })
  const wrapped = new UserRejectedRequestError({ cause: inner })
  expect(wrapped.details).toBe('inner detail')
  expect(wrapped.walk()).toBe(inner)

  // Wrapping it in another error still lets a caller find the rejection.
  const outer = new TronRpcError('outer', { cause: err })
  expect(outer.walk((e) => e instanceof UserRejectedRequestError)).toBe(err)
})

describe('TransactionRevertedError', () => {
  const base = {
    id: 'ab',
    blockNumber: 1n,
    blockTimeStamp: 0n,
    status: 'reverted',
    fee: 0n,
    energyUsage: 0n,
    energyUsageTotal: 0n,
    energyFee: 0n,
    netUsage: 0n,
    netFee: 0n,
    originEnergyUsage: 0n,
    energyPenaltyTotal: 0n,
    packingFee: 0n,
    contractResult: [],
    logs: [],
    internalTransactions: [],
  } satisfies TransactionInfo

  test('carries the receipt, its result and its reason', () => {
    const receipt: TransactionInfo = {
      ...base,
      result: 'OUT_OF_ENERGY',
      revertReason: 'Not enough energy',
    }
    const err = new TransactionRevertedError({ hash: 'ab', receipt })
    expect(err).toBeInstanceOf(BaseError)
    expect(err.name).toBe('TransactionRevertedError')
    expect(err.shortMessage).toBe('Transaction "ab" reverted.')
    expect(err.receipt).toBe(receipt)
    expect(err.result).toBe('OUT_OF_ENERGY')
    expect(err.reason).toBe('Not enough energy')
    expect(err.metaMessages).toEqual([
      'Result: OUT_OF_ENERGY',
      'Reason: Not enough energy',
    ])
  })

  test('omits absent result and reason', () => {
    const err = new TransactionRevertedError({ receipt: base })
    expect(err.shortMessage).toBe('Transaction reverted.')
    expect(err.result).toBeUndefined()
    expect(err.reason).toBeUndefined()
    expect(err.metaMessages).toEqual([])
  })
})
