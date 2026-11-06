import { expect, test } from 'vitest'
import { mnemonicToAccount } from '../../../src/accounts/mnemonicToAccount.js'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../src/accounts/toAccount.js'
import type {
  AccountMultiSignFn,
  SignableTransaction,
  TronLocalAccount,
} from '../../../src/accounts/types.js'
import { multiSignTransaction } from '../../../src/accounts/utils/multiSignTransaction.js'
import { signTransaction } from '../../../src/accounts/utils/signTransaction.js'
import { multiSign } from '../../../src/actions/wallet/multiSign.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import { InvalidAddressError } from '../../../src/errors/address.js'
import { BaseError } from '../../../src/errors/base.js'
import {
  AccountNotFoundError,
  TransactionMismatchError,
  UserRejectedRequestError,
} from '../../../src/errors/rpc.js'
import { addressToHex } from '../../../src/utils/address/addressToHex.js'
import { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import { toRawDataHex } from '../../../src/utils/transaction/serializeRawData.js'
import { loadTxFixtureFile } from '../../fixtures/tx/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'

// Two distinct permitted trivial keys: pk1 derives the fixture's
// owner_address (41 7e5f...bdf); pk2 is a non-owner co-signer.
const pk1 = `0x${'0'.repeat(63)}1` as const
const pk2 = `0x${'0'.repeat(63)}2` as const

// Case 0: the canonical unbound transfer. Case 1: the SAME transfer with
// Permission_id=2 baked in — the gold vector a fresh bind must reproduce.
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

// The signature multiSign must reproduce when it binds id 2 locally:
// signing the bound bytes directly (deterministic — same bytes, same sig).
const local = signTransaction({ transaction: boundTriple(), privateKey: pk1 })

/** A client whose transport records requests — multiSign must issue none. */
function silentClient() {
  const { transport, calls } = createMockTransport({ responses: {} })
  return { client: createPublicClient({ transport }), calls }
}

test('fresh bind is fully local and recomputes txID from the bound model', async () => {
  const { client, calls } = silentClient()

  const signed = await multiSign(client, {
    transaction: unboundTriple(),
    privateKey: pk1,
    permissionId: 2,
  })

  // The id was written into the contract and the triple recomputed from the
  // bound model — byte-identical to the Permission_id=2 gold vector.
  expect(signed.raw_data.contract[0]?.Permission_id).toBe(2)
  expect(signed.raw_data.contract[0]?.type).toBe('TransferContract')
  expect(signed.raw_data_hex).toBe(transferBound!.rawDataHex)
  expect(signed.raw_data_hex).toBe(toRawDataHex(signed.raw_data))
  expect(signed.txID).toBe(transferBound!.txID)
  expect(signed.txID).toBe(getTransactionId(signed.raw_data))
  // Identical bytes → identical deterministic signature.
  expect(signed.signature).toHaveLength(1)
  expect(signed.signature?.[0]).toBe(local.signature?.[0])
  expect(calls).toHaveLength(0)
})

test('later co-signer appends offline, inheriting the baked id', async () => {
  const { client, calls } = silentClient()

  // No permissionId given: it defaults to contract[0].Permission_id (2). pk2
  // is NOT the owner — membership is the node's business, signing is local.
  const second = await multiSign(client, {
    transaction: local,
    privateKey: pk2,
  })

  expect(second.signature).toHaveLength(2)
  expect(second.signature?.[0]).toBe(local.signature?.[0]) // pk1's sig preserved
  expect(second.txID).toBe(local.txID)
  expect(second.raw_data_hex).toBe(local.raw_data_hex)
  expect(calls).toHaveLength(0)
})

test('an explicit id equal to the baked one is idempotent', async () => {
  const { client, calls } = silentClient()

  const second = await multiSign(client, {
    transaction: local,
    privateKey: pk2,
    permissionId: 2,
  })

  expect(second.signature).toHaveLength(2)
  expect(second.txID).toBe(local.txID)
  expect(second.raw_data_hex).toBe(local.raw_data_hex)
  expect(calls).toHaveLength(0)
})

test('permission id 0 (owner permission) signs the unbound bytes locally', async () => {
  const { client, calls } = silentClient()

  const signed = await multiSign(client, {
    transaction: unboundTriple(),
    privateKey: pk1,
    permissionId: 0,
  })

  expect(signed.signature).toHaveLength(1)
  // id 0 encodes to nothing — bytes and id stay the unbound fixture values.
  expect(signed.raw_data_hex).toBe(transfer!.rawDataHex)
  expect(signed.txID).toBe(transfer!.txID)
  expect(calls).toHaveLength(0)
})

test('omitted id on an unbound transaction means the owner permission', async () => {
  const { client, calls } = silentClient()

  const signed = await multiSign(client, {
    transaction: unboundTriple(),
    privateKey: pk1,
  })

  expect(signed.signature).toHaveLength(1)
  expect(signed.raw_data_hex).toBe(transfer!.rawDataHex)
  expect(signed.txID).toBe(transfer!.txID)
  expect(calls).toHaveLength(0)
})

test('rejects an invalid permission id', async () => {
  const { client } = silentClient()
  await expect(
    multiSign(client, {
      transaction: unboundTriple(),
      privateKey: pk1,
      permissionId: -1,
    }),
  ).rejects.toThrow(/^Invalid multi-sig permission id:/)
  await expect(
    multiSign(client, {
      transaction: unboundTriple(),
      privateKey: pk1,
      permissionId: 1.5,
    }),
  ).rejects.toThrow(/^Invalid multi-sig permission id:/)
  await expect(
    multiSign(client, {
      transaction: unboundTriple(),
      privateKey: pk1,
      permissionId: -1,
    }),
  ).rejects.toBeInstanceOf(BaseError)
})

test('throws on a permission id that mismatches the baked one', async () => {
  const { client } = silentClient()
  // Bound to 2 — co-signing under 3 (or un-binding via 0) must refuse, not
  // silently re-bake (which would orphan pk1's signature).
  await expect(
    multiSign(client, { transaction: local, privateKey: pk2, permissionId: 3 }),
  ).rejects.toThrow(/^Permission id mismatch:/)
  await expect(
    multiSign(client, { transaction: local, privateKey: pk2, permissionId: 0 }),
  ).rejects.toThrow(/^Permission id mismatch:/)
})

test('throws when binding a fresh id over existing signatures', async () => {
  const { client } = silentClient()
  // Unbound bytes that already carry a signature: binding 2 now would change
  // the txID and invalidate it.
  const preSigned = { ...unboundTriple(), signature: ['ab'.repeat(65)] }
  await expect(
    multiSign(client, {
      transaction: preSigned,
      privateKey: pk2,
      permissionId: 2,
    }),
  ).rejects.toThrow(/^Cannot bind permission id/)
  // id 0 encodes to nothing — the bytes are unchanged, so an owner-permission
  // co-sign of already-signed bytes stays allowed.
  const signed = await multiSign(client, {
    transaction: preSigned,
    privateKey: pk2,
    permissionId: 0,
  })
  expect(signed.signature).toHaveLength(2)
})

test('refuses a handoff whose txID lies about the bytes', async () => {
  const { client } = silentClient()
  // A consistent (raw_data, raw_data_hex) pair whose txID belongs to OTHER
  // bytes: the collected signatures were made over a different digest. The
  // lying id is the co-signer's only local tamper evidence — refuse, never
  // silently recompute and co-sign.
  await expect(
    multiSign(client, {
      transaction: { ...local, txID: 'ab'.repeat(32) },
      privateKey: pk2,
      permissionId: 2,
    }),
  ).rejects.toThrow('The transaction failed its integrity check (txCheck).')
})

test('refuses partial forms — a bare txID with no raw_data does not sign', async () => {
  const { client } = silentClient()
  await expect(
    multiSign(client, {
      transaction: { txID: local.txID } as unknown as SignableTransaction,
      privateKey: pk1,
      permissionId: 2,
    }),
  ).rejects.toThrow('The transaction failed its integrity check (txCheck).')
})

test('a contract-less shell is refused with a clean integrity error', async () => {
  // `contract: []` with a ref-block field serializes to non-empty bytes, so a
  // correctly-derived txID/hex would slip past the zero-bytes guard — multiSign
  // must reject it via txCheck before the owner_address read on contract[0].
  const shell = { ref_block_bytes: '1234', contract: [] }
  const { client } = silentClient()
  await expect(
    multiSign(client, {
      transaction: {
        raw_data: shell,
        raw_data_hex: toRawDataHex(shell as never),
        txID: getTransactionId(shell as never),
      } as unknown as SignableTransaction,
      privateKey: pk1,
      permissionId: 2,
    }),
  ).rejects.toThrow('The transaction failed its integrity check (txCheck).')
})

// ---- The `account` calling convention --------------------------------------
// The sibling sign actions (`signTransaction` / `signMessage` /
// `signTypedData`) take an `account` that falls back to the Client's hoisted
// one. `multiSign` took only a raw key, so a client with an account could not
// co-sign through it, and an HD or custom (key-less) account had no path
// through the action at all.

test('co-signs with an `account`, byte-identical to the raw-key path', async () => {
  const { client, calls } = silentClient()
  const viaKey = await multiSign(client, {
    transaction: unboundTriple(),
    privateKey: pk2,
    permissionId: 2,
  })

  expect(
    await multiSign(client, {
      transaction: unboundTriple(),
      account: privateKeyToAccount(pk2),
      permissionId: 2,
    }),
  ).toEqual(viaKey)
  expect(calls).toHaveLength(0)
})

test('refuses a private-key string as `account`, without echoing it', async () => {
  // An `account` string is a T-address; the raw key goes in `privateKey` or
  // through privateKeyToAccount().
  const { client, calls } = silentClient()
  const err = (await multiSign(client, {
    transaction: unboundTriple(),
    account: pk2 as never,
    permissionId: 2,
  }).catch((e) => e)) as BaseError
  expect(err).toBeInstanceOf(InvalidAddressError)
  expect(err.message).toContain('Address is invalid.')
  expect(err.message).not.toContain(pk2)
  expect(err.message).not.toContain(pk2.slice(2))
  expect(calls).toHaveLength(0)
})

test('falls back to the account hoisted on the Client', async () => {
  const { transport } = createMockTransport({ responses: {} })
  const client = createWalletClient({
    account: privateKeyToAccount(pk2),
    transport,
  })
  const viaKey = await multiSign(client, {
    transaction: unboundTriple(),
    privateKey: pk2,
    permissionId: 2,
  })

  expect(
    await multiSign(client, { transaction: unboundTriple(), permissionId: 2 }),
  ).toEqual(viaKey)
  // …and through the decorator, which is how a wallet client is used.
  expect(
    await client.multiSign({ transaction: unboundTriple(), permissionId: 2 }),
  ).toEqual(viaKey)
})

test('an explicit privateKey still wins over the hoisted account', async () => {
  // The original calling convention: a wallet client (its own account
  // hoisted) co-signing with ANOTHER party's key. The hoisted account is only
  // a fallback — it must not displace a signer the caller named.
  const { transport } = createMockTransport({ responses: {} })
  const client = createWalletClient({
    account: privateKeyToAccount(pk1),
    transport,
  })
  const pk2Signed = await multiSign(silentClient().client, {
    transaction: unboundTriple(),
    privateKey: pk2,
    permissionId: 2,
  })

  expect(
    await client.multiSign({
      transaction: unboundTriple(),
      privateKey: pk2,
      permissionId: 2,
    }),
  ).toEqual(pk2Signed)
})

test('co-signs with an HD account without extracting its key', async () => {
  const { client } = silentClient()
  const account = mnemonicToAccount(
    'test test test test test test test test test test test junk',
  )

  const signed = await multiSign(client, {
    transaction: unboundTriple(),
    account,
    permissionId: 2,
  })

  expect(signed).toEqual(
    await account.multiSign(unboundTriple(), { permissionId: 2 }),
  )
  expect(signed.signature).toHaveLength(1)
})

test("delegates to a custom account's own multiSign", async () => {
  // A key-less account (a remote / hardware signer) that implements
  // `multiSign` itself: the action must consult it rather than need a key.
  const { client } = silentClient()
  const inner = privateKeyToAccount(pk2)
  const seen: unknown[] = []
  const account = toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: inner.signMessage,
    signTypedData: inner.signTypedData,
    signTransaction: inner.signTransaction,
    multiSign: (transaction, options) => {
      seen.push(options)
      return inner.multiSign(transaction, options)
    },
  })

  const signed = await multiSign(client, {
    transaction: unboundTriple(),
    account,
    permissionId: 2,
  })

  expect(seen).toEqual([{ permissionId: 2 }])
  expect(signed.txID).toBe(transferBound!.txID)
  expect(signed.signature).toHaveLength(1)
})

test('refuses a custom account that does not implement multiSign', async () => {
  const { client } = silentClient()
  const inner = privateKeyToAccount(pk2)
  const account = toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: inner.signMessage,
    signTypedData: inner.signTypedData,
    signTransaction: inner.signTransaction,
  })

  const err = (await multiSign(client, {
    transaction: unboundTriple(),
    account,
    permissionId: 2,
  }).catch((e) => e)) as BaseError
  expect(err).toBeInstanceOf(BaseError)
  expect(err.message).toContain('does not implement `multiSign`')
})

test('refuses an `account` and a `privateKey` together — two named signers', async () => {
  const { client } = silentClient()

  const err = (await multiSign(client, {
    transaction: unboundTriple(),
    account: privateKeyToAccount(pk1),
    privateKey: pk2,
    permissionId: 2,
  }).catch((e) => e)) as BaseError
  expect(err).toBeInstanceOf(BaseError)
  expect(err.message).toContain('either `account` or `privateKey`, not both')
})

test('throws AccountNotFoundError when no signer is available', async () => {
  const { client } = silentClient()
  await expect(
    multiSign(client, { transaction: unboundTriple(), permissionId: 2 }),
  ).rejects.toBeInstanceOf(AccountNotFoundError)
})

// ---- MaybePromise signers --------------------------------------------------
// An account's `multiSign` may return the co-signed transaction directly
// (key-backed accounts) or as a Promise (wallets, hardware, KMS). The action
// awaits it, so both kinds resolve to the same bytes, and a rejection reaches
// the caller without anything being sent to the node.

/** A custom account whose `multiSign` is `impl`, other members from `inner`. */
function customAccountWith(
  impl: AccountMultiSignFn | undefined,
  inner: TronLocalAccount = privateKeyToAccount(pk2),
) {
  return toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: inner.signMessage,
    signTypedData: inner.signTypedData,
    signTransaction: inner.signTransaction,
    ...(impl ? { multiSign: impl } : {}),
  })
}

/** Defers `inner.multiSign` across a macrotask, as a remote signer would. */
function asyncMultiSignOf(inner: TronLocalAccount): AccountMultiSignFn {
  return async (transaction, options) => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    return inner.multiSign(transaction, options)
  }
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

test('an async custom multiSign resolves to a checked copy of the transaction it produced', async () => {
  const { client, calls } = silentClient()
  const produced = { ...boundTriple(), signature: ['cd'.repeat(65)] }
  const seen: unknown[] = []
  const account = customAccountWith(async (transaction, options) => {
    seen.push([transaction, options])
    return produced
  })

  const result = await multiSign(client, {
    transaction: unboundTriple(),
    account,
    permissionId: 2,
  })
  // A snapshot of what the signer returned: equal, but never its own object.
  expect(result).toStrictEqual(produced)
  expect(result).not.toBe(produced)
  expect(seen).toEqual([[unboundTriple(), { permissionId: 2 }]])
  expect(calls).toHaveLength(0)
})

test('an async multiSign wrapping a key is byte-identical to the sync local account', async () => {
  const { client, calls } = silentClient()
  const viaKey = await multiSign(client, {
    transaction: unboundTriple(),
    privateKey: pk1,
    permissionId: 2,
  })
  const viaLocal = await privateKeyToAccount(pk1).multiSign(unboundTriple(), {
    permissionId: 2,
  })
  const inner = privateKeyToAccount(pk1)
  const viaAsync = await multiSign(client, {
    transaction: unboundTriple(),
    account: customAccountWith(asyncMultiSignOf(inner), inner),
    permissionId: 2,
  })

  expect(viaAsync).toEqual(viaKey)
  expect(viaAsync).toEqual(viaLocal)
  // …and identical to the Permission_id=2 gold vector, signed directly.
  expect(viaAsync.raw_data_hex).toBe(transferBound!.rawDataHex)
  expect(viaAsync.txID).toBe(transferBound!.txID)
  expect(viaAsync.signature).toEqual(local.signature)

  // A later async co-signer appends to the bound handoff, inheriting id 2.
  const pk2Account = privateKeyToAccount(pk2)
  const second = await multiSign(client, {
    transaction: viaAsync,
    account: customAccountWith(asyncMultiSignOf(pk2Account), pk2Account),
  })
  expect(second).toEqual(
    await multiSign(client, { transaction: local, privateKey: pk2 }),
  )
  expect(second.signature).toHaveLength(2)
  expect(calls).toHaveLength(0)
})

test('a client-hoisted async multiSign account works like a per-call one', async () => {
  const inner = privateKeyToAccount(pk2)
  const account = customAccountWith(asyncMultiSignOf(inner), inner)
  const expected = await inner.multiSign(unboundTriple(), { permissionId: 2 })

  const { transport, calls } = createMockTransport({ responses: {} })
  const hoisted = createWalletClient({ account, transport })
  expect(
    await hoisted.multiSign({ transaction: unboundTriple(), permissionId: 2 }),
  ).toEqual(expected)
  expect(
    await multiSign(hoisted, { transaction: unboundTriple(), permissionId: 2 }),
  ).toEqual(expected)

  const perCall = createWalletClient({ transport })
  expect(
    await perCall.multiSign({
      transaction: unboundTriple(),
      account,
      permissionId: 2,
    }),
  ).toEqual(expected)
  expect(calls).toHaveLength(0)
})

test('an async multiSign rejection propagates the same error object, never unhandled', async () => {
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
    const { transport, calls } = createMockTransport({ responses: {} })
    const client = createWalletClient({
      account: customAccountWith(impl),
      transport,
    })
    let caught: unknown
    const unhandled = await unhandledRejectionsDuring(async () => {
      try {
        await client.multiSign({
          transaction: unboundTriple(),
          permissionId: 2,
        })
      } catch (e) {
        caught = e
      }
    })
    expect(caught).toBe(error)
    expect(unhandled).toEqual([])
    expect(calls).toHaveLength(0)
  }
})

test('a UserRejectedRequestError from multiSign keeps its code and cause', async () => {
  const { client } = silentClient()
  const cause = new Error('declined in wallet')
  const err = (await multiSign(client, {
    transaction: unboundTriple(),
    account: customAccountWith(async () => {
      throw new UserRejectedRequestError({ cause })
    }),
    permissionId: 2,
  }).catch((e) => e)) as UserRejectedRequestError
  expect(err).toBeInstanceOf(UserRejectedRequestError)
  expect(err).toBeInstanceOf(BaseError)
  expect(err.code).toBe(4001)
  expect(err.cause).toBe(cause)
})

test('the missing-multiSign guard still fires for an async custom source, before any signing', async () => {
  // A wallet-style source: async signers, no multiSign. The guard must refuse
  // up front — never fall back to signTransaction — hoisted or per-call.
  const inner = privateKeyToAccount(pk2)
  const signed: unknown[] = []
  const account = toAccount({
    address: inner.address,
    publicKey: inner.publicKey,
    signMessage: async (parameters) => inner.signMessage(parameters),
    signTypedData: async (parameters) => inner.signTypedData(parameters),
    signTransaction: async (transaction) => {
      signed.push(transaction)
      return inner.signTransaction(transaction)
    },
  })
  expect(account.multiSign).toBeUndefined()

  const { transport, calls } = createMockTransport({ responses: {} })
  for (const run of [
    () =>
      multiSign(createWalletClient({ transport }), {
        transaction: unboundTriple(),
        account,
        permissionId: 2,
      }),
    () =>
      createWalletClient({ account, transport }).multiSign({
        transaction: unboundTriple(),
        permissionId: 2,
      }),
  ]) {
    const err = (await run().catch((e) => e)) as BaseError
    expect(err).toBeInstanceOf(BaseError)
    expect(err.message).toContain('does not implement `multiSign`')
  }
  expect(signed).toEqual([])
  expect(calls).toHaveLength(0)
})

// ---- What the co-signer hands back -----------------------------------------
// On the `account` path the action keeps only a checked snapshot of what the
// account's multiSign returned: consistent bytes, at least one signature, and
// the same owner_address it was asked to co-sign. The co-signer itself need
// not be that owner, and a fresh permission bind legitimately changes the
// txID — both must keep working.

/** The unbound transfer re-serialized for `owner` (hex) — another account's transaction. */
function transferFor(
  owner: ReturnType<typeof addressToHex>,
): SignableTransaction {
  const raw = unboundTriple().raw_data
  const contract = raw.contract[0]!
  const raw_data_hex = toRawDataHex({
    ...raw,
    contract: [
      {
        ...contract,
        parameter: {
          ...contract.parameter,
          value: {
            ...(contract.parameter.value as object),
            owner_address: owner,
          },
        },
      },
    ],
  })
  const raw_data = decodeRawData(raw_data_hex)
  return { txID: getTransactionId(raw_data), raw_data, raw_data_hex }
}

/** pk2's address as raw_data spells it (41-prefixed hex). */
const pk2Owner = addressToHex(privateKeyToAccount(pk2).address)

test('a non-owner co-signer account succeeds — the owner check is on owner_address, not the signer', async () => {
  const { client, calls } = silentClient()
  const inner = privateKeyToAccount(pk2)
  const owner = (
    local.raw_data.contract[0]!.parameter.value as { owner_address: string }
  ).owner_address
  expect(owner).not.toBe(pk2Owner) // pk1 owns it; pk2 only co-signs

  for (const account of [
    inner,
    customAccountWith(asyncMultiSignOf(inner), inner),
  ]) {
    const second = await multiSign(client, { transaction: local, account })
    expect(second).toStrictEqual(
      multiSignTransaction({ transaction: local, privateKey: pk2 }),
    )
    expect(second.signature).toHaveLength(2)
    expect(second.signature?.[0]).toBe(local.signature?.[0])
    expect(second.txID).toBe(local.txID)
  }
  expect(calls).toHaveLength(0)
})

test('a fresh permission bind through an account succeeds though the txID changes', async () => {
  const { client, calls } = silentClient()
  const inner = privateKeyToAccount(pk2)
  for (const account of [
    inner,
    customAccountWith(asyncMultiSignOf(inner), inner),
  ]) {
    const transaction = unboundTriple()
    const signed = await multiSign(client, {
      transaction,
      account,
      permissionId: 2,
    })
    expect(signed.txID).toBe(transferBound!.txID)
    expect(signed.txID).not.toBe(transfer!.txID)
    expect(signed.raw_data_hex).toBe(transferBound!.rawDataHex)
    expect(signed.raw_data.contract[0]?.Permission_id).toBe(2)
    expect(signed.signature).toHaveLength(1)
    // The caller's handoff is untouched.
    expect(transaction).toStrictEqual(unboundTriple())
  }
  expect(calls).toHaveLength(0)
})

test('a co-signer returning a validly signed transaction for another owner is rejected', async () => {
  const { client, calls } = silentClient()
  // pk2's own transfer, genuinely signed by pk2 — consistent bytes, a real
  // signature, but not the owner the caller handed over.
  const swapped = multiSignTransaction({
    transaction: transferFor(pk2Owner),
    privateKey: pk2,
    permissionId: 2,
  })
  const err = (await multiSign(client, {
    transaction: unboundTriple(),
    account: customAccountWith(async () => swapped),
    permissionId: 2,
  }).catch((e) => e)) as TransactionMismatchError
  expect(err).toBeInstanceOf(TransactionMismatchError)
  expect(err.shortMessage).toMatch(/different owner_address/)
  expect(calls).toHaveLength(0)
})

test('a co-signer returning an unsigned transaction is rejected', async () => {
  const { client } = silentClient()
  for (const produced of [boundTriple(), { ...boundTriple(), signature: [] }]) {
    const err = (await multiSign(client, {
      transaction: unboundTriple(),
      account: customAccountWith(async () => produced),
      permissionId: 2,
    }).catch((e) => e)) as TransactionMismatchError
    expect(err).toBeInstanceOf(TransactionMismatchError)
    expect(err.shortMessage).toMatch(/without a signature/)
  }
})

test('the privateKey path is unchanged: the core result, no snapshot check', async () => {
  const { client, calls } = silentClient()
  const transaction = unboundTriple()
  const viaAction = await multiSign(client, {
    transaction,
    privateKey: pk2,
    permissionId: 2,
  })
  expect(viaAction).toStrictEqual(
    multiSignTransaction({
      transaction: unboundTriple(),
      privateKey: pk2,
      permissionId: 2,
    }),
  )
  // A non-owner key co-signs the owner's bound bytes, as before.
  expect(viaAction.txID).toBe(transferBound!.txID)
  expect(transaction).toStrictEqual(unboundTriple())
  // …and its own integrity guard still speaks, not the snapshot check.
  await expect(
    multiSign(client, {
      transaction: { ...local, txID: 'ab'.repeat(32) },
      privateKey: pk2,
    }),
  ).rejects.toThrow('The transaction failed its integrity check (txCheck).')
  expect(calls).toHaveLength(0)
})

test('the co-signer receives a copy: neither side mutating its object reaches the other', async () => {
  const { client } = silentClient()
  const inner = privateKeyToAccount(pk2)
  const transaction = boundTriple()
  let received: SignableTransaction | undefined
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = multiSign(client, {
    transaction,
    account: customAccountWith(async (handed, options) => {
      received = handed
      await gate
      const signed = await inner.multiSign(handed, options)
      // An in-place co-signer: attaches its signature to the argument.
      handed.signature = signed.signature!
      return handed
    }),
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(received).toStrictEqual(boundTriple())
  expect(received).not.toBe(transaction)
  // The caller retargets its own object while the co-signer is signing.
  ;(
    transaction.raw_data.contract[0]!.parameter.value as {
      owner_address: string
    }
  ).owner_address = 'ff'.repeat(21)
  release()
  const result = await pending

  expect(result).toStrictEqual(await inner.multiSign(boundTriple()))
  expect(result).not.toBe(received)
  expect(transaction.signature).toBeUndefined()
})

test('a co-signer retargeting its own argument cannot move the owner check', async () => {
  // The account is handed a copy; rewriting that copy to pk2's transfer and
  // returning pk2's signed one must still be caught.
  const { client } = silentClient()
  const other = transferFor(pk2Owner)
  const swapped = multiSignTransaction({ transaction: other, privateKey: pk2 })
  const transaction = unboundTriple()
  const err = await multiSign(client, {
    transaction,
    account: customAccountWith(async (handed) => {
      Object.assign(handed, structuredClone(other))
      return swapped
    }),
  }).catch((e) => e)
  expect(err).toBeInstanceOf(TransactionMismatchError)
  expect(transaction).toStrictEqual(unboundTriple())
})
