import { describe, expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import type { SignableTransaction } from '../../../src/accounts/types.js'
import { assertSignedTransaction } from '../../../src/actions/utils/assertSignedTransaction.js'
import { TransactionMismatchError } from '../../../src/errors/rpc.js'
import { addressToHex } from '../../../src/utils/address/addressToHex.js'
import { toBase58 } from '../../../src/utils/address/toBase58.js'
import { toEvm } from '../../../src/utils/address/toEvm.js'
import { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import {
  type RawData,
  toRawDataHex,
} from '../../../src/utils/transaction/serializeRawData.js'
import { loadTxFixtureFile } from '../../fixtures/tx/loader.js'

// Only pk=1 is a permitted trivial private key; it owns the canonical transfer.
const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'
// pk=2: a non-owner co-signer, and the owner of the "different owner" transfer.
const pk2 = '0x0000000000000000000000000000000000000000000000000000000000000002'

const owner = privateKeyToAccount(pk1)
const other = privateKeyToAccount(pk2)

// Case 0: the canonical unbound transfer (owner = pk1's address). Case 1: the
// SAME transfer with Permission_id=2 baked in.
const [transfer, transferBound] = loadTxFixtureFile('transfer-contract.json')

const messages = {
  txCheck:
    'The signer returned a transaction that fails txCheck: its txID, raw_data and raw_data_hex do not agree, or raw_data holds fields this SDK does not serialize.',
  unreadableOwner:
    'The transaction to sign has no readable owner_address to check the signed result against.',
  signature: 'The signer returned a transaction without a signature.',
  owner:
    'The signer returned a transaction for a different owner_address than the one it was asked to sign.',
}

/** A full consistent triple for any raw_data model, built with the repo's codec. */
function triple(raw_data: RawData): SignableTransaction {
  return {
    txID: getTransactionId(raw_data),
    raw_data,
    raw_data_hex: toRawDataHex(raw_data),
  }
}

/** The canonical transfer's unsigned triple (owner = pk1, hex addresses). */
function unsignedTransfer(): SignableTransaction {
  return triple(decodeRawData(transfer!.rawDataHex))
}

/** Replaces every contract's owner_address in a raw_data model. */
function withOwner(raw_data: RawData, owner_address: string): RawData {
  return {
    ...raw_data,
    contract: raw_data.contract.map((contract) => ({
      ...contract,
      parameter: {
        ...contract.parameter,
        value: { ...(contract.parameter.value as object), owner_address },
      },
    })),
  } as RawData
}

/**
 * What a wallet that rebuilds before signing hands back: fresh TaPoS
 * reference, later expiration / timestamp and an adjusted fee_limit — same
 * owner, so new bytes and a new txID — validly signed by the owner.
 */
async function walletRebuilt(unsigned: SignableTransaction) {
  const raw_data: RawData = {
    ...unsigned.raw_data,
    ref_block_bytes: 'abcd',
    ref_block_hash: '1112131415161718',
    expiration: 1700000120000,
    timestamp: 1700000060000,
    fee_limit: 30_000_000,
  }
  return owner.signTransaction(triple(raw_data))
}

/** Throws-assertion that also pins which check fired. */
function expectMismatch(fn: () => unknown, shortMessage: string) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(TransactionMismatchError)
    expect((error as TransactionMismatchError).shortMessage).toBe(shortMessage)
    return
  }
  expect.fail('expected TransactionMismatchError')
}

describe('accepts (compatibility)', () => {
  test('a validly signed, unchanged transaction', async () => {
    const unsigned = unsignedTransfer()
    const signed = await owner.signTransaction(unsigned)
    const result = assertSignedTransaction(signed, unsigned)
    expect(result).toEqual(signed)
    expect(result.txID).toBe(transfer!.txID)
  })

  test('a wallet-rebuilt transaction (new txID / expiration / fee_limit, same owner) and returns the rebuilt values', async () => {
    const unsigned = unsignedTransfer()
    const signed = await walletRebuilt(unsigned)
    expect(signed.txID).not.toBe(unsigned.txID)
    expect(signed.raw_data_hex).not.toBe(unsigned.raw_data_hex)

    const result = assertSignedTransaction(signed, unsigned)
    expect(result.txID).toBe(signed.txID)
    expect(result.txID).not.toBe(unsigned.txID)
    expect(result.raw_data_hex).toBe(signed.raw_data_hex)
    expect(result.raw_data.expiration).toBe(1700000120000)
    expect(result.raw_data.timestamp).toBe(1700000060000)
    expect(result.raw_data.fee_limit).toBe(30_000_000)
    expect(result.raw_data.ref_block_bytes).toBe('abcd')
    expect(result.raw_data.ref_block_hash).toBe('1112131415161718')
    expect(result.signature).toEqual(signed.signature)
  })

  test('a multi-sig co-signed transaction whose signer is not the owner', async () => {
    const first = await owner.multiSign(unsignedTransfer(), { permissionId: 2 })
    // pk2 is NOT the owner: co-signing keeps the owner_address intact.
    const second = await other.multiSign(first)
    expect(second.signature).toHaveLength(2)
    const result = assertSignedTransaction(second, first)
    expect(result).toEqual(second)
  })

  test('a non-owner co-signer as the only signer still passes', async () => {
    const unsigned = triple(decodeRawData(transferBound!.rawDataHex))
    const signed = await other.multiSign(unsigned)
    expect(() => assertSignedTransaction(signed, unsigned)).not.toThrow()
  })

  test('a fresh Permission_id bind (bytes changed, owner same)', async () => {
    const unsigned = unsignedTransfer()
    const signed = await owner.multiSign(unsigned, { permissionId: 2 })
    expect(signed.raw_data_hex).not.toBe(unsigned.raw_data_hex)
    expect(signed.txID).toBe(transferBound!.txID)
    const result = assertSignedTransaction(signed, unsigned)
    expect(result.txID).toBe(transferBound!.txID)
    expect(result.raw_data.contract[0]?.Permission_id).toBe(2)
  })

  describe('owner spelling does not matter (Base58 / 41-hex / 0x-hex)', () => {
    const hex = addressToHex(owner.address)
    const spellings = {
      base58: toBase58(hex),
      hex41: hex,
      evm0x: toEvm(hex),
    } as const

    test.each(
      Object.entries(spellings),
    )('unsigned owner spelled %s vs signed 41-hex', async (_, spelling) => {
      const signed = await owner.signTransaction(unsignedTransfer())
      const unsigned = {
        ...unsignedTransfer(),
        raw_data: withOwner(unsignedTransfer().raw_data, spelling),
      }
      expect(() => assertSignedTransaction(signed, unsigned)).not.toThrow()
    })

    test('signed owner spelled Base58 vs unsigned 41-hex / 0x-hex', async () => {
      const raw_data = withOwner(
        decodeRawData(transfer!.rawDataHex),
        spellings.base58,
      )
      const signed = await owner.signTransaction(triple(raw_data))
      // Base58 serializes to the same bytes as the canonical hex spelling.
      expect(signed.txID).toBe(transfer!.txID)
      expect(() =>
        assertSignedTransaction(signed, unsignedTransfer()),
      ).not.toThrow()
      const unsigned0x = {
        ...unsignedTransfer(),
        raw_data: withOwner(unsignedTransfer().raw_data, spellings.evm0x),
      }
      expect(() => assertSignedTransaction(signed, unsigned0x)).not.toThrow()
    })
  })
})

describe('rejects with TransactionMismatchError', () => {
  test('txCheck failure: txID does not match the bytes', async () => {
    const unsigned = unsignedTransfer()
    const signed = await owner.signTransaction(unsigned)
    expectMismatch(
      () =>
        assertSignedTransaction(
          { ...signed, txID: transferBound!.txID },
          unsigned,
        ),
      messages.txCheck,
    )
  })

  test('txCheck failure: raw_data_hex does not match raw_data', async () => {
    const unsigned = unsignedTransfer()
    const signed = await walletRebuilt(unsigned)
    expectMismatch(
      () =>
        assertSignedTransaction(
          { ...signed, raw_data_hex: unsigned.raw_data_hex },
          unsigned,
        ),
      messages.txCheck,
    )
  })

  test('missing signature array', () => {
    const unsigned = unsignedTransfer()
    expectMismatch(
      () => assertSignedTransaction(unsignedTransfer(), unsigned),
      messages.signature,
    )
  })

  test('empty signature array', () => {
    const unsigned = unsignedTransfer()
    expectMismatch(
      () =>
        assertSignedTransaction(
          { ...unsignedTransfer(), signature: [] },
          unsigned,
        ),
      messages.signature,
    )
  })

  test('different owner_address (valid signature, wrong owner)', async () => {
    const raw_data = withOwner(
      decodeRawData(transfer!.rawDataHex),
      addressToHex(other.address),
    )
    // pk2 legitimately owns and signs its own transfer.
    const signed = await other.signTransaction(triple(raw_data))
    expectMismatch(
      () => assertSignedTransaction(signed, unsignedTransfer()),
      messages.owner,
    )
  })

  test('unreadable owner: unsigned contract has no owner_address', async () => {
    const signed = await owner.signTransaction(unsignedTransfer())
    const unsigned = unsignedTransfer()
    delete (unsigned.raw_data.contract[0]!.parameter.value as any).owner_address
    expectMismatch(
      () => assertSignedTransaction(signed, unsigned),
      messages.unreadableOwner,
    )
  })

  test('unreadable owner: unsigned owner_address is not an address', async () => {
    const signed = await owner.signTransaction(unsignedTransfer())
    const unsigned = {
      ...unsignedTransfer(),
      raw_data: withOwner(unsignedTransfer().raw_data, 'not-an-address'),
    }
    expectMismatch(
      () => assertSignedTransaction(signed, unsigned),
      messages.unreadableOwner,
    )
  })

  test('unreadable owner: unsigned has an empty contract list', async () => {
    const signed = await owner.signTransaction(unsignedTransfer())
    const unsigned = {
      ...unsignedTransfer(),
      raw_data: { ...unsignedTransfer().raw_data, contract: [] },
    }
    expectMismatch(
      () => assertSignedTransaction(signed, unsigned),
      messages.unreadableOwner,
    )
  })

  test('signed with an empty contract list fails txCheck first', () => {
    const unsigned = unsignedTransfer()
    expectMismatch(
      () =>
        assertSignedTransaction(
          {
            ...unsigned,
            raw_data: { ...unsigned.raw_data, contract: [] },
            signature: ['00'],
          },
          unsigned,
        ),
      messages.txCheck,
    )
  })

  test('different contract count', async () => {
    const signed = await owner.signTransaction(unsignedTransfer())
    const single = unsignedTransfer()
    const unsigned = {
      ...single,
      raw_data: {
        ...single.raw_data,
        contract: [...single.raw_data.contract, ...single.raw_data.contract],
      },
    }
    // Same owner on every contract — only the count differs.
    expectMismatch(
      () => assertSignedTransaction(signed, unsigned),
      messages.owner,
    )
  })

  test('a different owner on a later contract (same count)', () => {
    const base = unsignedTransfer().raw_data
    const [first] = base.contract
    const twice = { ...base, contract: [first!, first!] } as RawData
    const unsigned = triple(twice)
    const [, second] = withOwner(twice, addressToHex(other.address)).contract
    // Only contract[1]'s owner moves; the signature's validity is not this
    // check's concern, so a placeholder suffices.
    const signed = {
      ...triple({ ...twice, contract: [first!, second!] } as RawData),
      signature: ['00'.repeat(65)],
    }
    expectMismatch(
      () => assertSignedTransaction(signed, unsigned),
      messages.owner,
    )
  })
})

describe('snapshot', () => {
  test('is deep-equal to the signed transaction but shares no references', async () => {
    const unsigned = unsignedTransfer()
    const signed = await owner.signTransaction(unsigned)
    const result = assertSignedTransaction(signed, unsigned)

    expect(result).toEqual(signed)
    expect(result).not.toBe(signed)
    expect(result.raw_data).not.toBe(signed.raw_data)
    expect(result.raw_data.contract).not.toBe(signed.raw_data.contract)
    expect(result.raw_data.contract[0]).not.toBe(signed.raw_data.contract[0])
    expect(result.raw_data.contract[0]!.parameter).not.toBe(
      signed.raw_data.contract[0]!.parameter,
    )
    expect(result.raw_data.contract[0]!.parameter.value).not.toBe(
      signed.raw_data.contract[0]!.parameter.value,
    )
    expect(result.signature).not.toBe(signed.signature)

    // Mutating the signer's object afterwards does not reach the snapshot.
    const before = structuredClone(result)
    signed.txID = 'ff'.repeat(32)
    signed.signature!.push('00')
    ;(signed.raw_data.contract[0]!.parameter.value as any).owner_address =
      addressToHex(other.address)
    expect(result).toEqual(before)
  })

  test('does not mutate either input', async () => {
    const unsigned = unsignedTransfer()
    const signed = await walletRebuilt(unsigned)
    const unsignedBefore = structuredClone(unsigned)
    const signedBefore = structuredClone(signed)
    assertSignedTransaction(signed, unsigned)
    expect(unsigned).toEqual(unsignedBefore)
    expect(signed).toEqual(signedBefore)
  })

  test('a txID getter that changes on every read yields one stable, checked value', async () => {
    const unsigned = unsignedTransfer()
    const signed = await owner.signTransaction(unsigned)
    const honest = signed.txID
    let reads = 0
    const shifty = { ...signed } as SignableTransaction
    Object.defineProperty(shifty, 'txID', {
      enumerable: true,
      get: () => (reads++ === 0 ? honest : `${reads}`.padStart(64, '0')),
    })

    const result = assertSignedTransaction(shifty, unsigned)
    // Read exactly once: the value checked is the value returned.
    expect(reads).toBe(1)
    expect(result.txID).toBe(honest)
    expect(Object.getOwnPropertyDescriptor(result, 'txID')).toHaveProperty(
      'value',
      honest,
    )
    expect(reads).toBe(1)
  })

  test('a txID getter whose first read is wrong is rejected even if later reads are honest', async () => {
    const unsigned = unsignedTransfer()
    const signed = await owner.signTransaction(unsigned)
    const honest = signed.txID
    let reads = 0
    const shifty = { ...signed } as SignableTransaction
    Object.defineProperty(shifty, 'txID', {
      enumerable: true,
      get: () => (reads++ === 0 ? transferBound!.txID : honest),
    })

    expectMismatch(
      () => assertSignedTransaction(shifty, unsigned),
      messages.txCheck,
    )
    expect(reads).toBe(1)
  })
})
