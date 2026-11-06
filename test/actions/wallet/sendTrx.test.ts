import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../src/accounts/toAccount.js'
import type {
  SignableTransaction,
  TronAccount,
  TronCustomSource,
} from '../../../src/accounts/types.js'
import { sendTrx } from '../../../src/actions/wallet/sendTrx.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import { InvalidAddressError } from '../../../src/errors/address.js'
import {
  AccountNotFoundError,
  TransactionMismatchError,
  UserRejectedRequestError,
} from '../../../src/errors/rpc.js'
import type { Address } from '../../../src/types/address.js'
import { addressToHex } from '../../../src/utils/address/addressToHex.js'
import { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import {
  type RawData,
  toRawDataHex,
} from '../../../src/utils/transaction/serializeRawData.js'
import { rpc } from '../../fixtures/rpc/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'
import { parseBroadcast } from '../../mock/parseBroadcast.js'

// pk = 1 (permitted trivial key) → address TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC.
const pk1 = `0x${'0'.repeat(63)}1` as const
const account = privateKeyToAccount(pk1)
const to = 'TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY' as Address

// Canonical transfer gold vectors (tx/transfer-contract[0] + sig/transaction[0]).
const TX_ID = '407ec75dad4545890e5788ef78555ecab9dc72d56df29da4ebbd508022bdbaba'
const RAW_DATA_HEX =
  '0a0212342208010203040506070840e0a499ffbc315a67080112630a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412320a15417e5f4552091a69125d5dfcb7b8c2659029395bdf121541928c9af0651632157ef27a2cf17ca72c575a4d2118c0843d7080d095ffbc31'
const SIG =
  '4d6f1e54ea593e5118c2d1b3701a4cab4d5235a418e9e46dba8c5f033bc4af0f6c04a08241de23936dffdedc869eac45533f9479a6bf372a38382b168b65ae001c'

function writeMock() {
  return createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
}

test('builds, signs and broadcasts the canonical transfer byte-for-byte', async () => {
  const { transport, calls, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })

  const { txID } = await client.sendTrx({ to, amount: 1000000n })

  // The returned id is the locally computed txID.
  expect(txID).toBe(TX_ID)

  // It fetched the latest block first (TaPoS), then broadcast.
  expect(calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
  expect(calls[0]?.node).toBe('full')
  expect(calls[0]?.method).toBe('GET')
  expect(calls[1]?.node).toBe('full')
  expect(calls[1]?.method).toBe('POST')

  // The broadcast body is the whole signed transaction, byte-for-byte gold.
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    txID: string
    raw_data: unknown
    raw_data_hex: string
    signature: string[]
  }
  expect(body.txID).toBe(TX_ID)
  expect(body.raw_data_hex).toBe(RAW_DATA_HEX)
  expect(body.signature).toEqual([SIG])
  expect(body.raw_data).toBeDefined()
})

test('returns the local txID even when the node echoes a different one', async () => {
  // broadcasttransaction.ok replies with an all-zero txid on purpose.
  const { transport } = writeMock()
  const client = createWalletClient({ account, transport })
  const { txID } = await client.sendTrx({ to, amount: 1000000n })
  expect(txID).toBe(TX_ID)
  expect(txID).not.toBe(`0${'0'.repeat(63)}`)
})

test('accepts a per-call account overriding the (absent) client account', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ transport })
  const { txID } = await client.sendTrx({
    account,
    to,
    amount: 1000000n,
  })
  expect(txID).toBe(TX_ID)
  expect(
    (parseBroadcast(bodyOf('broadcasttransaction')) as { raw_data_hex: string })
      .raw_data_hex,
  ).toBe(RAW_DATA_HEX)
})

test('writes a memo into raw_data.data', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })
  await client.sendTrx({ to, amount: 1000000n, memo: '0x6f6d6e69' })
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data: { data?: string }
  }
  expect(body.raw_data.data).toBe('6f6d6e69')
})

test('accepts a memo as raw bytes (Uint8Array)', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })
  await client.sendTrx({
    to,
    amount: 1000000n,
    memo: new Uint8Array([0x6f, 0x6d, 0x6e, 0x69]),
  })
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data: { data?: string }
  }
  expect(body.raw_data.data).toBe('6f6d6e69')
})

// Zero memo bytes serialize to no field at all (proto3 default) — the model
// would claim a memo the signed bytes do not carry. Refuse before building.
test('rejects an empty memo before any request', async () => {
  const { transport, calls } = writeMock()
  const client = createWalletClient({ account, transport })
  await expect(
    client.sendTrx({ to, amount: 1000000n, memo: '0x' }),
  ).rejects.toThrow(/Empty memo/)
  expect(calls).toHaveLength(0)
})

// Malformed memos must fail loud, typed and BEFORE any node call — the
// serializer would otherwise left-pad an odd nibble (silently rewriting the
// memo's bytes) or explode much later with a cryptic byte-sequence error.
test.each([
  ['odd-nibble hex', '0x6f6'],
  ['non-hex text', 'hello'],
  ['empty bytes', new Uint8Array(0)],
  ['null', null],
])('rejects a malformed memo (%s) before any request', async (_, memo) => {
  const { transport, calls } = writeMock()
  const client = createWalletClient({ account, transport })
  await expect(
    client.sendTrx({ to, amount: 1000000n, memo: memo as never }),
  ).rejects.toThrow(/memo/)
  expect(calls).toHaveLength(0)
})

// expiration derives from the pinned reference block's own timestamp
// (1700000000000), so a custom lifetime lands deterministically.
test('expirationMs sets the lifetime from the chain-derived timestamp', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })
  await client.sendTrx({ to, amount: 1000000n, expirationMs: 3_600_000 })
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data: { timestamp: number; expiration: number }
  }
  expect(body.raw_data.timestamp).toBe(1700000000000)
  expect(body.raw_data.expiration).toBe(1700000000000 + 3_600_000)
})

// A complete blockHeader is verbatim by contract — its absolute expiration
// wins and expirationMs is ignored.
test('a complete blockHeader takes precedence over expirationMs', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })
  await client.sendTrx({
    to,
    amount: 1000000n,
    expirationMs: 3_600_000,
    blockHeader: {
      ref_block_bytes: '1234',
      ref_block_hash: '0102030405060708',
      timestamp: 1700000000000n,
      // Distinctive on purpose: neither timestamp + expirationMs nor
      // timestamp + the 60s default can produce it by coincidence.
      expiration: 1700000123456n,
    },
  })
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data: { expiration: number }
  }
  expect(body.raw_data.expiration).toBe(1700000123456)
})

test('throws AccountNotFoundError when no account is available (bare action)', async () => {
  const { transport } = writeMock()
  const client = createPublicClient({ transport })
  await expect(
    sendTrx(client, { to, amount: 1000000n }),
  ).rejects.toBeInstanceOf(AccountNotFoundError)
})

test('refuses a private-key string as `account` without echoing it or sending a request', async () => {
  // A string `account` is an address, so a key string throws before any
  // request, and no slice of the value appears in the error.
  const key = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'
  const keyForms = [`0x${key}`, key]
  for (const keyForm of keyForms) {
    const { transport, calls } = writeMock()
    const client = createWalletClient({ transport })
    const error = await sendTrx(client, {
      account: keyForm as unknown as Address,
      to,
      amount: 1000000n,
    }).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(InvalidAddressError)
    const { message, shortMessage } = error as InvalidAddressError
    expect(shortMessage).toBe('Address is invalid.')
    const text = `${message}\n${String(error)}\n${JSON.stringify(error)}`
    for (let i = 0; i + 8 <= key.length; i++)
      expect(text).not.toContain(key.slice(i, i + 8))
    expect(calls).toHaveLength(0)
  }
})

// ---------------------------------------------------------------------------
// Async signers (MaybePromise signing surface). The signed transaction an
// async custom signer resolves to is what gets broadcast — byte-identical to
// the sync local account — a sync custom signer keeps working, and a
// rejection surfaces to the caller's await without a broadcast or an
// unhandledRejection.
// ---------------------------------------------------------------------------

const local = privateKeyToAccount(pk1)
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function customSigner(signTransaction: TronCustomSource['signTransaction']) {
  return toAccount({
    address: local.address,
    publicKey: local.publicKey,
    signMessage: local.signMessage,
    signTypedData: local.signTypedData,
    signTransaction,
  })
}

const asyncSigner = () =>
  customSigner(async (tx) => {
    await tick()
    return local.signTransaction(tx)
  })
const syncSigner = () => customSigner((tx) => local.signTransaction(tx))

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

const rejections = [
  ['a plain Error', () => new Error('signer exploded')],
  [
    'a UserRejectedRequestError',
    () => new UserRejectedRequestError({ cause: new Error('wallet: denied') }),
  ],
] as const

async function runsendTrx(account: TronAccount) {
  const mock = writeMock()
  const client = createWalletClient({ account, transport: mock.transport })
  const result = await client.sendTrx({ to, amount: 1000000n })
  return {
    result,
    body: mock.bodyOf('broadcasttransaction'),
    calls: mock.calls,
  }
}

test('sendTrx: an async custom signer broadcasts the same bytes as the local account', async () => {
  const sync = await runsendTrx(local)
  const async_ = await runsendTrx(asyncSigner())

  expect(async_.body).toEqual(sync.body)
  expect(parseBroadcast(async_.body).signature).toEqual(
    parseBroadcast(sync.body).signature,
  )
  expect(async_.result.txID).toBe(sync.result.txID)
  expect(async_.result.txID).toBe(TX_ID)
  expect(parseBroadcast(async_.body).signature).toEqual([SIG])
  expect(async_.calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
})

test('sendTrx: a sync custom signer still works byte-for-byte (compat)', async () => {
  const sync = await runsendTrx(local)
  const custom = await runsendTrx(syncSigner())
  expect(custom.body).toEqual(sync.body)
  expect(custom.result).toEqual(sync.result)
})

test.each(
  rejections,
)('sendTrx: an async signer rejecting with %s propagates it unchanged and never broadcasts', async (_, makeError) => {
  const error = makeError()
  const account = customSigner(async () => {
    await tick()
    throw error
  })
  const mock = writeMock()
  const client = createWalletClient({ account, transport: mock.transport })

  const unhandled = await collectUnhandledRejections(async () => {
    let caught: unknown
    try {
      await client.sendTrx({ to, amount: 1000000n })
    } catch (err) {
      caught = err
    }
    expect(caught).toBe(error)
    if (error instanceof UserRejectedRequestError) {
      expect(caught).toBeInstanceOf(UserRejectedRequestError)
      expect((caught as UserRejectedRequestError).code).toBe(4001)
    }
  })

  expect(unhandled).toEqual([])
  expect(mock.calls.some((c) => c.path === 'broadcasttransaction')).toBe(false)
})

// ---------------------------------------------------------------------------
// What the signer hands back (assertSignedTransaction). A wallet that
// rebuilds the transaction before signing (new TaPoS reference, expiration,
// fee_limit) for the same owner is broadcast as rebuilt and its txID
// returned — the compatibility contract. A validly signed transaction for a
// different owner, or one without a signature, is refused before broadcast.
// ---------------------------------------------------------------------------

// pk = 2 → a second, unrelated fixture key (signs validly, wrong owner).
const other = privateKeyToAccount(`0x${'0'.repeat(63)}2`)

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

const walletRebuild = (raw: RawData): RawData => ({
  ...raw,
  ref_block_bytes: 'abcd',
  ref_block_hash: '1122334455667788',
  expiration: BigInt(raw.expiration ?? 0) + 120_000n,
  fee_limit: 30_000_000n,
})

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

async function attemptsendTrx(account: TronAccount) {
  const mock = writeMock()
  const client = createWalletClient({ account, transport: mock.transport })
  const outcome = await client.sendTrx({ to, amount: 1000000n }).then(
    (result) => ({ result, error: undefined }),
    (error: unknown) => ({ result: undefined, error }),
  )
  return { ...outcome, calls: mock.calls, bodyOf: mock.bodyOf }
}

test('sendTrx: a wallet that rebuilds the transaction (same owner) is broadcast and its txID returned', async () => {
  let rebuilt: SignableTransaction | undefined
  const outcome = await attemptsendTrx(
    customSigner(async (tx) => {
      await tick()
      rebuilt = rebuild(tx, walletRebuild)
      return local.signTransaction(rebuilt)
    }),
  )

  expect(outcome.error).toBeUndefined()
  expect(rebuilt?.txID).not.toBe(TX_ID)
  const body = outcome.bodyOf('broadcasttransaction') as {
    txID: string
    raw_data_hex: string
  }
  expect(body.txID).toBe(rebuilt?.txID)
  expect(body.raw_data_hex).toBe(rebuilt?.raw_data_hex)
  expect(parseBroadcast(body).raw_data.fee_limit).toBe(30_000_000)
  expect(outcome.result?.txID).toBe(rebuilt?.txID)
})

test('sendTrx: a validly signed transaction for a different owner is refused and never broadcast', async () => {
  const outcome = await attemptsendTrx(
    customSigner(async (tx) => {
      await tick()
      return other.signTransaction(rebuild(tx, reown))
    }),
  )
  expect(outcome.error).toBeInstanceOf(TransactionMismatchError)
  expect((outcome.error as TransactionMismatchError).shortMessage).toMatch(
    /different owner_address/,
  )
  expect(outcome.calls.map((c) => c.path)).toEqual(['getnowblock'])
})

test('sendTrx: a signer returning an empty signature list is refused and never broadcast', async () => {
  const outcome = await attemptsendTrx(
    customSigner(async (tx) => {
      await tick()
      return { ...(await local.signTransaction(tx)), signature: [] }
    }),
  )
  expect(outcome.error).toBeInstanceOf(TransactionMismatchError)
  expect((outcome.error as TransactionMismatchError).shortMessage).toMatch(
    /without a signature/,
  )
  expect(outcome.calls.map((c) => c.path)).toEqual(['getnowblock'])
})
