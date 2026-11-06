import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../src/accounts/toAccount.js'
import type {
  TronCustomSource,
  TronLocalAccount,
} from '../../../src/accounts/types.js'
import { signTypedData } from '../../../src/actions/wallet/signTypedData.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import {
  createTransport,
  type Transport,
} from '../../../src/clients/transports/createTransport.js'
import { BaseError } from '../../../src/errors/base.js'
import {
  AccountNotFoundError,
  UserRejectedRequestError,
} from '../../../src/errors/rpc.js'

const transport: Transport = () =>
  createTransport(
    {
      key: 'mock',
      name: 'Mock Transport',
      type: 'mock',
      request: async () => ({}) as any,
    },
    {},
  )

const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'

const typedData = {
  domain: { name: 'tviem-test', version: '1' },
  types: {
    Mail: [
      { name: 'contents', type: 'string' },
      { name: 'value', type: 'uint256' },
    ],
  },
  primaryType: 'Mail' as const,
  message: { contents: 'hello', value: 1n },
}

test('signs typed data identically to account.signTypedData', async () => {
  const client = createWalletClient({
    account: privateKeyToAccount(pk1),
    transport,
  })
  const viaClient = await client.signTypedData(typedData)
  const viaAccount = await privateKeyToAccount(pk1).signTypedData(typedData)
  expect(viaClient).toEqual(viaAccount)
})

test('throws AccountNotFoundError when no account is available', async () => {
  const client = createWalletClient({ transport })
  await expect(client.signTypedData(typedData)).rejects.toBeInstanceOf(
    AccountNotFoundError,
  )
})

// ---- MaybePromise signers --------------------------------------------------
// `signTypedData` on an account may return its Signature directly (key-backed
// accounts) or as a Promise (wallets, hardware, KMS). The action awaits it, so
// both kinds resolve to the same value, and a rejection reaches the caller.

const pk2 = '0x0000000000000000000000000000000000000000000000000000000000000002'

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

/** A custom account whose `signTypedData` is `impl`; the rest are unreachable. */
function customAccountWith(impl: TronCustomSource['signTypedData']) {
  const inner = privateKeyToAccount(pk1)
  return toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: inner.signMessage,
    signTypedData: impl,
    signTransaction: inner.signTransaction,
  })
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

test('an async custom signer resolves to the signature it produced', async () => {
  const signature = { r: 1n, s: 2n, v: 27, yParity: 0 } as never
  const seen: unknown[] = []
  const account = customAccountWith(async (parameters) => {
    seen.push(parameters)
    return signature
  })

  const result = await signTypedData(createWalletClient({ transport }), {
    ...typedData,
    account,
  })
  expect(result).toBe(signature)
  // The `account` key is consumed by the action, not forwarded to the signer.
  expect(seen).toEqual([typedData])
})

test('an async signer wrapping a key is byte-identical to the sync local account', async () => {
  const local = privateKeyToAccount(pk1)
  const expected = await local.signTypedData(typedData)

  expect(
    await signTypedData(createWalletClient({ transport }), {
      ...typedData,
      account: asyncAccountOf(local),
    }),
  ).toEqual(expected)
})

test('a sync custom signer keeps working unchanged', async () => {
  const local = privateKeyToAccount(pk1)
  const account = customAccountWith((parameters) =>
    local.signTypedData(parameters),
  )
  expect(
    await signTypedData(createWalletClient({ transport }), {
      ...typedData,
      account,
    }),
  ).toEqual(await local.signTypedData(typedData))
})

test('a client-hoisted async account works like a per-call one', async () => {
  const local = privateKeyToAccount(pk1)
  const account = asyncAccountOf(local)
  const expected = await local.signTypedData(typedData)

  const hoisted = createWalletClient({ account, transport })
  expect(await hoisted.signTypedData(typedData)).toEqual(expected)
  expect(await signTypedData(hoisted, typedData)).toEqual(expected)

  const perCall = createWalletClient({ transport })
  expect(await perCall.signTypedData({ ...typedData, account })).toEqual(
    expected,
  )
  // A per-call async account still overrides a hoisted one.
  const other = createWalletClient({
    account: privateKeyToAccount(pk2),
    transport,
  })
  expect(await other.signTypedData({ ...typedData, account })).toEqual(expected)
})

test('an async rejection propagates the same error object, never unhandled', async () => {
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
    const account = customAccountWith(impl)
    let caught: unknown
    const unhandled = await unhandledRejectionsDuring(async () => {
      try {
        await createWalletClient({ account, transport }).signTypedData(
          typedData,
        )
      } catch (e) {
        caught = e
      }
    })
    expect(caught).toBe(error)
    expect(unhandled).toEqual([])
  }
})

test('a UserRejectedRequestError keeps its code and cause through the action', async () => {
  const cause = new Error('declined in wallet')
  const account = customAccountWith(async () => {
    throw new UserRejectedRequestError({ cause })
  })
  const err = (await signTypedData(createWalletClient({ transport }), {
    ...typedData,
    account,
  }).catch((e) => e)) as UserRejectedRequestError
  expect(err).toBeInstanceOf(UserRejectedRequestError)
  expect(err).toBeInstanceOf(BaseError)
  expect(err.code).toBe(4001)
  expect(err.cause).toBe(cause)
})
