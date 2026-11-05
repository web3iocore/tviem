import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../../src/accounts/toAccount.js'
import type {
  SignableTransaction,
  TronAccount,
  TronCustomSource,
} from '../../../src/accounts/types.js'
import { writeContract } from '../../../src/actions/wallet/writeContract.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import { defaultFeeLimit } from '../../../src/constants/transaction.js'
import {
  AccountNotFoundError,
  TransactionTamperedError,
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

const trc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

const contract = 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe' as Address
// The gold vectors encode transfer(410123456789…, 1000000) which resolves to
// the same Base58 address as the contract here.
const recipient = 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe' as Address

// trigger-smart-contract[0] "with fee_limit" + sig/transaction "…with fee_limit".
const FEE_LIMIT = 100000000n
const TX_ID_FEELIMIT =
  '3efcd4d8554ed772ee4310511611b348a3a8f79fe3fab6b839a383b8525bff16'
const RAW_FEELIMIT =
  '0a0212342208010203040506070840e0a499ffbc315aae01081f12a9010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412740a15417e5f4552091a69125d5dfcb7b8c2659029395bdf1215410123456789abcdef0123456789abcdef012345672244a9059cbb0000000000000000000000000123456789abcdef0123456789abcdef0123456700000000000000000000000000000000000000000000000000000000000f42407080d095ffbc31900180c2d72f'
const SIG_FEELIMIT =
  '896177051d2d91e1e2486cf62a42073a3afde0899a9b595eac1401c2d0e5a2e929c6940cf8d04e68301c04d8daf8d0c09f009d8917156d6627bce1627b0a3f271b'

// trigger-smart-contract[2] "with call_value" + sig/transaction "…with call_value".
const TX_ID_CALLVALUE =
  '02291b032452a50f3be211053efeb26e02cfc14baf9dcad58bc201d5a2aab78f'
const RAW_CALLVALUE =
  '0a0212342208010203040506070840e0a499ffbc315ab201081f12ad010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412780a15417e5f4552091a69125d5dfcb7b8c2659029395bdf1215410123456789abcdef0123456789abcdef0123456718c0843d2244a9059cbb0000000000000000000000000123456789abcdef0123456789abcdef0123456700000000000000000000000000000000000000000000000000000000000f42407080d095ffbc31900180c2d72f'
const SIG_CALLVALUE =
  'e4722832b4ea185f2f119ad08a1ec9a533c47d460d871cf8a3320de97fd3d17235195aa0e50b2bcb4713178a7f1479cc822f8ce0d183927525f36997774108611c'

// trigger-smart-contract[3] "with call_token_value + token_id" + sig/transaction
// "…with call_token_value + token_id".
const TX_ID_TOKEN =
  '55e2d00be74b4fe3121fd231ec1f0f0d6500379382ea7ff93d3c187cf5653d04'
const RAW_TOKEN =
  '0a0212342208010203040506070840e0a499ffbc315ab401081f12af010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e7472616374127a0a15417e5f4552091a69125d5dfcb7b8c2659029395bdf1215410123456789abcdef0123456789abcdef012345672244a9059cbb0000000000000000000000000123456789abcdef0123456789abcdef0123456700000000000000000000000000000000000000000000000000000000000f424028053090943d7080d095ffbc31900180c2d72f'
const SIG_TOKEN =
  '8209221db0138836b05029463dc945dbe78de43621aadd4731d3ced1d18f6488362cca89a150dcc21df7390a843c9d34fe04a8dad3b8276eaff495ce786171f81b'

function writeMock() {
  return createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
}

test('builds, signs and broadcasts a TRC20 transfer byte-for-byte (feeLimit)', async () => {
  const { transport, calls, bodyOf } = writeMock()
  const client = createWalletClient({ account: pk1, transport })

  const { txID } = await client.writeContract({
    address: contract,
    abi: trc20Abi,
    functionName: 'transfer',
    args: [recipient, 1000000n],
    feeLimit: FEE_LIMIT,
  })

  expect(txID).toBe(TX_ID_FEELIMIT)
  expect(calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    txID: string
    raw_data: { fee_limit?: number }
    raw_data_hex: string
    signature: string[]
  }
  expect(body.txID).toBe(TX_ID_FEELIMIT)
  expect(body.raw_data_hex).toBe(RAW_FEELIMIT)
  expect(body.signature).toEqual([SIG_FEELIMIT])
  expect(body.raw_data.fee_limit).toBe(Number(FEE_LIMIT))
})

test('attaches callValue to the TriggerSmartContract byte-for-byte', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account: pk1, transport })

  const { txID } = await client.writeContract({
    address: contract,
    abi: trc20Abi,
    functionName: 'transfer',
    args: [recipient, 1000000n],
    feeLimit: FEE_LIMIT,
    callValue: 1000000n,
  })

  expect(txID).toBe(TX_ID_CALLVALUE)
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data_hex: string
    signature: string[]
  }
  expect(body.raw_data_hex).toBe(RAW_CALLVALUE)
  expect(body.signature).toEqual([SIG_CALLVALUE])
})

test('attaches callTokenValue + tokenId to the TriggerSmartContract byte-for-byte', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account: pk1, transport })

  const { txID } = await client.writeContract({
    address: contract,
    abi: trc20Abi,
    functionName: 'transfer',
    args: [recipient, 1000000n],
    feeLimit: FEE_LIMIT,
    callTokenValue: 5n,
    tokenId: 1002000n,
  })

  expect(txID).toBe(TX_ID_TOKEN)
  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data_hex: string
    signature: string[]
  }
  expect(body.raw_data_hex).toBe(RAW_TOKEN)
  expect(body.signature).toEqual([SIG_TOKEN])
})

test('defaults feeLimit to defaultFeeLimit when omitted', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account: pk1, transport })

  await client.writeContract({
    address: contract,
    abi: trc20Abi,
    functionName: 'transfer',
    args: [recipient, 1000000n],
  })

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as {
    raw_data: { fee_limit?: number }
  }
  expect(body.raw_data.fee_limit).toBe(Number(defaultFeeLimit))
})

// The memo (raw_data.data, field 10) and the calldata
// (TriggerSmartContract.data, a contract-message field) are different wire
// fields that merely share a name — a memo on a contract call must land in
// raw_data.data and leave the calldata untouched.
test('memo lands in raw_data.data without touching the calldata', async () => {
  const { transport, bodyOf } = writeMock()
  const client = createWalletClient({ account: pk1, transport })

  await client.writeContract({
    address: contract,
    abi: trc20Abi,
    functionName: 'transfer',
    args: [recipient, 1000000n],
    memo: '0x6f726465722d31323334', // "order-1234"
  })

  const body = parseBroadcast(bodyOf('broadcasttransaction')) as unknown as {
    raw_data: {
      data?: string
      contract: { parameter: { value: { data?: string } } }[]
    }
  }
  expect(body.raw_data.data).toBe('6f726465722d31323334')
  // Calldata is intact: selector + both ABI words.
  const calldata = body.raw_data.contract[0]?.parameter.value.data
  expect(calldata?.startsWith('a9059cbb')).toBe(true)
  expect(calldata).toHaveLength(8 + 64 + 64)
})

test('throws AccountNotFoundError when no account is available (bare action)', async () => {
  const { transport } = writeMock()
  const client = createPublicClient({ transport })
  await expect(
    writeContract(client, {
      address: contract,
      abi: trc20Abi,
      functionName: 'transfer',
      args: [recipient, 1000000n],
    }),
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

async function runwriteContract(account: TronAccount) {
  const mock = writeMock()
  const client = createWalletClient({ account, transport: mock.transport })
  const result = await client.writeContract({
    address: contract,
    abi: trc20Abi,
    functionName: 'transfer',
    args: [recipient, 1000000n],
    feeLimit: FEE_LIMIT,
  })
  return {
    result,
    body: mock.bodyOf('broadcasttransaction'),
    calls: mock.calls,
  }
}

test('writeContract: an async custom signer broadcasts the same bytes as the local account', async () => {
  const sync = await runwriteContract(local)
  const async_ = await runwriteContract(asyncSigner())

  expect(async_.body).toEqual(sync.body)
  expect(parseBroadcast(async_.body).signature).toEqual(
    parseBroadcast(sync.body).signature,
  )
  expect(async_.result.txID).toBe(sync.result.txID)
  expect(async_.result.txID).toBe(TX_ID_FEELIMIT)
  expect(parseBroadcast(async_.body).signature).toEqual([SIG_FEELIMIT])
  expect(async_.calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
})

test('writeContract: a sync custom signer still works byte-for-byte (compat)', async () => {
  const sync = await runwriteContract(local)
  const custom = await runwriteContract(syncSigner())
  expect(custom.body).toEqual(sync.body)
  expect(custom.result).toEqual(sync.result)
})

test.each(
  rejections,
)('writeContract: an async signer rejecting with %s propagates it unchanged and never broadcasts', async (_, makeError) => {
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
      await client.writeContract({
        address: contract,
        abi: trc20Abi,
        functionName: 'transfer',
        args: [recipient, 1000000n],
        feeLimit: FEE_LIMIT,
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

async function attemptwriteContract(account: TronAccount) {
  const mock = writeMock()
  const client = createWalletClient({ account, transport: mock.transport })
  const outcome = await client
    .writeContract({
      address: contract,
      abi: trc20Abi,
      functionName: 'transfer',
      args: [recipient, 1000000n],
      feeLimit: FEE_LIMIT,
    })
    .then(
      (result) => ({ result, error: undefined }),
      (error: unknown) => ({ result: undefined, error }),
    )
  return { ...outcome, calls: mock.calls, bodyOf: mock.bodyOf }
}

test('writeContract: a wallet that rebuilds the transaction (same owner) is broadcast and its txID returned', async () => {
  let rebuilt: SignableTransaction | undefined
  const outcome = await attemptwriteContract(
    customSigner(async (tx) => {
      await tick()
      rebuilt = rebuild(tx, walletRebuild)
      return local.signTransaction(rebuilt)
    }),
  )

  expect(outcome.error).toBeUndefined()
  expect(rebuilt?.txID).not.toBe(TX_ID_FEELIMIT)
  const body = outcome.bodyOf('broadcasttransaction') as {
    txID: string
    raw_data_hex: string
  }
  expect(body.txID).toBe(rebuilt?.txID)
  expect(body.raw_data_hex).toBe(rebuilt?.raw_data_hex)
  expect(parseBroadcast(body).raw_data.fee_limit).toBe(30_000_000)
  expect(outcome.result?.txID).toBe(rebuilt?.txID)
})

test('writeContract: a validly signed transaction for a different owner is refused and never broadcast', async () => {
  const outcome = await attemptwriteContract(
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

test('writeContract: a signer returning an empty signature list is refused and never broadcast', async () => {
  const outcome = await attemptwriteContract(
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
