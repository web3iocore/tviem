import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../src/accounts/toAccount.js'
import type {
  SignableTransaction,
  TronCustomAccount,
  TronCustomSource,
  TronLocalAccount,
} from '../../../src/accounts/types.js'
import { signTransaction } from '../../../src/actions/wallet/signTransaction.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import { BaseError } from '../../../src/errors/base.js'
import {
  AccountNotFoundError,
  TransactionTamperedError,
  UserRejectedRequestError,
} from '../../../src/errors/rpc.js'
import { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import {
  type RawData,
  toRawDataHex,
} from '../../../src/utils/transaction/serializeRawData.js'
import { rpc } from '../../fixtures/rpc/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'

const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'
const pk2 = '0x0000000000000000000000000000000000000000000000000000000000000002'
const to = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC' as const

/** Builds an unsigned transfer via the mocked node (TaPoS from the fixture). */
async function buildUnsigned(account: `0x${string}`) {
  const { transport } = createMockTransport({
    responses: { getnowblock: { response: rpc('getnowblock.fixed') } },
  })
  const client = createWalletClient({ account, transport })
  return { client, unsigned: await client.buildSendTrx({ to, amount: 1n }) }
}

test('signs a built transaction identically to account.signTransaction', async () => {
  const { client, unsigned } = await buildUnsigned(pk1)
  const viaClient = await client.signTransaction({ transaction: unsigned })
  const viaAccount = await privateKeyToAccount(pk1).signTransaction(unsigned)
  expect(viaClient).toEqual(viaAccount)
  expect(viaClient.signature).toHaveLength(1)
  // The input is not mutated.
  expect(unsigned.signature).toBeUndefined()
})

test('a per-call account overrides the hoisted one', async () => {
  // pk2's address is not the owner, so its guard must reject — proving the
  // per-call account (not the hoisted pk1) is the one doing the signing.
  const { client, unsigned } = await buildUnsigned(pk1)
  await expect(
    client.signTransaction({ transaction: unsigned, account: pk2 }),
  ).rejects.toThrow(/owner_address does not match/)
})

test('throws AccountNotFoundError when no account is available', async () => {
  const { transport } = createMockTransport({ responses: {} })
  const client = createWalletClient({ transport })
  await expect(
    client.signTransaction({
      transaction: {
        txID: 'ab',
        raw_data: { contract: [] },
        raw_data_hex: 'ab',
      },
    }),
  ).rejects.toBeInstanceOf(AccountNotFoundError)
})

// ---- MaybePromise signers --------------------------------------------------
// `signTransaction` on an account may return the signed transaction directly
// (key-backed accounts) or as a Promise (wallets, hardware, KMS). The action
// awaits it, so both kinds resolve to the same value, and a rejection reaches
// the caller — without anything being sent to the node.

/** A custom account that defers every signing call to `inner` across a macrotask. */
function asyncAccountOf(inner: TronLocalAccount) {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  return toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: async (parameters) => {
      await tick()
      return inner.signMessage(parameters)
    },
    signTypedData: async (parameters) => {
      await tick()
      return inner.signTypedData(parameters)
    },
    signTransaction: async (transaction) => {
      await tick()
      return inner.signTransaction(transaction)
    },
  })
}

/** A custom account whose `signTransaction` is `impl`; the rest are unreachable. */
function customAccountWith(impl: TronCustomSource['signTransaction']) {
  const inner = privateKeyToAccount(pk1)
  return toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: inner.signMessage,
    signTypedData: inner.signTypedData,
    signTransaction: impl,
  })
}

/** A wallet client over a recording transport that answers nothing. */
function silentClient(account?: TronCustomAccount) {
  const { transport, calls } = createMockTransport({ responses: {} })
  return { client: createWalletClient({ account, transport }), calls }
}

/** Runs `fn`, flushes a macrotask, and returns any unhandled rejections seen. */
async function unhandledRejectionsDuring(fn: () => Promise<unknown>) {
  const seen: unknown[] = []
  const listener = (reason: unknown) => seen.push(reason)
  process.on('unhandledRejection', listener)
  try {
    await fn()
    await new Promise((resolve) => setTimeout(resolve, 0))
  } finally {
    process.off('unhandledRejection', listener)
  }
  return seen
}

test('an async custom signer resolves to a checked copy of the transaction it produced', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const produced: SignableTransaction = {
    ...unsigned,
    signature: ['cd'.repeat(65)],
  }
  const seen: unknown[] = []
  const account = customAccountWith(async (transaction) => {
    seen.push(transaction)
    return produced
  })
  const { client, calls } = silentClient()

  const result = await signTransaction(client, {
    transaction: unsigned,
    account,
  })
  // A snapshot of what the signer returned: equal, but never its own object.
  expect(result).toStrictEqual(produced)
  expect(result).not.toBe(produced)
  expect(seen).toEqual([unsigned])
  expect(calls).toHaveLength(0)
})

test('an async signer wrapping a key is byte-identical to the sync local account', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const local = privateKeyToAccount(pk1)
  const expected = await local.signTransaction(unsigned)
  const { client, calls } = silentClient()

  const signed = await signTransaction(client, {
    transaction: unsigned,
    account: asyncAccountOf(local),
  })
  expect(signed).toEqual(expected)
  expect(signed.txID).toBe(expected.txID)
  expect(signed.raw_data_hex).toBe(expected.raw_data_hex)
  expect(signed.signature).toEqual(expected.signature)
  expect(unsigned.signature).toBeUndefined()
  expect(calls).toHaveLength(0)
})

test('a sync custom signer keeps working unchanged', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const local = privateKeyToAccount(pk1)
  const account = customAccountWith((transaction) =>
    local.signTransaction(transaction),
  )
  const { client } = silentClient()
  expect(
    await signTransaction(client, { transaction: unsigned, account }),
  ).toEqual(await local.signTransaction(unsigned))
})

test('a client-hoisted async account works like a per-call one', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const local = privateKeyToAccount(pk1)
  const account = asyncAccountOf(local)
  const expected = await local.signTransaction(unsigned)

  const hoisted = silentClient(account)
  expect(
    await hoisted.client.signTransaction({ transaction: unsigned }),
  ).toEqual(expected)
  expect(
    await signTransaction(hoisted.client, { transaction: unsigned }),
  ).toEqual(expected)

  const perCall = silentClient()
  expect(
    await perCall.client.signTransaction({ transaction: unsigned, account }),
  ).toEqual(expected)
  expect(hoisted.calls).toHaveLength(0)
  expect(perCall.calls).toHaveLength(0)
})

test("an async signer's own guard rejection surfaces through the action", async () => {
  // pk2 wrapped async: its owner guard now fires inside a Promise.
  const { unsigned } = await buildUnsigned(pk1)
  const { client } = silentClient()
  await expect(
    signTransaction(client, {
      transaction: unsigned,
      account: asyncAccountOf(privateKeyToAccount(pk2)),
    }),
  ).rejects.toThrow(/owner_address does not match/)
})

test('an async rejection propagates the same error object, never unhandled, nothing sent', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const rejected = new UserRejectedRequestError({
    cause: new Error('declined in wallet'),
  })
  const plain = new Error('device disconnected')
  for (const [error, impl] of [
    [
      rejected,
      async () => {
        throw rejected
      },
    ],
    [plain, () => Promise.reject(plain)],
    [
      plain,
      () => {
        throw plain
      },
    ],
  ] as const) {
    const { client, calls } = silentClient(customAccountWith(impl))
    let caught: unknown
    const unhandled = await unhandledRejectionsDuring(async () => {
      try {
        await client.signTransaction({ transaction: unsigned })
      } catch (e) {
        caught = e
      }
    })
    expect(caught).toBe(error)
    expect(unhandled).toEqual([])
    expect(calls).toHaveLength(0)
  }
})

test('a UserRejectedRequestError keeps its code and cause through the action', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const cause = new Error('declined in wallet')
  const account = customAccountWith(async () => {
    throw new UserRejectedRequestError({ cause })
  })
  const { client } = silentClient()
  const err = (await signTransaction(client, {
    transaction: unsigned,
    account,
  }).catch((e) => e)) as UserRejectedRequestError
  expect(err).toBeInstanceOf(UserRejectedRequestError)
  expect(err).toBeInstanceOf(BaseError)
  expect(err.code).toBe(4001)
  expect(err.cause).toBe(cause)
})

// ---- What the signer hands back ---------------------------------------------
// The action keeps only a checked snapshot of the signer's result. A wallet may
// rebuild the transaction before signing (fresh TaPoS, a new expiration, an
// adjusted fee_limit) — new bytes, new txID — and that must keep working. What
// it may not do is return a transaction for another owner, or an unsigned one.

/**
 * `transaction` re-serialized with `patch` applied to its raw_data — a
 * self-consistent triple, as a wallet that rebuilds before signing produces.
 */
function rebuilt(
  transaction: SignableTransaction,
  patch: Partial<RawData>,
): SignableTransaction {
  const raw_data_hex = toRawDataHex({ ...transaction.raw_data, ...patch })
  const raw_data = decodeRawData(raw_data_hex)
  return { txID: getTransactionId(raw_data), raw_data, raw_data_hex }
}

const walletPatch = {
  ref_block_bytes: 'beef',
  ref_block_hash: 'a1b2c3d4e5f60718',
  expiration: 1_800_000_060_000,
  fee_limit: 30_000_000,
} as const

test('a wallet that rebuilds the transaction before signing is accepted with its values', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const local = privateKeyToAccount(pk1)
  const expected = await local.signTransaction(rebuilt(unsigned, walletPatch))
  const account = customAccountWith(async (transaction) =>
    local.signTransaction(rebuilt(transaction, walletPatch)),
  )
  const { client, calls } = silentClient()

  const signed = await signTransaction(client, {
    transaction: unsigned,
    account,
  })
  // The wallet's bytes win: a new txID, the refreshed fields, its signature.
  expect(signed).toStrictEqual(expected)
  expect(signed.txID).not.toBe(unsigned.txID)
  expect(signed.raw_data_hex).not.toBe(unsigned.raw_data_hex)
  expect(signed.raw_data.ref_block_bytes).toBe('beef')
  expect(signed.raw_data.ref_block_hash).toBe('a1b2c3d4e5f60718')
  expect(String(signed.raw_data.expiration)).toBe('1800000060000')
  expect(String(signed.raw_data.fee_limit)).toBe('30000000')
  expect(signed.signature).toHaveLength(1)
  expect(calls).toHaveLength(0)
})

test('a signer that spells owner_address in Base58 is the same owner', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const local = privateKeyToAccount(pk1)
  const account = customAccountWith(async (transaction) => {
    const signed = await local.signTransaction(transaction)
    const contract = signed.raw_data.contract[0]!
    const value = contract.parameter.value as { owner_address: string }
    // Same bytes, owner re-spelled: raw_data_hex / txID still agree.
    return {
      ...signed,
      raw_data: {
        ...signed.raw_data,
        contract: [
          {
            ...contract,
            parameter: {
              ...contract.parameter,
              value: { ...value, owner_address: local.address },
            },
          },
        ],
      },
    }
  })
  const { client } = silentClient()
  const signed = await signTransaction(client, {
    transaction: unsigned,
    account,
  })
  expect(signed.txID).toBe(unsigned.txID)
  expect(signed.signature).toHaveLength(1)
})

test('a signer returning a validly signed transaction for another owner is rejected', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  // pk2's own transfer, signed by pk2: consistent and genuinely signed, but
  // not the account the caller asked to sign for.
  const { unsigned: other } = await buildUnsigned(pk2)
  const swapped = await privateKeyToAccount(pk2).signTransaction(other)
  const account = customAccountWith(async () => swapped)
  const { client, calls } = silentClient(account)

  const err = (await client
    .signTransaction({ transaction: unsigned })
    .catch((e) => e)) as TransactionTamperedError
  expect(err).toBeInstanceOf(TransactionTamperedError)
  expect(err.shortMessage).toMatch(/different owner_address/)
  expect(calls).toHaveLength(0)
})

test('a signer returning an unsigned transaction is rejected', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const { client } = silentClient()
  for (const produced of [
    { ...unsigned },
    { ...unsigned, signature: [] },
    rebuilt(unsigned, walletPatch),
  ]) {
    const err = (await signTransaction(client, {
      transaction: unsigned,
      account: customAccountWith(async () => produced),
    }).catch((e) => e)) as TransactionTamperedError
    expect(err).toBeInstanceOf(TransactionTamperedError)
    expect(err.shortMessage).toMatch(/without a signature/)
  }
})

test('a signer returning inconsistent bytes is rejected', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const signed = await privateKeyToAccount(pk1).signTransaction(unsigned)
  const { client } = silentClient()
  const err = (await signTransaction(client, {
    transaction: unsigned,
    account: customAccountWith(async () => ({
      ...signed,
      txID: 'ab'.repeat(32),
    })),
  }).catch((e) => e)) as TransactionTamperedError
  expect(err).toBeInstanceOf(TransactionTamperedError)
  expect(err.shortMessage).toMatch(/do not agree/)
})

test('the signer receives a copy: neither side mutating its object reaches the other', async () => {
  const { unsigned } = await buildUnsigned(pk1)
  const before = structuredClone(unsigned)
  const local = privateKeyToAccount(pk1)
  const pk2Hex = (
    (await buildUnsigned(pk2)).unsigned.raw_data.contract[0]!.parameter
      .value as { owner_address: string }
  ).owner_address
  let received: SignableTransaction | undefined
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  // An in-place signer: it signs, then attaches the signature to its argument
  // and returns that same object — common in wallet adapters.
  const account = customAccountWith(async (transaction) => {
    received = transaction
    await gate
    const signed = await local.signTransaction(transaction)
    transaction.signature = signed.signature!
    return transaction
  })
  const { client } = silentClient()

  const pending = signTransaction(client, { transaction: unsigned, account })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(received).toStrictEqual(before)
  expect(received).not.toBe(unsigned)
  // The caller retargets its own object while the wallet is still signing:
  // the check runs against what the signer was handed, not this.
  ;(
    unsigned.raw_data.contract[0]!.parameter.value as { owner_address: string }
  ).owner_address = pk2Hex
  release()
  const signed = await pending

  expect(signed).toStrictEqual(
    await local.signTransaction(structuredClone(before)),
  )
  expect(signed).not.toBe(received)
  // The signer's in-place signature never reached the caller's object.
  expect(unsigned.signature).toBeUndefined()

  // Mutating either object afterwards leaves the returned snapshot intact.
  const snapshot = structuredClone(signed)
  received!.signature!.push('ff')
  ;(unsigned.raw_data as { expiration?: number }).expiration = 1
  expect(signed).toStrictEqual(snapshot)
})

test('a signer retargeting its own argument cannot move the owner check', async () => {
  // The signer is handed a copy; rewriting that copy's owner_address to pk2
  // and returning pk2's signed transfer must still be caught.
  const { unsigned } = await buildUnsigned(pk1)
  const { unsigned: other } = await buildUnsigned(pk2)
  const swapped = await privateKeyToAccount(pk2).signTransaction(other)
  const account = customAccountWith(async (transaction) => {
    transaction.raw_data = structuredClone(other.raw_data)
    transaction.raw_data_hex = other.raw_data_hex
    transaction.txID = other.txID
    return swapped
  })
  const { client } = silentClient()
  const err = await signTransaction(client, {
    transaction: unsigned,
    account,
  }).catch((e) => e)
  expect(err).toBeInstanceOf(TransactionTamperedError)
  // The caller's object is untouched either way.
  expect(unsigned.txID).not.toBe(other.txID)
})
