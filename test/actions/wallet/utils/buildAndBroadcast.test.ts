import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../../src/accounts/toAccount.js'
import type {
  TronAccount,
  TronCustomSource,
} from '../../../../src/accounts/types.js'
import { buildAndBroadcast } from '../../../../src/actions/wallet/utils/buildAndBroadcast.js'
import { createPublicClient } from '../../../../src/clients/createPublicClient.js'
import { UserRejectedRequestError } from '../../../../src/errors/rpc.js'
import { parseAccount } from '../../../../src/types/account.js'
import { addressToHex } from '../../../../src/utils/address/addressToHex.js'
import {
  ContractType,
  contractTypeUrlPrefix,
} from '../../../../src/utils/transaction/registry.js'
import type { RawContract } from '../../../../src/utils/transaction/serializeRawData.js'
import { rpc } from '../../../fixtures/rpc/loader.js'
import { loadTxFixtureFile } from '../../../fixtures/tx/loader.js'
import { createMockTransport } from '../../../mock/createMockTransport.js'
import { parseBroadcast } from '../../../mock/parseBroadcast.js'

// pk = 1 → address TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC (the fixture owner).
const pk1 = `0x${'0'.repeat(63)}1` as const

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
  const account = parseAccount(pk1)
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
  const account = parseAccount(pk1)

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
  const account = parseAccount(pk1)

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
  const account = parseAccount(pk1)

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
  const account = parseAccount(pk1)

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
