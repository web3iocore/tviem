import { expect, test, vi } from 'vitest'
import type { SignableTransaction } from '../../../src/accounts/types.js'
import { multiSignTransaction } from '../../../src/accounts/utils/multiSignTransaction.js'
import { TransactionIntegrityError } from '../../../src/errors/transaction.js'
import { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import { loadTxFixtureFile } from '../../fixtures/tx/loader.js'

// txCheck refuses a contract-less transaction before the owner_address read,
// so the read is exercised here with txCheck stubbed to pass.
vi.mock('../../../src/utils/transaction/txCheck.js', () => ({
  txCheck: () => true,
}))

// pk=1 derives the fixture's owner_address (a permitted trivial key).
const pk1 = `0x${'0'.repeat(63)}1` as const

const [transfer] = loadTxFixtureFile('transfer-contract.json')

test('a transaction without a first contract is a TransactionIntegrityError on `owner_address`', () => {
  const transaction: SignableTransaction = {
    txID: transfer!.txID,
    raw_data: { ...decodeRawData(transfer!.rawDataHex), contract: [] },
    raw_data_hex: transfer!.rawDataHex,
  }
  let caught: unknown
  try {
    multiSignTransaction({ transaction, privateKey: pk1 })
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(TransactionIntegrityError)
  expect(caught).toMatchObject({
    name: 'TransactionIntegrityError',
    field: 'owner_address',
    shortMessage: 'The transaction has no readable owner_address.',
  })
})
