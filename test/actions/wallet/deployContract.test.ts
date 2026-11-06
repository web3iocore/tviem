import type { Abi } from 'abitype'
import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../src/accounts/toAccount.js'
import type {
  SignableTransaction,
  TronAccount,
  TronCustomSource,
} from '../../../src/accounts/types.js'
import { deployContract } from '../../../src/actions/wallet/deployContract.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import {
  AccountNotFoundError,
  TransactionTamperedError,
  UserRejectedRequestError,
} from '../../../src/errors/rpc.js'
import type { Hex } from '../../../src/types/misc.js'
import { addressToHex } from '../../../src/utils/address/addressToHex.js'
import { decodeRawData } from '../../../src/utils/transaction/decodeRawData.js'
import { genContractAddress } from '../../../src/utils/transaction/genContractAddress.js'
import { getTransactionId } from '../../../src/utils/transaction/getTransactionId.js'
import {
  type RawData,
  toRawDataHex,
} from '../../../src/utils/transaction/serializeRawData.js'
import { rpc } from '../../fixtures/rpc/loader.js'
import { loadTxFixtureFile, type TxFixture } from '../../fixtures/tx/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'
import { parseBroadcast } from '../../mock/parseBroadcast.js'

// pk = 1 (permitted trivial key) → address TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC,
// which is exactly the fixture `owner_address`.
const pk1 = `0x${'0'.repeat(63)}1` as const
const account = privateKeyToAccount(pk1)

const [basic, withToken] = loadTxFixtureFile('create-smart-contract.json')

type DeployValue = {
  abi: Abi
  bytecode: string
  name: string
  consume_user_resource_percent: string
  origin_energy_limit: string
  call_token_value?: string
  token_id?: string
}

function deployValueOf(fixture: TxFixture): DeployValue {
  return (fixture.params as { value: DeployValue }).value
}

function writeMock() {
  return createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
}

test('deploys byte-for-byte against the gold vector + backfills the address', async () => {
  const { transport, calls, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })
  const value = deployValueOf(basic!)

  const { txID, contractAddress } = await deployContract(client, {
    abi: value.abi,
    bytecode: `0x${value.bytecode}` as Hex,
    name: value.name,
    consumeUserResourcePercent: BigInt(value.consume_user_resource_percent),
    originEnergyLimit: BigInt(value.origin_energy_limit),
    feeLimit: 1000000000n,
  })

  expect(txID).toBe(basic?.txID)
  expect(calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    txID: string
    raw_data_hex: string
    signature: string[]
  }
  expect(body.raw_data_hex).toBe(basic?.rawDataHex)
  expect(body.txID).toBe(basic?.txID)
  expect(body.signature).toHaveLength(1)

  // The deployed address is derived deterministically from txID + owner and
  // returned as Base58Check; converting it back to TRON hex matches the pin.
  expect(addressToHex(contractAddress)).toBe(basic?.contractAddress)
})

test('carries call_token_value + token_id byte-for-byte', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })
  const value = deployValueOf(withToken!)

  const { txID, contractAddress } = await deployContract(client, {
    abi: value.abi,
    bytecode: `0x${value.bytecode}` as Hex,
    name: value.name,
    consumeUserResourcePercent: BigInt(value.consume_user_resource_percent),
    originEnergyLimit: BigInt(value.origin_energy_limit),
    callTokenValue: BigInt(value.call_token_value ?? '0'),
    tokenId: BigInt(value.token_id ?? '0'),
    feeLimit: 1000000000n,
  })

  expect(txID).toBe(withToken?.txID)
  expect(
    (parseBroadcast(bodyOf('broadcasttransaction')) as { raw_data_hex: string })
      .raw_data_hex,
  ).toBe(withToken?.rawDataHex)
  expect(addressToHex(contractAddress)).toBe(withToken?.contractAddress)
})

// A bare deployment defaults the two on-chain economics fields to the
// ecosystem-standard values (TronWeb parity: userFeePercentage 100 /
// originEnergyLimit 1e7). Proto3's implicit 0/0 would flip the energy payer
// to the deployer and carry a non-positive origin_energy_limit the node
// rejects outright.
test('defaults consume_user_resource_percent to 100 and origin_energy_limit to 1e7', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })
  const value = deployValueOf(basic!)

  await deployContract(client, {
    abi: value.abi,
    bytecode: `0x${value.bytecode}` as Hex,
  })

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data_hex: string
  }
  const created = decodeRawData(body.raw_data_hex).contract[0]?.parameter
    .value as {
    new_contract?: {
      consume_user_resource_percent?: number
      origin_energy_limit?: number
    }
  }
  expect(created.new_contract?.consume_user_resource_percent).toBe(100)
  expect(created.new_contract?.origin_energy_limit).toBe(10_000_000)
})

test('resolves the per-call account when the client hoists none', async () => {
  const { transport } = writeMock()
  const client = createWalletClient({ transport })
  const value = deployValueOf(basic!)

  const { txID } = await deployContract(client, {
    account,
    abi: value.abi,
    bytecode: `0x${value.bytecode}` as Hex,
    name: value.name,
    consumeUserResourcePercent: BigInt(value.consume_user_resource_percent),
    originEnergyLimit: BigInt(value.origin_energy_limit),
    feeLimit: 1000000000n,
  })
  expect(txID).toBe(basic?.txID)
})

test('derives the contract address from the deployer that was signed, not a later read of the account', async () => {
  const value = deployValueOf(basic!)

  // A custom account (e.g. a wallet adapter) may expose whichever address is
  // currently selected. It changes here while the broadcast is in flight —
  // after the deployer was written into the signed bytes. The returned
  // contract address must still be the one the chain will derive: from the
  // transaction id and the `owner_address` that transaction actually carries.
  const account = { ...privateKeyToAccount(pk1) }
  const { transport, bodyOf } = createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: {
        fn: () => {
          account.address = 'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K'
          return rpc('broadcasttransaction.ok')
        },
      },
    },
  })
  const client = createWalletClient({ transport })

  const { contractAddress } = await deployContract(client, {
    account,
    abi: value.abi,
    bytecode: `0x${value.bytecode}` as Hex,
    name: value.name,
    consumeUserResourcePercent: BigInt(value.consume_user_resource_percent),
    originEnergyLimit: BigInt(value.origin_energy_limit),
    feeLimit: 1000000000n,
  })

  // The signed transaction is the gold vector (deployer = pk1's address)…
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data_hex: string
  }
  expect(body.raw_data_hex).toBe(basic?.rawDataHex)
  // …so the address is the gold vector's, whatever the account reads as now.
  expect(addressToHex(contractAddress)).toBe(basic?.contractAddress)
})

test('throws AccountNotFoundError when no account is available', async () => {
  const { transport } = writeMock()
  const client = createPublicClient({ transport })
  await expect(
    deployContract(client, { abi: [], bytecode: '0x60' }),
  ).rejects.toBeInstanceOf(AccountNotFoundError)
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

async function rundeployContract(account: TronAccount) {
  const mock = writeMock()
  const client = createWalletClient({ account, transport: mock.transport })
  const result = await deployContract(client, {
    abi: deployValueOf(basic!).abi,
    bytecode: `0x${deployValueOf(basic!).bytecode}` as Hex,
    name: deployValueOf(basic!).name,
    consumeUserResourcePercent: BigInt(
      deployValueOf(basic!).consume_user_resource_percent,
    ),
    originEnergyLimit: BigInt(deployValueOf(basic!).origin_energy_limit),
    feeLimit: 1000000000n,
  })
  return {
    result,
    body: mock.bodyOf('broadcasttransaction'),
    calls: mock.calls,
  }
}

test('deployContract: an async custom signer broadcasts the same bytes as the local account', async () => {
  const sync = await rundeployContract(local)
  const async_ = await rundeployContract(asyncSigner())

  expect(async_.body).toEqual(sync.body)
  expect(parseBroadcast(async_.body).signature).toEqual(
    parseBroadcast(sync.body).signature,
  )
  expect(async_.result.txID).toBe(sync.result.txID)
  expect(async_.result.txID).toBe(basic?.txID)
  expect(async_.result.contractAddress).toBe(sync.result.contractAddress)
  expect(addressToHex(async_.result.contractAddress)).toBe(
    basic?.contractAddress,
  )
  expect(async_.calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
})

test('deployContract: a sync custom signer still works byte-for-byte (compat)', async () => {
  const sync = await rundeployContract(local)
  const custom = await rundeployContract(syncSigner())
  expect(custom.body).toEqual(sync.body)
  expect(custom.result).toEqual(sync.result)
})

test.each(
  rejections,
)('deployContract: an async signer rejecting with %s propagates it unchanged and never broadcasts', async (_, makeError) => {
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
      await deployContract(client, {
        abi: deployValueOf(basic!).abi,
        bytecode: `0x${deployValueOf(basic!).bytecode}` as Hex,
        name: deployValueOf(basic!).name,
        consumeUserResourcePercent: BigInt(
          deployValueOf(basic!).consume_user_resource_percent,
        ),
        originEnergyLimit: BigInt(deployValueOf(basic!).origin_energy_limit),
        feeLimit: 1000000000n,
      })
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

async function attemptdeployContract(account: TronAccount) {
  const mock = writeMock()
  const client = createWalletClient({ account, transport: mock.transport })
  const outcome = await deployContract(client, {
    abi: deployValueOf(basic!).abi,
    bytecode: `0x${deployValueOf(basic!).bytecode}` as Hex,
    name: deployValueOf(basic!).name,
    consumeUserResourcePercent: BigInt(
      deployValueOf(basic!).consume_user_resource_percent,
    ),
    originEnergyLimit: BigInt(deployValueOf(basic!).origin_energy_limit),
    feeLimit: 1000000000n,
  }).then(
    (result) => ({ result, error: undefined }),
    (error: unknown) => ({ result: undefined, error }),
  )
  return { ...outcome, calls: mock.calls, bodyOf: mock.bodyOf }
}

test('deployContract: a wallet that rebuilds the transaction (same owner) is broadcast and its txID returned', async () => {
  let rebuilt: SignableTransaction | undefined
  const outcome = await attemptdeployContract(
    customSigner(async (tx) => {
      await tick()
      rebuilt = rebuild(tx, walletRebuild)
      return local.signTransaction(rebuilt)
    }),
  )

  expect(outcome.error).toBeUndefined()
  expect(rebuilt?.txID).not.toBe(basic?.txID)
  const body = outcome.bodyOf('broadcasttransaction') as {
    txID: string
    raw_data_hex: string
  }
  expect(body.txID).toBe(rebuilt?.txID)
  expect(body.raw_data_hex).toBe(rebuilt?.raw_data_hex)
  expect(parseBroadcast(body).raw_data.fee_limit).toBe(30_000_000)
  expect(outcome.result?.txID).toBe(rebuilt?.txID)

  // The contract address is derived from the txID that was actually signed
  // and broadcast — the rebuilt one — and the (unchanged) deployer.
  const result = outcome.result as Awaited<ReturnType<typeof deployContract>>
  expect(addressToHex(result.contractAddress)).toBe(
    genContractAddress(rebuilt!.txID, local.address),
  )
  expect(addressToHex(result.contractAddress)).not.toBe(basic?.contractAddress)
})

test('deployContract: a validly signed transaction for a different owner is refused and never broadcast', async () => {
  const outcome = await attemptdeployContract(
    customSigner(async (tx) => {
      await tick()
      return other.signTransaction(rebuild(tx, reown))
    }),
  )
  expect(outcome.error).toBeInstanceOf(TransactionTamperedError)
  expect((outcome.error as TransactionTamperedError).shortMessage).toMatch(
    /different owner_address/,
  )
  expect(outcome.calls.map((c) => c.path)).toEqual(['getnowblock'])
})

test('deployContract: a signer returning an empty signature list is refused and never broadcast', async () => {
  const outcome = await attemptdeployContract(
    customSigner(async (tx) => {
      await tick()
      return { ...(await local.signTransaction(tx)), signature: [] }
    }),
  )
  expect(outcome.error).toBeInstanceOf(TransactionTamperedError)
  expect((outcome.error as TransactionTamperedError).shortMessage).toMatch(
    /without a signature/,
  )
  expect(outcome.calls.map((c) => c.path)).toEqual(['getnowblock'])
})
