import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../src/accounts/toAccount.js'
import type {
  TronCustomSource,
  TronLocalAccount,
} from '../../../src/accounts/types.js'
import { signMessage } from '../../../src/actions/wallet/signMessage.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import {
  createTransport,
  type Transport,
} from '../../../src/clients/transports/createTransport.js'
import { BaseError } from '../../../src/errors/base.js'
import { InvalidParameterError } from '../../../src/errors/parameter.js'
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
const pk2 = '0x0000000000000000000000000000000000000000000000000000000000000002'

test('signs a message identically to account.signMessage', async () => {
  const client = createWalletClient({
    account: privateKeyToAccount(pk1),
    transport,
  })
  const viaClient = await client.signMessage({ message: 'gm tviem' })
  const viaAccount = await privateKeyToAccount(pk1).signMessage({
    message: 'gm tviem',
  })
  expect(viaClient).toEqual(viaAccount)
})

test('rejects malformed raw bytes when signing with a local account', async () => {
  const client = createWalletClient({
    account: privateKeyToAccount(pk1),
    transport,
  })
  await expect(
    client.signMessage({ message: { raw: ['1'] as never } }),
  ).rejects.toBeInstanceOf(InvalidParameterError)
})

test('a per-call account overrides the hoisted one', async () => {
  const client = createWalletClient({
    account: privateKeyToAccount(pk1),
    transport,
  })
  const viaClient = await client.signMessage({
    message: 'gm',
    account: privateKeyToAccount(pk2),
  })
  expect(viaClient).toEqual(
    await privateKeyToAccount(pk2).signMessage({ message: 'gm' }),
  )
  expect(viaClient).not.toEqual(
    await privateKeyToAccount(pk1).signMessage({ message: 'gm' }),
  )
})

test('throws AccountNotFoundError when no account is available', async () => {
  const client = createWalletClient({ transport })
  await expect(client.signMessage({ message: 'gm' })).rejects.toBeInstanceOf(
    AccountNotFoundError,
  )
})

// ---- MaybePromise signers --------------------------------------------------
// `signMessage` on an account may return its Signature directly (key-backed
// accounts) or as a Promise (wallets, hardware, KMS). The action awaits it, so
// both kinds resolve to the same value, and a rejection reaches the caller.

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

/** A custom account whose `signMessage` is `impl`; the rest are unreachable. */
function customAccountWith(signMessageImpl: TronCustomSource['signMessage']) {
  const inner = privateKeyToAccount(pk1)
  return toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: signMessageImpl,
    signTypedData: inner.signTypedData,
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
  const client = createWalletClient({ transport })
  const signature = { r: 1n, s: 2n, v: 27, yParity: 0 } as never
  const account = customAccountWith(async () => signature)

  const result = await signMessage(client, { message: 'gm', account })
  expect(result).toBe(signature)
})

test('an async signer wrapping a key is byte-identical to the sync local account', async () => {
  const local = privateKeyToAccount(pk1)
  const expected = await local.signMessage({ message: 'gm tviem' })
  const account = asyncAccountOf(local)

  const viaAction = await signMessage(createWalletClient({ transport }), {
    message: 'gm tviem',
    account,
  })
  expect(viaAction).toEqual(expected)
  // Raw-bytes and hex messages go through the same path.
  for (const message of [
    { raw: '0xdeadbeef' as const },
    { raw: new Uint8Array([1, 2, 3]) },
  ])
    expect(
      await signMessage(createWalletClient({ transport }), {
        message,
        account,
      }),
    ).toEqual(await local.signMessage({ message }))
})

test('a sync custom signer keeps working unchanged', async () => {
  const local = privateKeyToAccount(pk1)
  const account = customAccountWith((parameters) =>
    local.signMessage(parameters),
  )
  expect(
    await signMessage(createWalletClient({ transport }), {
      message: 'gm',
      account,
    }),
  ).toEqual(await local.signMessage({ message: 'gm' }))
})

test('a client-hoisted async account works like a per-call one', async () => {
  const local = privateKeyToAccount(pk1)
  const account = asyncAccountOf(local)
  const expected = await local.signMessage({ message: 'gm' })

  const hoisted = createWalletClient({ account, transport })
  expect(await hoisted.signMessage({ message: 'gm' })).toEqual(expected)
  expect(await signMessage(hoisted, { message: 'gm' })).toEqual(expected)

  const perCall = createWalletClient({ transport })
  expect(await perCall.signMessage({ message: 'gm', account })).toEqual(
    expected,
  )
})

test('an async rejection propagates the same error object, never unhandled', async () => {
  const rejected = new UserRejectedRequestError({
    cause: new Error('declined in wallet'),
  })
  const plain = new Error('device disconnected')
  for (const [error, impl] of [
    // async function that throws
    [
      rejected,
      async () => {
        throw rejected
      },
    ],
    // plain function returning an already-rejected Promise
    [plain, () => Promise.reject(plain)],
    // sync throw from a sync custom source
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
        await createWalletClient({ account, transport }).signMessage({
          message: 'gm',
        })
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
  const err = (await signMessage(createWalletClient({ transport }), {
    message: 'gm',
    account,
  }).catch((e) => e)) as UserRejectedRequestError
  expect(err).toBeInstanceOf(UserRejectedRequestError)
  expect(err).toBeInstanceOf(BaseError)
  expect(err.code).toBe(4001)
  expect(err.cause).toBe(cause)
})
