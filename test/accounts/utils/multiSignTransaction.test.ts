import { describe, expect, test } from 'vitest'
import type { SignableTransaction } from '../../../src/accounts/types.js'
import { multiSignTransaction } from '../../../src/accounts/utils/multiSignTransaction.js'
import { signTransaction } from '../../../src/accounts/utils/signTransaction.js'
import {
  PermissionError,
  TransactionIntegrityError,
} from '../../../src/errors/transaction.js'
import { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import {
  type RawData,
  toRawDataHex,
} from '../../../src/utils/transaction/serializeRawData.js'
import { loadTxFixtureFile } from '../../fixtures/tx/loader.js'

// pk=1 derives the fixture's owner_address (a permitted trivial key).
const pk1 = `0x${'0'.repeat(63)}1` as const

const [transfer] = loadTxFixtureFile('transfer-contract.json')

/** The fixture's full consistent triple (unbound bytes). */
function unboundTriple(): SignableTransaction {
  return {
    txID: transfer!.txID,
    raw_data: decodeRawData(transfer!.rawDataHex),
    raw_data_hex: transfer!.rawDataHex,
  }
}

/** The honest raw data with the transfer amount tampered (still valid). */
function tamperedRawData(): RawData {
  const raw = decodeRawData(transfer!.rawDataHex)
  const [first] = raw.contract
  return {
    ...raw,
    contract: [
      {
        ...first!,
        parameter: {
          ...first!.parameter,
          value: {
            ...(first!.parameter.value as Record<string, unknown>),
            amount: 999_999,
          } as never,
        },
      },
    ],
  }
}

test('defuses a getter that swaps raw_data between check and sign (TOCTOU)', () => {
  // multiSign recomputes the triple from raw_data before delegating to
  // signTransaction; the pre-check snapshot means txCheck and the recompute
  // read one model.
  const honest = unboundTriple()
  const local = signTransaction({ transaction: honest, privateKey: pk1 })
  let reads = 0
  const evil = {
    txID: honest.txID,
    raw_data_hex: honest.raw_data_hex,
    get raw_data() {
      reads++
      return reads === 1 ? honest.raw_data : tamperedRawData()
    },
  } as unknown as SignableTransaction
  const signed = multiSignTransaction({ transaction: evil, privateKey: pk1 })
  expect(signed.txID).toBe(honest.txID)
  expect(signed.raw_data_hex).toBe(honest.raw_data_hex)
  expect(signed.signature).toEqual(local.signature)
})

test('returns a transaction sharing no references with the input', () => {
  const transaction = unboundTriple()
  const signed = multiSignTransaction({ transaction, privateKey: pk1 })
  expect(signed.raw_data).not.toBe(transaction.raw_data)
  expect(signed.raw_data).toEqual(transaction.raw_data)
  expect(signed.raw_data_hex).toBe(transaction.raw_data_hex)
})

/** Runs `fn` and returns what it throws. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected a throw')
}

/** The consistent triple of a raw data. */
function tripleOf(raw_data: RawData): SignableTransaction {
  return {
    txID: getTransactionId(raw_data),
    raw_data,
    raw_data_hex: toRawDataHex(raw_data),
  }
}

/** The fixture's triple with `Permission_id` baked into every contract. */
function boundTriple(permissionId: number): SignableTransaction {
  const raw = decodeRawData(transfer!.rawDataHex)
  return tripleOf({
    ...raw,
    contract: raw.contract.map((contract) => ({
      ...contract,
      Permission_id: permissionId,
    })),
  })
}

describe('error classes', () => {
  test('a txCheck failure is a TransactionIntegrityError without a field', () => {
    const error = thrownBy(() =>
      multiSignTransaction({
        transaction: { ...unboundTriple(), txID: 'deadbeef'.repeat(8) },
        privateKey: pk1,
      }),
    )
    expect(error).toBeInstanceOf(TransactionIntegrityError)
    expect(error).toMatchObject({
      name: 'TransactionIntegrityError',
      shortMessage: 'The transaction failed its integrity check (txCheck).',
    })
    expect((error as TransactionIntegrityError).field).toBeUndefined()
  })

  test.each([
    -1, 1.5,
  ])('an invalid permission id (%s) is a PermissionError', (permissionId) => {
    const error = thrownBy(() =>
      multiSignTransaction({
        transaction: unboundTriple(),
        privateKey: pk1,
        permissionId,
      }),
    )
    expect(error).toBeInstanceOf(PermissionError)
    expect(error).toMatchObject({
      name: 'PermissionError',
      permissionId,
      shortMessage: `Invalid multi-sig permission id: ${permissionId}. Expected a non-negative integer (an active permission's id is >= 2).`,
    })
  })

  test('a permission id other than the bound one is a PermissionError', () => {
    const error = thrownBy(() =>
      multiSignTransaction({
        transaction: boundTriple(2),
        privateKey: pk1,
        permissionId: 3,
      }),
    )
    expect(error).toBeInstanceOf(PermissionError)
    expect(error).toMatchObject({
      name: 'PermissionError',
      permissionId: 3,
      shortMessage:
        'Permission id mismatch: the transaction is bound to permission 2, but 3 was supplied.',
    })
  })

  test('binding an id onto a signed transaction is a PermissionError', () => {
    const error = thrownBy(() =>
      multiSignTransaction({
        transaction: { ...unboundTriple(), signature: ['deadbeef'] },
        privateKey: pk1,
        permissionId: 2,
      }),
    )
    expect(error).toBeInstanceOf(PermissionError)
    expect(error).toMatchObject({
      name: 'PermissionError',
      permissionId: 2,
      shortMessage:
        'Cannot bind permission id 2: the transaction already carries 1 signature(s) over the unbound bytes; binding now would invalidate them.',
    })
  })
})
