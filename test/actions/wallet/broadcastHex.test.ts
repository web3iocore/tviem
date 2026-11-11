import { expect, test } from 'vitest'
import { broadcastHex } from '../../../src/actions/wallet/broadcastHex.js'
import { createClient } from '../../../src/clients/createClient.js'
import { BaseError } from '../../../src/errors/base.js'
import { TronBroadcastError, TronNodeError } from '../../../src/errors/node.js'
import { InvalidParameterError } from '../../../src/errors/parameter.js'
import {
  TransactionExpiredError,
  TronRpcError,
} from '../../../src/errors/rpc.js'
import { hexToBytes } from '../../../src/utils/encoding/toBytes.js'
import { sha256 } from '../../../src/utils/hash/sha256.js'
import { toBroadcastHex } from '../../../src/utils/transaction/serializeTransaction.js'
import { rpc } from '../../fixtures/rpc/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'

// Same gold vector as broadcastTransaction.test.ts: TX_ID = sha256(raw_data).
const TX_ID = '407ec75dad4545890e5788ef78555ecab9dc72d56df29da4ebbd508022bdbaba'
const RAW_DATA_HEX =
  '0a0212342208010203040506070840e0a499ffbc315a67080112630a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412320a15417e5f4552091a69125d5dfcb7b8c2659029395bdf121541928c9af0651632157ef27a2cf17ca72c575a4d2118c0843d7080d095ffbc31'
const SIG =
  '4d6f1e54ea593e5118c2d1b3701a4cab4d5235a418e9e46dba8c5f033bc4af0f6c04a08241de23936dffdedc869eac45533f9479a6bf372a38382b168b65ae001c'

// The full signed `Transaction` protobuf: raw_data (field 1) + signature
// (field 2) — what /wallet/broadcasthex relays verbatim.
const BROADCAST_HEX = toBroadcastHex({
  raw_data_hex: RAW_DATA_HEX,
  signature: [SIG],
})

// The node's echo: broadcasthex acknowledgements carry the transaction the
// node decoded from the relayed bytes, as a JSON string.
const ECHOED_TX = `{"raw_data":{"ref_block_bytes":"1234"},"raw_data_hex":"${RAW_DATA_HEX}","txID":"${TX_ID}","signature":["${SIG}"]}`

// Its parsed form — what broadcastHex returns.
const ECHOED_TX_PARSED = {
  raw_data: { ref_block_bytes: '1234' },
  raw_data_hex: RAW_DATA_HEX,
  txID: TX_ID,
  signature: [SIG],
}

test('POSTs the exact hex to broadcasthex and returns the LOCAL txid', async () => {
  const { transport, calls, bodyOf } = createMockTransport({
    responses: {
      broadcasthex: {
        response: {
          result: true,
          txid: `0${'0'.repeat(63)}`,
          transaction: ECHOED_TX,
        },
      },
    },
  })
  const client = createClient({ transport })

  const response = await broadcastHex(client, {
    serializedTransaction: BROADCAST_HEX,
  })

  // The node echoes an all-zero txid; the locally computed sha256(raw_data)
  // wins. The node's other acknowledgement fields ride along, plus the
  // node's echoed transaction, parsed.
  expect(response.txid).toBe(TX_ID)
  expect(response.txid).not.toBe(`0${'0'.repeat(63)}`)
  expect(response).toEqual({
    txid: TX_ID,
    result: true,
    transaction: ECHOED_TX_PARSED,
  })

  expect(calls[0]?.node).toBe('full')
  expect(calls[0]?.path).toBe('broadcasthex')
  expect(calls[0]?.method).toBe('POST')
  expect(bodyOf('broadcasthex')).toEqual({ transaction: BROADCAST_HEX })
})

test('normalizes a `0x`-prefixed upper-case input to the bare lowercase wire form', async () => {
  const { transport, bodyOf } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })

  const response = await broadcastHex(client, {
    serializedTransaction: `0x${BROADCAST_HEX.toUpperCase()}`,
  })

  expect(response.txid).toBe(TX_ID)
  expect(bodyOf('broadcasthex')).toEqual({ transaction: BROADCAST_HEX })
  // No echoed transaction in this acknowledgement — the return is just the
  // local txid and the node's flag.
  expect(response).toEqual({ txid: TX_ID, result: true })
})

test('passes the acknowledgement fields through (message hex-decoded), never the echoed txid', async () => {
  const { transport } = createMockTransport({
    responses: {
      broadcasthex: {
        response: {
          result: true,
          code: 'SUCCESS',
          // "broadcast ok" — node message fields arrive hex-encoded.
          message: '62726f616463617374206f6b',
          txid: `0${'0'.repeat(63)}`,
          transaction: ECHOED_TX,
        },
      },
    },
  })
  const client = createClient({ transport })
  expect(
    await broadcastHex(client, { serializedTransaction: BROADCAST_HEX }),
  ).toEqual({
    txid: TX_ID,
    result: true,
    code: 'SUCCESS',
    message: 'broadcast ok',
    transaction: ECHOED_TX_PARSED,
  })
})

test('omits an echoed transaction that does not parse as JSON', async () => {
  const { transport } = createMockTransport({
    responses: {
      broadcasthex: {
        response: { result: true, transaction: 'not json {' },
      },
    },
  })
  const client = createClient({ transport })
  const response = await broadcastHex(client, {
    serializedTransaction: BROADCAST_HEX,
  })
  // The echo is informational — a malformed one never fails the broadcast.
  expect(response.txid).toBe(TX_ID)
  expect(response.transaction).toBeUndefined()
})

test('relays bytes the model layer cannot represent untouched', async () => {
  const { transport, bodyOf } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })

  // raw_data carrying an unknown wire field (field 100, varint 1): no JSON
  // model can represent it — exactly the payload broadcasthex exists for.
  const foreignRawData = `${RAW_DATA_HEX}a00601`
  const foreignHex = toBroadcastHex({
    raw_data_hex: foreignRawData,
    signature: [SIG],
  })
  const response = await broadcastHex(client, {
    serializedTransaction: foreignHex,
  })

  // Relayed untouched, txid still computed from the exact raw_data bytes.
  expect(bodyOf('broadcasthex')).toEqual({ transaction: foreignHex })
  expect(response).toEqual({
    txid: sha256(hexToBytes(`0x${foreignRawData}`), 'hex').slice(2),
    result: true,
  })
})

test('throws TronRpcError when the hex carries no signature', async () => {
  const { transport, calls } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })
  await expect(
    broadcastHex(client, {
      serializedTransaction: toBroadcastHex({ raw_data_hex: RAW_DATA_HEX }),
    }),
  ).rejects.toBeInstanceOf(TronRpcError)
  expect(calls).toHaveLength(0)
})

test('refuses hex without a raw_data field', async () => {
  const { transport, calls } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })

  // A signature-only protobuf: field 2 (LEN), no field 1.
  const sigOnly = `1241${SIG}`
  const err = (await broadcastHex(client, {
    serializedTransaction: sigOnly,
  }).catch((e) => e)) as BaseError
  expect(err).toBeInstanceOf(BaseError)
  expect(calls).toHaveLength(0)
})

test('refuses undecodable bytes before any request is sent', async () => {
  const { transport, calls } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })

  // Truncated protobuf: a LEN field-1 header promising 4 bytes, none present.
  await expect(
    broadcastHex(client, { serializedTransaction: '0a04' }),
  ).rejects.toBeInstanceOf(BaseError)
  // Not hex at all.
  await expect(
    broadcastHex(client, { serializedTransaction: 'zz' }),
  ).rejects.toBeInstanceOf(BaseError)
  expect(calls).toHaveLength(0)
})

test('surfaces a broadcast rejection as TronBroadcastError with a decoded message', async () => {
  const { transport } = createMockTransport({
    responses: {
      broadcasthex: { error: rpc('errors/bandwidth-insufficient') },
    },
  })
  const client = createClient({ transport })
  const err = (await broadcastHex(client, {
    serializedTransaction: BROADCAST_HEX,
  }).catch((e) => e)) as TronBroadcastError
  expect(err).toBeInstanceOf(TronBroadcastError)
  expect(err.shortMessage).toContain('Account resource insufficient error.')
})

test('maps an expiration rejection to TransactionExpiredError', async () => {
  const { transport } = createMockTransport({
    responses: {
      broadcasthex: {
        error: {
          result: false,
          code: 'TRANSACTION_EXPIRATION_ERROR',
          message: '5472616e73616374696f6e2065787069726564',
          txid: TX_ID,
        },
      },
    },
  })
  const client = createClient({ transport })
  const error = await broadcastHex(client, {
    serializedTransaction: BROADCAST_HEX,
  }).catch((caught) => caught)
  expect(error).toBeInstanceOf(TransactionExpiredError)
  // The node's own rejection survives as `cause` (as on broadcastTransaction):
  // re-surfacing the expiry must not discard why the node said no.
  expect(error.cause).toBeInstanceOf(TronNodeError)
  expect((error.cause as TronNodeError).code).toBe(
    'TRANSACTION_EXPIRATION_ERROR',
  )
})

test('a rejection whose body carries no `result` key is a TronBroadcastError with the txid', async () => {
  // The body a node sends: a `false` result is left out of the JSON.
  const { transport } = createMockTransport({
    responses: {
      broadcasthex: {
        error: {
          code: 'SIGERROR',
          txid: TX_ID,
          message: '56616c6964617465207369676e6174757265206572726f72',
        },
      },
    },
  })
  const client = createClient({ transport })
  const err = (await broadcastHex(client, {
    serializedTransaction: BROADCAST_HEX,
  }).catch((e) => e)) as TronBroadcastError

  expect(err).toBeInstanceOf(TronBroadcastError)
  expect(err.name).toBe('TronBroadcastError')
  expect(err.code).toBe('SIGERROR')
  expect(err.txid).toBe(TX_ID)
  expect(err.shortMessage).toBe('Validate signature error')
})

test('refuses an empty acknowledgement body instead of resolving', async () => {
  // An LB stub / warming node answers `{}` — neither `result: true` nor any
  // rejection shape. The transaction may never have reached a node, so this
  // must not resolve as a success carrying only the local txid.
  const { transport } = createMockTransport({
    responses: { broadcasthex: { response: {} } },
  })
  const client = createClient({ transport })
  await expect(
    broadcastHex(client, { serializedTransaction: BROADCAST_HEX }),
  ).rejects.toThrow('The node did not acknowledge the broadcast.')
})

test('throws TronRpcError on a `{ result: false }` rejection without a code', async () => {
  const { transport } = createMockTransport({
    responses: { broadcasthex: { response: { result: false } } },
  })
  const client = createClient({ transport })
  await expect(
    broadcastHex(client, { serializedTransaction: BROADCAST_HEX }),
  ).rejects.toBeInstanceOf(TronRpcError)
})

// A broadcast is sent exactly once, even under a retrying transport: re-sending
// a signed tx cannot help (the node dedupes by txID). broadcastHex pins
// retryCount:0 → a single attempt.
test('never retries the broadcast, even when the transport retries', async () => {
  let attempts = 0
  const { transport } = createMockTransport({
    retryCount: 3,
    responses: {
      broadcasthex: {
        fn: () => {
          attempts += 1
          throw new Error('network boom')
        },
      },
    },
  })
  const client = createClient({ transport })
  await expect(
    broadcastHex(client, { serializedTransaction: BROADCAST_HEX }),
  ).rejects.toThrow()
  expect(attempts).toBe(1)
})

test('a frame error names the `serializedTransaction` parameter', async () => {
  const { transport, calls } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })
  const rawDataFrame = toBroadcastHex({ raw_data_hex: RAW_DATA_HEX }).replace(
    /^0x/,
    '',
  )

  for (const [serializedTransaction, message] of [
    // Signature only: field 2 (LEN), no field 1.
    [
      `1241${SIG}`,
      'The transaction hex does not carry a `raw_data` (field 1).',
    ],
    // Field 1 twice.
    [
      `${rawDataFrame}${rawDataFrame}`,
      'The transaction hex does not carry a single well-formed `raw_data` (field 1).',
    ],
    // Field 1 as a varint.
    [
      '0801',
      'The transaction hex does not carry a single well-formed `raw_data` (field 1).',
    ],
    // Field 2 as a varint.
    [
      `${rawDataFrame}1001`,
      'The transaction hex carries a malformed `signature` (field 2).',
    ],
  ] as const) {
    const err = await broadcastHex(client, { serializedTransaction }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(InvalidParameterError)
    expect(err).toMatchObject({
      name: 'InvalidParameterError',
      shortMessage: message,
      param: 'serializedTransaction',
      reason: 'format',
    })
  }
  expect(calls).toHaveLength(0)
})

test('parameters without a `serializedTransaction` are refused before any request', async () => {
  const { transport, calls } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })

  for (const parameters of [
    undefined,
    null,
    BROADCAST_HEX,
    7,
    {},
    { serializedTransaction: undefined },
    { serializedTransaction: null },
    // The former parameter name is not read.
    { transaction: BROADCAST_HEX },
  ]) {
    const error = await broadcastHex(client, parameters as never).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(InvalidParameterError)
    expect(error).toMatchObject({
      name: 'InvalidParameterError',
      shortMessage:
        'Invalid serializedTransaction: expected the signed transaction as a hex string.',
      param: 'serializedTransaction',
      reason: 'type',
    })
  }
  expect(calls).toHaveLength(0)
})

test('the hex is passed as `serializedTransaction`, not `transaction`', async () => {
  const { transport, calls, bodyOf } = createMockTransport({
    responses: { broadcasthex: { response: { result: true } } },
  })
  const client = createClient({ transport })

  await expect(
    // @ts-expect-error — `transaction` does not exist on the parameters.
    broadcastHex(client, { transaction: BROADCAST_HEX }),
  ).rejects.toBeInstanceOf(InvalidParameterError)
  expect(calls).toHaveLength(0)

  // The request body keeps the node's own key for the hex.
  await broadcastHex(client, { serializedTransaction: BROADCAST_HEX })
  expect(bodyOf('broadcasthex')).toEqual({ transaction: BROADCAST_HEX })
})
