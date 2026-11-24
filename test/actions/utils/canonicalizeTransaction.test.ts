import { expect, test } from 'vitest'
import type { SignableTransaction } from '../../../src/accounts/types.js'
import { canonicalizeTransaction } from '../../../src/actions/utils/canonicalizeTransaction.js'
import type { TronHexAddress } from '../../../src/types/address.js'
import { toBase58 } from '../../../src/utils/address/toBase58.js'
import { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import type { RawData } from '../../../src/utils/transaction/serializeRawData.js'
import { loadTxFixtureFile } from '../../fixtures/tx/loader.js'

const [transfer] = loadTxFixtureFile('transfer-contract.json')
const canonicalRawData: RawData = decodeRawData(transfer!.rawDataHex)
const canonical: SignableTransaction = {
  txID: transfer!.txID,
  raw_data: canonicalRawData,
  raw_data_hex: transfer!.rawDataHex,
  signature: ['ab'.repeat(65)],
}

// The decoded contract narrows through its `type` discriminant.
const canonicalContract = canonicalRawData.contract[0]!
if (canonicalContract.type !== 'TransferContract')
  throw new Error('transfer-contract fixture is not a TransferContract')
const value = canonicalContract.parameter.value

// The same bytes, spelled the way java-tron renders them for `visible: true`
// (Base58 addresses are still a `string`, so this is a `RawData` too).
const visibleRawData: RawData = {
  ...canonicalRawData,
  contract: [
    {
      ...canonicalContract,
      parameter: {
        ...canonicalContract.parameter,
        value: {
          ...value,
          owner_address: toBase58(value.owner_address as TronHexAddress),
          to_address: toBase58(value.to_address as TronHexAddress),
        },
      },
    },
  ],
}

test('a canonical transaction comes back equal', () => {
  expect(canonicalizeTransaction(canonical)).toEqual(canonical)
})

test('re-derives raw_data from raw_data_hex, keeping every other field', () => {
  expect(
    canonicalizeTransaction({ ...canonical, raw_data: visibleRawData }),
  ).toEqual(canonical)
})

test('pins a carried `visible` flag to false — the form the model is now in', () => {
  expect(
    canonicalizeTransaction({
      ...canonical,
      raw_data: visibleRawData,
      visible: true,
    } as SignableTransaction),
  ).toEqual({ ...canonical, visible: false })
})

test('does not invent a `visible` key the transaction never carried', () => {
  expect(
    canonicalizeTransaction({ ...canonical, raw_data: visibleRawData }),
  ).not.toHaveProperty('visible')
})

test('preserves the supplied txID when decoding raw_data_hex', () => {
  const txID = 'ab'.repeat(32)
  expect(
    canonicalizeTransaction({ ...canonical, txID, raw_data: visibleRawData }),
  ).toEqual({ ...canonical, txID })
})
