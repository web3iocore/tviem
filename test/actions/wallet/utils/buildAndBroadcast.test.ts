import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../../src/accounts/toAccount.js'
import type {
  SignableTransaction,
  TronAccount,
  TronCustomSource,
} from '../../../../src/accounts/types.js'
import { buildAndBroadcast } from '../../../../src/actions/wallet/utils/buildAndBroadcast.js'
import { createPublicClient } from '../../../../src/clients/createPublicClient.js'
import {
  TransactionMismatchError,
  UserRejectedRequestError,
} from '../../../../src/errors/rpc.js'
import { addressToHex } from '../../../../src/utils/address/addressToHex.js'
import { getTransactionId } from '../../../../src/utils/transaction/getTransactionId.js'
import {
  ContractType,
  contractTypeUrlPrefix,
} from '../../../../src/utils/transaction/registry.js'
import {
  type RawContract,
  type RawData,
  toRawDataHex,
} from '../../../../src/utils/transaction/serializeRawData.js'
import { rpc } from '../../../fixtures/rpc/loader.js'
import { loadTxFixtureFile } from '../../../fixtures/tx/loader.js'
import { createMockTransport } from '../../../mock/createMockTransport.js'
import { parseBroadcast } from '../../../mock/parseBroadcast.js'

// pk = 1 → address TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC (the fixture owner).
const pk1 = `0x${'0'.repeat(63)}1` as const
const account = privateKeyToAccount(pk1)

const [bandwidth] = loadTxFixtureFile('freeze-balance-v2-contract.json')

function writeMock() {
  return createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
}

/** A `FreezeBalanceV2Contract` matching the BANDWIDTH gold vector. */
function freezeContract(): RawContract {
  return {
    type: ContractType.FreezeBalanceV2Contract,
    parameter: {
      type_url: `${contractTypeUrlPrefix}FreezeBalanceV2Contract`,
      value: {
        owner_address: addressToHex(account.address),
        frozen_balance: 1000000n,
      },
    },
  }
}

test('runs getNowBlock → sign → broadcast and returns the local txID', async () => {
  const { transport, calls, bodyOf } = writeMock()
  const client = createPublicClient({ transport })

  const response = await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
  })

  // Byte-for-byte gold: the helper produces the same bytes as the action.
  expect(response.txID).toBe(bandwidth?.txID)
  expect(calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
  expect(calls[0]?.method).toBe('GET')
  expect(calls[1]?.method).toBe('POST')

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    txID: string
    raw_data_hex: string
    raw_data: { fee_limit?: number | undefined }
    signature: string[]
  }
  expect(body.txID).toBe(bandwidth?.txID)
  expect(body.raw_data_hex).toBe(bandwidth?.rawDataHex)
  expect(body.signature).toHaveLength(1)
  // No feeLimit is set on the raw_data model when none was supplied.
  expect(body.raw_data.fee_limit).toBeUndefined()

  // The signed transaction that was broadcast rides along in the result.
  expect(response.transaction).toEqual(body)
})

test('passes the broadcast acknowledgement through alongside the local txID', async () => {
  const { transport } = createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: {
        response: {
          result: true,
          code: 'SUCCESS',
          // "broadcast ok" — node message fields arrive hex-encoded.
          message: '62726f616463617374206f6b',
          txid: `0${'0'.repeat(63)}`,
        },
      },
    },
  })
  const client = createPublicClient({ transport })

  const response = await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
  })

  // All acknowledgement fields ride along (`message` hex-decoded), as does
  // the signed transaction that was broadcast; the id is returned once,
  // under the model's `txID` spelling — the node's echoed all-zero `txid`
  // never leaks.
  expect(response).toEqual({
    txID: bandwidth?.txID,
    result: true,
    code: 'SUCCESS',
    message: 'broadcast ok',
    transaction: {
      txID: bandwidth?.txID,
      raw_data: expect.any(Object),
      raw_data_hex: bandwidth?.rawDataHex,
      signature: [expect.stringMatching(/^[0-9a-f]{130}$/)],
    },
  })
  expect(response).not.toHaveProperty('txid')
})

test('writes fee_limit into raw_data when supplied', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createPublicClient({ transport })

  await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
    feeLimit: 15000000n,
  })

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data: { fee_limit?: number | undefined }
  }
  expect(body.raw_data.fee_limit).toBe(15000000)
})

test('derives timing from the latest block when blockHeader is omitted', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createPublicClient({ transport })

  await buildAndBroadcast(client, { contract: freezeContract(), account })

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data: { timestamp: bigint }
  }
  // getnowblock.fixed pins block_header timestamp = 1700000000000; timing is
  // taken verbatim from the fetched block rather than a wall clock.
  expect(body.raw_data.timestamp).toBe(1700000000000)
})

// ---------------------------------------------------------------------------
// Async signers (MaybePromise signing surface). `signTransaction` is awaited
// before broadcast: an async signer's result is broadcast as the signed
// transaction (never its Promise), a sync signer keeps working unchanged, and
// a rejection surfaces to the caller without a broadcast or an
// unhandledRejection.
// ---------------------------------------------------------------------------

const local = privateKeyToAccount(pk1)
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function customSigner(
  signTransaction: TronCustomSource['signTransaction'],
): TronAccount {
  return toAccount({
    address: local.address,
    publicKey: local.publicKey,
    signMessage: local.signMessage,
    signTypedData: local.signTypedData,
    signTransaction,
  })
}

/** Runs `run`, flushes a macrotask, and returns every unhandledRejection seen. */
async function collectUnhandledRejections(run: () => Promise<void>) {
  const seen: unknown[] = []
  const onUnhandled = (reason: unknown) => seen.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    await run()
    await tick()
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
  return seen
}

async function broadcastWith(account: TronAccount) {
  const mock = writeMock()
  const client = createPublicClient({ transport: mock.transport })
  const response = await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
  })
  return { response, body: mock.bodyOf('broadcasttransaction'), mock }
}

test('an async custom signer broadcasts the signed transaction byte-for-byte', async () => {
  const sync = await broadcastWith(local)
  const async_ = await broadcastWith(
    customSigner(async (tx) => {
      await tick()
      return local.signTransaction(tx)
    }),
  )

  // Identical request body (same signature, same txID) as the sync local account.
  expect(async_.body).toEqual(sync.body)
  expect(parseBroadcast(async_.body).signature).toEqual(
    parseBroadcast(sync.body).signature,
  )
  expect(async_.response.txID).toBe(bandwidth?.txID)
  expect(async_.response).toEqual(sync.response)
  // The broadcast transaction is a plain object, not a leaked Promise.
  expect(async_.response.transaction).not.toBeInstanceOf(Promise)
})

test('a sync custom signer still broadcasts byte-for-byte (compat)', async () => {
  const sync = await broadcastWith(local)
  const custom = await broadcastWith(
    customSigner((tx) => local.signTransaction(tx)),
  )
  expect(custom.body).toEqual(sync.body)
  expect(custom.response).toEqual(sync.response)
  expect(custom.mock.calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
})

test.each([
  ['a plain Error', () => new Error('signer exploded')],
  [
    'a UserRejectedRequestError',
    () => new UserRejectedRequestError({ cause: new Error('wallet: denied') }),
  ],
])('an async signer rejecting with %s propagates it unchanged and never broadcasts', async (_, makeError) => {
  const error = makeError()
  const { transport, calls } = writeMock()
  const client = createPublicClient({ transport })
  const account = customSigner(async () => {
    await tick()
    throw error
  })

  const unhandled = await collectUnhandledRejections(async () => {
    let caught: unknown
    try {
      await buildAndBroadcast(client, { contract: freezeContract(), account })
    } catch (err) {
      caught = err
    }
    expect(caught).toBe(error)
  })

  expect(unhandled).toEqual([])
  expect(calls.map((c) => c.path)).toEqual(['getnowblock'])
})

test('a UserRejectedRequestError keeps its class, code 4001 and cause', async () => {
  const cause = new Error('wallet: denied')
  const { transport, calls } = writeMock()
  const client = createPublicClient({ transport })
  const account = customSigner(async () => {
    await tick()
    throw new UserRejectedRequestError({ cause })
  })

  const error = await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
  }).catch((err: unknown) => err)

  expect(error).toBeInstanceOf(UserRejectedRequestError)
  expect((error as UserRejectedRequestError).code).toBe(4001)
  expect(UserRejectedRequestError.code).toBe(4001)
  expect((error as UserRejectedRequestError).cause).toBe(cause)
  expect(calls.some((c) => c.path === 'broadcasttransaction')).toBe(false)
})

test('a sync custom signer that throws propagates the error and never broadcasts', async () => {
  const error = new Error('sync signer exploded')
  const { transport, calls } = writeMock()
  const client = createPublicClient({ transport })
  const account = customSigner(() => {
    throw error
  })

  const unhandled = await collectUnhandledRejections(async () => {
    await expect(
      buildAndBroadcast(client, { contract: freezeContract(), account }),
    ).rejects.toBe(error)
  })
  expect(unhandled).toEqual([])
  expect(calls.map((c) => c.path)).toEqual(['getnowblock'])
})

// ---------------------------------------------------------------------------
// What the signer hands back (assertSignedTransaction). Wallets rebuild
// transactions before signing (fresh ref_block_* / expiration, adjusted
// fee_limit), so a re-derived txID for the SAME owner is broadcast and
// returned as-is — that is the compatibility contract. A transaction for a
// different owner, or one without a signature, is refused before any
// broadcast; and the broadcast body and the returned txID come from one
// snapshot of the signer's object, never two reads of it.
// ---------------------------------------------------------------------------

// pk = 2 → a second, unrelated fixture key (signs validly, wrong owner).
const pk2 = `0x${'0'.repeat(63)}2` as const
const other = privateKeyToAccount(pk2)

/** Re-derives `raw_data_hex` and `txID` after patching `raw_data` — unsigned. */
function rebuild(
  transaction: SignableTransaction,
  patch: (raw: RawData) => RawData,
): SignableTransaction {
  const raw_data = patch(structuredClone(transaction.raw_data))
  return {
    txID: getTransactionId(raw_data),
    raw_data,
    raw_data_hex: toRawDataHex(raw_data),
  }
}

/** What a wallet does: new TaPoS reference, later expiration, own fee_limit. */
const walletRebuild = (raw: RawData): RawData => ({
  ...raw,
  ref_block_bytes: 'abcd',
  ref_block_hash: '1122334455667788',
  expiration: BigInt(raw.expiration ?? 0) + 120_000n,
  fee_limit: 30_000_000n,
})

/** Same transaction, every contract's owner swapped for pk2's address. */
const reown = (raw: RawData): RawData => ({
  ...raw,
  contract: raw.contract.map((c) => ({
    ...c,
    parameter: {
      ...c.parameter,
      value: {
        ...(c.parameter.value as object),
        owner_address: addressToHex(other.address),
      } as never,
    },
  })),
})

test('a wallet that rebuilds the transaction (same owner) is broadcast and its txID returned', async () => {
  let rebuilt: SignableTransaction | undefined
  let handed: SignableTransaction | undefined
  const { response, body, mock } = await broadcastWith(
    customSigner(async (tx) => {
      await tick()
      handed = tx
      rebuilt = rebuild(tx, walletRebuild)
      return local.signTransaction(rebuilt)
    }),
  )

  expect(rebuilt).toBeDefined()
  // A genuinely different transaction from the one handed to the signer.
  expect(rebuilt?.txID).not.toBe(handed?.txID)
  expect(rebuilt?.txID).not.toBe(bandwidth?.txID)

  const raw = body as { txID: string; raw_data_hex: string }
  const parsed = parseBroadcast(body)
  expect(raw.txID).toBe(rebuilt?.txID)
  expect(raw.raw_data_hex).toBe(rebuilt?.raw_data_hex)
  expect(parsed.txID).toBe(rebuilt?.txID)
  expect(parsed.raw_data.fee_limit).toBe(30_000_000)
  expect(parsed.raw_data.ref_block_bytes).toBe('abcd')
  expect(parsed.signature).toHaveLength(1)

  expect(response.txID).toBe(rebuilt?.txID)
  expect(response.transaction.txID).toBe(rebuilt?.txID)
  expect(mock.calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
})

test('a sync wallet rebuild is accepted too (compat)', async () => {
  let rebuilt: SignableTransaction | undefined
  const { response, body } = await broadcastWith(
    customSigner((tx) => {
      rebuilt = rebuild(tx, walletRebuild)
      return local.signTransaction(rebuilt)
    }),
  )
  expect((body as { txID: string }).txID).toBe(rebuilt?.txID)
  expect(response.txID).toBe(rebuilt?.txID)
})

test('a validly signed transaction for a different owner is refused and never broadcast', async () => {
  const { transport, calls } = writeMock()
  const client = createPublicClient({ transport })
  const account = customSigner(async (tx) => {
    await tick()
    return other.signTransaction(rebuild(tx, reown))
  })

  const error = await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
  }).catch((err: unknown) => err)

  expect(error).toBeInstanceOf(TransactionMismatchError)
  expect((error as TransactionMismatchError).shortMessage).toMatch(
    /different owner_address/,
  )
  expect(calls.map((c) => c.path)).toEqual(['getnowblock'])
})

test('a signer retargeting its own argument cannot move the owner check', async () => {
  const { transport, calls } = writeMock()
  const client = createPublicClient({ transport })
  const account = customSigner(async (tx) => {
    // Rewrite the handed object to another owner's transaction, then return
    // that owner's validly signed copy of it.
    const swapped = rebuild(tx, reown)
    tx.raw_data = structuredClone(swapped.raw_data)
    tx.raw_data_hex = swapped.raw_data_hex
    tx.txID = swapped.txID
    return other.signTransaction(swapped)
  })

  const error = await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
  }).catch((err: unknown) => err)

  expect(error).toBeInstanceOf(TransactionMismatchError)
  expect((error as TransactionMismatchError).shortMessage).toMatch(
    /different owner_address/,
  )
  expect(calls.map((c) => c.path)).toEqual(['getnowblock'])
})

test.each([
  [
    'an empty signature list',
    (tx: SignableTransaction) => ({ ...tx, signature: [] }),
  ],
  [
    'no signature field',
    ({ txID, raw_data, raw_data_hex }: SignableTransaction) => ({
      txID,
      raw_data,
      raw_data_hex,
    }),
  ],
])('a signer returning %s is refused and never broadcast', async (_, unsign) => {
  const { transport, calls } = writeMock()
  const client = createPublicClient({ transport })
  const account = customSigner(async (tx) => {
    await tick()
    return unsign(await local.signTransaction(tx))
  })

  const error = await buildAndBroadcast(client, {
    contract: freezeContract(),
    account,
  }).catch((err: unknown) => err)

  expect(error).toBeInstanceOf(TransactionMismatchError)
  expect((error as TransactionMismatchError).shortMessage).toMatch(
    /without a signature/,
  )
  expect(calls.map((c) => c.path)).toEqual(['getnowblock'])
})

test('a txID getter that changes on every read: broadcast and returned txID are one value', async () => {
  const decoy = 'f'.repeat(64)
  let reads = 0
  const { response, body } = await broadcastWith(
    customSigner(async (tx) => {
      await tick()
      const signed = await local.signTransaction(tx)
      const real = signed.txID
      Object.defineProperty(signed, 'txID', {
        enumerable: true,
        configurable: true,
        get: () => (++reads === 1 ? real : decoy),
      })
      return signed
    }),
  )

  // Read exactly once — by the snapshot — and that value is used everywhere.
  expect(reads).toBe(1)
  expect((body as { txID: string }).txID).toBe(bandwidth?.txID)
  expect(response.txID).toBe(bandwidth?.txID)
  expect(response.transaction.txID).toBe(bandwidth?.txID)
  expect(response.txID).not.toBe(decoy)
})
