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
  UserRejectedRequestError,
} from '../../../src/errors/rpc.js'
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

test('an async custom signer resolves to the transaction it produced', async () => {
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
  expect(result).toBe(produced)
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
