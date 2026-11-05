import { expect, test } from 'vitest'

import { BaseError } from '../../src/errors/base.js'
import {
  AccountNotFoundError,
  BlockNotFoundError,
  CallExecutionError,
  ContractFunctionRevertedError,
  TransactionExpiredError,
  TransactionTamperedError,
  TronRpcError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from '../../src/errors/rpc.js'

test('AccountNotFoundError is a BaseError with the expected name / message', () => {
  const err = new AccountNotFoundError()
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('AccountNotFoundError')
  expect(err.shortMessage).toContain(
    'Could not find an Account to execute with this Action.',
  )
  expect(err.message).toContain('`account` argument')
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

test('ContractFunctionRevertedError decodes the Error(string) revert-reason path', () => {
  const err = new ContractFunctionRevertedError({
    functionName: 'transfer',
    reason: 'insufficient balance',
    signature: 'Error(string)',
  })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('ContractFunctionRevertedError')
  expect(err.reason).toBe('insufficient balance')
  expect(err.signature).toBe('Error(string)')
  expect(err.code).toBeUndefined()
  expect(err.data).toBeUndefined()
  expect(err.shortMessage).toBe(
    'The contract function "transfer" reverted with the following reason:\ninsufficient balance',
  )
})

test('ContractFunctionRevertedError decodes the Panic(uint256) code path (bigint)', () => {
  const err = new ContractFunctionRevertedError({
    functionName: 'transfer',
    code: 0x11n,
    signature: 'Panic(uint256)',
  })
  expect(err.name).toBe('ContractFunctionRevertedError')
  expect(typeof err.code).toBe('bigint')
  expect(err.code).toBe(0x11n)
  expect(err.signature).toBe('Panic(uint256)')
  expect(err.reason).toBeUndefined()
  expect(err.shortMessage).toBe(
    'The contract function "transfer" reverted with the following panic code: 17',
  )
})

test('ContractFunctionRevertedError surfaces raw data when it cannot decode', () => {
  const err = new ContractFunctionRevertedError({
    data: '0xdeadbeef',
  })
  expect(err.data).toBe('0xdeadbeef')
  expect(err.reason).toBeUndefined()
  expect(err.code).toBeUndefined()
  // With no functionName / reason / code / message, the generic form is used.
  expect(err.shortMessage).toBe('The contract function reverted.')
})

test('ContractFunctionRevertedError prefers an explicit message over decoded fields', () => {
  const err = new ContractFunctionRevertedError({
    functionName: 'transfer',
    reason: 'ignored',
    message: 'a fully custom message',
  })
  expect(err.shortMessage).toBe('a fully custom message')
  // The decoded field is still retained even when a message overrides it.
  expect(err.reason).toBe('ignored')
})

test('CallExecutionError wraps and retains its cause', () => {
  const cause = new ContractFunctionRevertedError({ reason: 'boom' })
  const err = new CallExecutionError(cause)
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('CallExecutionError')
  expect(err.shortMessage).toBe('Execution reverted with an unexpected error.')
  expect(err.cause).toBe(cause)
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

test('TransactionTamperedError fails closed and retains the mismatch fields', () => {
  const err = new TransactionTamperedError({
    localTxId: 'aaaa1111',
    nodeTxId: 'bbbb2222',
    path: 'getSignWeight',
  })
  expect(err).toBeInstanceOf(BaseError)
  expect(err.name).toBe('TransactionTamperedError')
  // The message names the mismatch and the anti-tamper posture.
  expect(err.shortMessage).toContain('does not match the locally built one')
  expect(err.message).toContain('transaction tampering')
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

test('TransactionTamperedError omits absent fields from its metaMessages', () => {
  const err = new TransactionTamperedError({ localTxId: 'aaaa1111' })
  expect(err.metaMessages).toEqual(['Local txID: aaaa1111'])
  expect(new TransactionTamperedError().metaMessages).toEqual([])
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
  const outer = new CallExecutionError(err)
  expect(outer.walk((e) => e instanceof UserRejectedRequestError)).toBe(err)
})
