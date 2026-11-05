import { describe, expect, test } from 'vitest'
import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js'
import type { SignableTransaction } from '../../src/accounts/types.js'
import { decodeRawData } from '../../src/utils/transaction/decodeRawData.js'
import { getTransactionId } from '../../src/utils/transaction/getTransactionId.js'
import { toRawDataHex } from '../../src/utils/transaction/serializeRawData.js'
import { loadTxFixtureFile, loadTxFixtures } from '../fixtures/tx/loader.js'

// Only pk=1 is a permitted trivial private key.
const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'
// pk=2: a non-owner co-signer for the multiSign tests.
const pk2 = '0x0000000000000000000000000000000000000000000000000000000000000002'

// §2.1 / §2.2 / §2.3 authoritative derivations for pk=1.
const address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
const publicKey =
  '0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'
// §2.3 canonical transaction id.
const txID = '407ec75dad4545890e5788ef78555ecab9dc72d56df29da4ebbd508022bdbaba'
// §2.3 signature over that id (bare TRON wire form, ends `ae001c`, v=0x1c=28).
const txSignature =
  '4d6f1e54ea593e5118c2d1b3701a4cab4d5235a418e9e46dba8c5f033bc4af0f6c04a08241de23936dffdedc869eac45533f9479a6bf372a38382b168b65ae001c'

const txCheckError = 'The transaction failed its integrity check (txCheck).'

const canonicalRawData = decodeRawData(
  loadTxFixtures().find(
    (f) => f.name === 'transfer canonical (reference vector)',
  )!.rawDataHex,
)

/** The full consistent `txID`/`raw_data`/`raw_data_hex` triple for §2.3. */
function canonicalTransaction(): SignableTransaction {
  return {
    txID: getTransactionId(canonicalRawData),
    raw_data: canonicalRawData,
    raw_data_hex: toRawDataHex(canonicalRawData),
  }
}

describe('privateKeyToAccount', () => {
  test('§2.1: derives address and uncompressed public key (pk=1)', () => {
    const account = privateKeyToAccount(pk1)
    expect(account.address).toBe(address)
    expect(account.publicKey).toBe(publicKey)
    expect(account.source).toBe('privateKey')
    expect(account.type).toBe('local')
  })

  test('accepts a bare (non-0x) hex private key', () => {
    expect(privateKeyToAccount(pk1.slice(2)).address).toBe(address)
  })

  test('rejects a short (< 32 byte) key instead of zero-padding it', () => {
    expect(() => privateKeyToAccount('1')).toThrow()
  })

  test('exposes NO raw-digest sign (blind signing unsupported)', () => {
    const account = privateKeyToAccount(pk1)
    expect('sign' in account).toBe(false)
  })

  test('§2.2: signMessage reproduces the TronWeb-verified vector', async () => {
    const account = privateKeyToAccount(pk1)
    // TronWeb-verified vectors for "sign this message" (pk=1). The §2.2
    // vector in the task spec is stale (pre-rename); see the SIG-3/4/5 notes.
    const signature = await account.signMessage({
      message: 'sign this message',
    })
    expect(signature.serialized).toBe(
      '0x9db3012a68317a97618479e218f3ca6849714071c2a8f07c160f1a804b114a8e166364cb124269a0edea614f50ae2acd0fd3a2c97ae89f45b4811427fb6136b71b',
    )
    expect(signature.v).toBe(27)
  })

  test('signTransaction signs the full triple and appends the signature', async () => {
    const account = privateKeyToAccount(pk1)
    const signed = await account.signTransaction(canonicalTransaction())
    expect(signed.txID).toBe(txID)
    expect(signed.signature).toEqual([txSignature])
  })

  test('signTransaction passes txID/raw_data/raw_data_hex through unchanged', async () => {
    const account = privateKeyToAccount(pk1)
    const transaction = canonicalTransaction()
    const signed = await account.signTransaction(transaction)
    expect(signed.txID).toBe(transaction.txID)
    expect(signed.raw_data).toEqual(transaction.raw_data)
    expect(signed.raw_data_hex).toBe(transaction.raw_data_hex)
  })

  test('signTransaction refuses an already-signed transaction', () => {
    // Single-signature flow: an existing signature (own or foreign) means the
    // caller double-signed by mistake — co-signing goes through multiSign.
    const account = privateKeyToAccount(pk1)
    expect(() =>
      account.signTransaction({
        ...canonicalTransaction(),
        signature: ['deadbeef'],
      }),
    ).toThrow(
      'The transaction is already signed (1 signature(s)) — co-signing a multi-signature transaction goes through multiSign.',
    )
  })

  test('signTransaction refuses a signature getter that hides itself from the guard', async () => {
    // The guard and the signer must read the same `signature` list. A getter
    // answering the guard with an empty list and the signer with a foreign
    // signature would otherwise smuggle that signature into the result.
    const account = privateKeyToAccount(pk1)
    let reads = 0
    const transaction = Object.defineProperty(
      canonicalTransaction(),
      'signature',
      {
        enumerable: true,
        get() {
          reads++
          return reads === 1 ? [] : ['deadbeef']
        },
      },
    )
    const signed = await account.signTransaction(transaction)
    expect(signed.signature).not.toContain('deadbeef')
    expect(signed.signature).toHaveLength(1)
  })

  test('signTransaction refuses to re-sign its own signed output', async () => {
    const account = privateKeyToAccount(pk1)
    const signed = await account.signTransaction(canonicalTransaction())
    expect(() => account.signTransaction(signed)).toThrow(
      'The transaction is already signed (1 signature(s)) — co-signing a multi-signature transaction goes through multiSign.',
    )
  })

  test('signTransaction treats an empty signature list as unsigned', async () => {
    const account = privateKeyToAccount(pk1)
    const signed = await account.signTransaction({
      ...canonicalTransaction(),
      signature: [],
    })
    expect(signed.signature).toEqual([txSignature])
  })

  test('signTransaction refuses a bare txID (blind signing)', () => {
    const account = privateKeyToAccount(pk1)
    expect(() =>
      account.signTransaction({ txID } as unknown as SignableTransaction),
    ).toThrow(txCheckError)
  })

  test('signTransaction refuses a bare raw_data (no verified bytes/id)', () => {
    const account = privateKeyToAccount(pk1)
    expect(() =>
      account.signTransaction({
        raw_data: canonicalRawData,
      } as unknown as SignableTransaction),
    ).toThrow(txCheckError)
  })

  test('signTransaction does not mutate its input', () => {
    const account = privateKeyToAccount(pk1)
    const transaction = {
      ...canonicalTransaction(),
      signature: [] as string[],
    }
    account.signTransaction(transaction)
    expect(transaction.signature).toEqual([])
  })

  test('signTransaction throws without a txID or raw_data', () => {
    const account = privateKeyToAccount(pk1)
    expect(() =>
      account.signTransaction({} as unknown as SignableTransaction),
    ).toThrow(txCheckError)
  })

  test('a signed transaction id is self-consistent with getTransactionId', async () => {
    const account = privateKeyToAccount(pk1)
    const signed = await account.signTransaction(canonicalTransaction())
    expect(signed.txID).toBe(getTransactionId(canonicalRawData))
  })
})

describe('multiSign', () => {
  // Case 0: the canonical unbound transfer (owner = pk1's address). Case 1:
  // the SAME transfer with Permission_id=2 baked in — the gold vector a
  // fresh bind must reproduce.
  const [transfer, transferBound] = loadTxFixtureFile('transfer-contract.json')

  /** The fixture's full consistent triple (unbound bytes). */
  function unboundTriple(): SignableTransaction {
    return {
      txID: transfer!.txID,
      raw_data: decodeRawData(transfer!.rawDataHex),
      raw_data_hex: transfer!.rawDataHex,
    }
  }

  /** The Permission_id=2 gold vector's full consistent triple. */
  function boundTriple(): SignableTransaction {
    return {
      txID: transferBound!.txID,
      raw_data: decodeRawData(transferBound!.rawDataHex),
      raw_data_hex: transferBound!.rawDataHex,
    }
  }

  test('binds a fresh permission id and reproduces the bound gold vector', async () => {
    const account = privateKeyToAccount(pk1)
    const signed = await account.multiSign(unboundTriple(), { permissionId: 2 })
    expect(signed.raw_data.contract[0]?.Permission_id).toBe(2)
    expect(signed.raw_data_hex).toBe(transferBound!.rawDataHex)
    expect(signed.txID).toBe(transferBound!.txID)
    // Identical bytes → identical deterministic signature to signing the
    // bound gold vector directly.
    const direct = await account.signTransaction(boundTriple())
    expect(signed.signature).toHaveLength(1)
    expect(signed.signature?.[0]).toBe(direct.signature?.[0])
  })

  test('a non-owner co-signer appends under the baked id', async () => {
    const owner = privateKeyToAccount(pk1)
    const cosigner = privateKeyToAccount(pk2)
    const first = await owner.multiSign(unboundTriple(), { permissionId: 2 })
    // No options: the co-signer inherits contract[0].Permission_id (2). pk2
    // is NOT the owner — membership is the node's business, signing is local.
    const second = await cosigner.multiSign(first)
    expect(second.signature).toHaveLength(2)
    expect(second.signature?.[0]).toBe(first.signature?.[0])
    expect(second.txID).toBe(first.txID)
    expect(second.raw_data_hex).toBe(first.raw_data_hex)
  })

  test('omitted options mean the owner permission — bytes unchanged', async () => {
    const account = privateKeyToAccount(pk1)
    const signed = await account.multiSign(unboundTriple())
    expect(signed.signature).toHaveLength(1)
    expect(signed.raw_data_hex).toBe(transfer!.rawDataHex)
    expect(signed.txID).toBe(transfer!.txID)
  })

  test('runs the multi-sig guards (permission id mismatch throws)', async () => {
    const owner = privateKeyToAccount(pk1)
    const bound = await owner.multiSign(unboundTriple(), { permissionId: 2 })
    expect(() =>
      privateKeyToAccount(pk2).multiSign(bound, { permissionId: 3 }),
    ).toThrow(/^Permission id mismatch:/)
  })

  test('does not mutate its input', () => {
    const account = privateKeyToAccount(pk1)
    const transaction = unboundTriple()
    account.multiSign(transaction, { permissionId: 2 })
    expect(transaction.raw_data.contract[0]?.Permission_id).toBeUndefined()
    expect(transaction.raw_data_hex).toBe(transfer!.rawDataHex)
    expect(transaction.signature).toBeUndefined()
  })
})

describe('sync compatibility (signer surface typed MaybePromise)', () => {
  // The signer surface is typed `MaybePromise<T>` for every account, but a
  // key-backed account still resolves synchronously: existing callers that
  // read the result without `await` keep working byte-for-byte, and awaiting
  // it yields the identical value.
  const [transfer] = loadTxFixtureFile('transfer-contract.json')

  function isThenable(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { then?: unknown }).then === 'function'
    )
  }

  const typedData = {
    domain: { name: 'Example', version: '1', chainId: 728126428n },
    types: { Msg: [{ name: 'text', type: 'string' }] },
    primaryType: 'Msg',
    message: { text: 'hi' },
  } as const

  test('signMessage returns the Signature synchronously; awaiting is identical', async () => {
    const account = privateKeyToAccount(pk1)
    const sync = account.signMessage({ message: 'sign this message' })
    expect(isThenable(sync)).toBe(false)
    const awaited = await account.signMessage({ message: 'sign this message' })
    expect(awaited).toEqual(sync)
    expect(awaited.serialized).toBe(
      '0x9db3012a68317a97618479e218f3ca6849714071c2a8f07c160f1a804b114a8e166364cb124269a0edea614f50ae2acd0fd3a2c97ae89f45b4811427fb6136b71b',
    )
  })

  test('signTypedData returns the Signature synchronously; awaiting is identical', async () => {
    const account = privateKeyToAccount(pk1)
    const sync = account.signTypedData(typedData)
    expect(isThenable(sync)).toBe(false)
    const awaited = await account.signTypedData(typedData)
    expect(awaited).toEqual(sync)
  })

  test('signTransaction returns the transaction synchronously; awaiting is identical', async () => {
    const account = privateKeyToAccount(pk1)
    const sync = account.signTransaction(canonicalTransaction())
    expect(isThenable(sync)).toBe(false)
    const awaited = await account.signTransaction(canonicalTransaction())
    expect(awaited).toEqual(sync)
    expect(awaited.txID).toBe(txID)
    expect(awaited.signature).toEqual([txSignature])
  })

  test('multiSign returns the transaction synchronously; awaiting is identical', async () => {
    const account = privateKeyToAccount(pk1)
    const triple = (): SignableTransaction => ({
      txID: transfer!.txID,
      raw_data: decodeRawData(transfer!.rawDataHex),
      raw_data_hex: transfer!.rawDataHex,
    })
    const sync = account.multiSign(triple(), { permissionId: 2 })
    expect(isThenable(sync)).toBe(false)
    const awaited = await account.multiSign(triple(), { permissionId: 2 })
    expect(awaited).toEqual(sync)
  })

  test('guard failures still throw synchronously (not a rejected Promise)', () => {
    const account = privateKeyToAccount(pk1)
    // A sync throw is what pre-MaybePromise callers' try/catch relied on.
    expect(() =>
      account.signTransaction({} as unknown as SignableTransaction),
    ).toThrow(txCheckError)
  })
})
