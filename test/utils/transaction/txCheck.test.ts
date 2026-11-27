import { expect, test } from 'vitest'
import { InvalidParameterError } from '../../../src/errors/parameter.js'
import { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import {
  type RawData,
  toRawDataHex,
} from '../../../src/utils/transaction/serializeRawData.js'
import { txCheck } from '../../../src/utils/transaction/txCheck.js'
import { loadTxFixtures } from '../../fixtures/tx/loader.js'

const canonical = loadTxFixtures().find(
  (f) => f.name === 'transfer canonical (reference vector)',
)!

/** The canonical fixture as a signable transaction (fresh deep copy). */
function canonicalTx() {
  return {
    txID: canonical.txID,
    raw_data: structuredClone(canonical.rawData) as RawData,
    raw_data_hex: canonical.rawDataHex,
  }
}

test('txCheck asserts its argument is a transaction object', () => {
  // JS callers still on the legacy (rawDataHex, txId) signature get a loud
  // migration error, not a silent false.
  expect(() => txCheck(canonical.rawDataHex as never)).toThrow(
    'txCheck expects a signable transaction object',
  )
  expect(() => txCheck(null as never)).toThrow(
    'txCheck expects a signable transaction object',
  )
  expect(() => txCheck(undefined as never)).toThrow(
    'txCheck expects a signable transaction object',
  )
})

test.each(
  loadTxFixtures(),
)('txCheck passes for gold vector: $name', (fixture) => {
  expect(
    txCheck({
      txID: fixture.txID,
      raw_data: fixture.rawData as RawData,
      raw_data_hex: fixture.rawDataHex,
    }),
  ).toBe(true)
})

test('txCheck accepts 0x-prefixed and uppercase raw_data_hex and txID', () => {
  const tx = canonicalTx()
  expect(
    txCheck({
      ...tx,
      txID: `0x${tx.txID.toUpperCase()}`,
      raw_data_hex: `0x${tx.raw_data_hex.toUpperCase()}`,
    }),
  ).toBe(true)
})

test('txCheck fails when raw_data disagrees with raw_data_hex', () => {
  const tx = canonicalTx()
  ;(tx.raw_data.contract[0]!.parameter.value as { amount: number }).amount = 2
  expect(txCheck(tx)).toBe(false)
})

test('txCheck fails when a raw_data_hex byte is flipped', () => {
  const tx = canonicalTx()
  const chars = tx.raw_data_hex.split('')
  // Flip one nibble inside the encoded amount (still valid hex, changes bytes).
  const i = chars.length - 2
  chars[i] = chars[i] === '0' ? '1' : '0'
  const tampered = chars.join('')
  expect(tampered).not.toBe(tx.raw_data_hex)
  expect(txCheck({ ...tx, raw_data_hex: tampered })).toBe(false)
})

test('txCheck fails when the txID does not match', () => {
  const tx = canonicalTx()
  const wrong = `${tx.txID.slice(0, -1)}${tx.txID.endsWith('0') ? '1' : '0'}`
  expect(txCheck({ ...tx, txID: wrong })).toBe(false)
})

test('txCheck fails when any of the three fields is missing', () => {
  const tx = canonicalTx()
  expect(txCheck({ ...tx, txID: undefined })).toBe(false)
  expect(txCheck({ ...tx, raw_data: undefined })).toBe(false)
  expect(txCheck({ ...tx, raw_data_hex: undefined })).toBe(false)
  expect(txCheck({})).toBe(false)
})

test('txCheck fails a wrong-length txID even when it prefix-matches', () => {
  const tx = canonicalTx()
  // A truncated txID that is a correct prefix of the real id must not pass.
  expect(txCheck({ ...tx, txID: tx.txID.slice(0, 32) })).toBe(false)
  // Nor a correct id with trailing hex appended.
  expect(txCheck({ ...tx, txID: `${tx.txID}ab` })).toBe(false)
})

test('txCheck fails a raw_data that serializes to zero bytes', () => {
  // A contract-less raw_data encodes to empty bytes — not a transaction.
  // Both faithful renderings of "empty" get the same verdict.
  const empty = { contract: [] }
  const sha256OfEmpty =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  expect(
    txCheck({ txID: sha256OfEmpty, raw_data: empty, raw_data_hex: '0x' }),
  ).toBe(false)
  expect(
    txCheck({ txID: sha256OfEmpty, raw_data: empty, raw_data_hex: '' }),
  ).toBe(false)
})

test('txCheck fails contract:[] even when other fields serialize to bytes', () => {
  // `contract: []` with a ref-block field serializes to NON-empty bytes, so
  // the zero-bytes guard alone misses it — a contract-less shell must still
  // be rejected (else downstream owner_address reads hit an empty list).
  const shell = { ref_block_bytes: '1234', contract: [] } as unknown as RawData
  const hex = '0a021234'
  expect(txCheck({ txID: 'ab', raw_data: shell, raw_data_hex: hex })).toBe(
    false,
  )
})

test.each([
  undefined,
  0,
])('txCheck accepts the default Permission_id value %s', (permissionId) => {
  const tx = canonicalTx()
  tx.raw_data.contract[0]!.Permission_id = permissionId
  expect(txCheck(tx)).toBe(true)
})

test('txCheck rejects an empty string Permission_id', () => {
  const tx = canonicalTx()
  tx.raw_data.contract[0]!.Permission_id = '' as never
  expect(txCheck(tx)).toBe(false)
})

test('txCheck returns false (does not throw) on structurally broken input', () => {
  const tx = canonicalTx()
  // Unknown key in raw_data: strict serialization refuses it.
  expect(
    txCheck({ ...tx, raw_data: { ...tx.raw_data, bogus: 1 } as RawData }),
  ).toBe(false)
  // Invalid raw_data model shape.
  expect(txCheck({ ...tx, raw_data: { contract: 'nope' } as never })).toBe(
    false,
  )
  // Invalid hex.
  expect(txCheck({ ...tx, raw_data_hex: 'zz' })).toBe(false)
})

test('txCheck throws an InvalidParameterError for a non-object argument', () => {
  expect(() => txCheck(null as never)).toThrow(InvalidParameterError)
  expect(() => txCheck(null as never)).toThrow(
    expect.objectContaining({
      name: 'InvalidParameterError',
      param: 'transaction',
      reason: 'type',
    }),
  )
})

// `raw_data_hex` and `txID` are compared against one serialization of
// `raw_data`. The model below returns a different `amount` after a number of
// reads, so a second serialization would see different content than the first.
test('raw_data_hex and txID are checked against the same serialized bytes', () => {
  const first = canonicalTx().raw_data
  const second = canonicalTx().raw_data
  const amountOf = (rawData: RawData) =>
    (rawData.contract[0]?.parameter.value as { amount: number }).amount
  ;(second.contract[0]?.parameter.value as { amount: number }).amount =
    amountOf(first) * 1000
  const hexOfFirst = toRawDataHex(first)
  const idOfSecond = getTransactionId(second)
  expect(idOfSecond).not.toBe(getTransactionId(first))

  /** A model whose `amount` reads as `first`'s for `switchAfter` reads, then as `second`'s. */
  const changing = (switchAfter: number) => {
    const rawData = canonicalTx().raw_data
    let reads = 0
    Object.defineProperty(rawData.contract[0]?.parameter.value, 'amount', {
      enumerable: true,
      get: () => (reads++ < switchAfter ? amountOf(first) : amountOf(second)),
    })
    return rawData
  }

  // How many times one serialization reads `amount`.
  let readsPerSerialization = 0
  const counted = canonicalTx().raw_data
  const amount = amountOf(counted)
  Object.defineProperty(counted.contract[0]?.parameter.value, 'amount', {
    enumerable: true,
    get: () => {
      readsPerSerialization++
      return amount
    },
  })
  toRawDataHex(counted)
  expect(readsPerSerialization).toBeGreaterThan(0)

  // Wherever the value changes, hex-of-first with id-of-second never passes.
  for (
    let switchAfter = 0;
    switchAfter <= readsPerSerialization * 3;
    switchAfter++
  )
    expect([
      switchAfter,
      txCheck({
        txID: idOfSecond,
        raw_data: changing(switchAfter),
        raw_data_hex: hexOfFirst,
      }),
    ]).toEqual([switchAfter, false])
})

test('a model with accessor properties passes when its content is stable', () => {
  const rawData = canonicalTx().raw_data
  const value = rawData.contract[0]?.parameter.value as { amount: number }
  const amount = value.amount
  Object.defineProperty(value, 'amount', {
    enumerable: true,
    get: () => amount,
  })
  expect(
    txCheck({
      txID: canonical.txID,
      raw_data: rawData,
      raw_data_hex: canonical.rawDataHex,
    }),
  ).toBe(true)
})

test('txID agrees with getTransactionId for every gold vector', () => {
  for (const fixture of loadTxFixtures()) {
    const rawData = fixture.rawData as RawData
    expect(getTransactionId(rawData)).toBe(fixture.txID)
    // A txID that is not the hash of the bytes fails, with raw_data_hex intact.
    const other = `${fixture.txID.slice(0, -1)}${fixture.txID.endsWith('0') ? '1' : '0'}`
    expect(
      txCheck({
        txID: other,
        raw_data: rawData,
        raw_data_hex: fixture.rawDataHex,
      }),
    ).toBe(false)
  }
})
