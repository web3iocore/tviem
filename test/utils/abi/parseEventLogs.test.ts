import type { Abi } from 'abitype'
import { describe, expect, test } from 'vitest'
import { getLogs, type Log } from '../../../src/actions/public/getLogs.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import type { Hex } from '../../../src/types/misc.js'
import type { TransactionLog } from '../../../src/types/transaction.js'
import { parseEventLogs } from '../../../src/utils/abi/parseEventLogs.js'
import { toEventSelector } from '../../../src/utils/hash/toEventSelector.js'
import { loadEventFixtures } from '../../fixtures/abi/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'

const emitter = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs'
const emitterEvm = '0x42a1e39aefa49290f2b3f9ed688d7cecf86cd6e0'
const from = 'TCHqEXgJzVv4X5mv4PNsFzD666wswQ2YkQ'
const to = 'TTopo6cMBAReiVe11nYcbPj6HqsJrtpmFg'

const transferEvent = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

const approvalEvent = {
  type: 'event',
  name: 'Approval',
  inputs: [
    { indexed: true, name: 'owner', type: 'address' },
    { indexed: true, name: 'spender', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

/** The ERC-721 `Transfer` layout — same selector as ERC-20, all indexed. */
const nftTransferEvent = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: true, name: 'tokenId', type: 'uint256' },
  ],
} as const

const transferTopic =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const approvalTopic =
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
const fromTopic =
  '0x0000000000000000000000001975fbea3496424a88de2a147d76baa34a3d1b93'
const toTopic =
  '0x000000000000000000000000c3abfbceb364febe625662a9af6add366df58f81'

const word = (n: number) => n.toString(16).padStart(64, '0')

/** The getLogs doc example: `Transfer(from, to, 7561729)` emitted by `emitter`. */
const transferLog: Log = {
  address: emitter,
  blockHash:
    '0x0000000003e8a947c68442f90bb271d2f7b1b8bb86f6a78a1d4f2d53ab92d81d',
  blockNumber: 65_579_335n,
  blockTimestamp: 1_780_912_191n,
  data: '0x0000000000000000000000000000000000000000000000000000000000736201',
  logIndex: 0,
  removed: false,
  topics: [transferTopic, fromTopic, toTopic],
  transactionHash:
    '0xba60eb123d557f6b9ffefae573499b9d65ee15430a55b24cb28ef4ab2118f814',
  transactionIndex: 1,
}

/** The same owner / spender / amount words under the `Approval` selector. */
const approvalLog: Log = {
  ...transferLog,
  logIndex: 1,
  topics: [approvalTopic, fromTopic, toTopic],
}

/** An ERC-721 Transfer: the third parameter is a topic and `data` is empty. */
const nftLog: Log = {
  ...transferLog,
  logIndex: 2,
  data: '0x',
  topics: [transferTopic, fromTopic, toTopic, `0x${word(42)}`],
}

/** `data` is empty, so `value` cannot be decoded. */
const truncatedLog: Log = { ...transferLog, data: '0x' }

/** A selector that belongs to none of the events above. */
const unknownLog: Log = { ...transferLog, topics: [`0x${'ab'.repeat(32)}`] }

describe('decodes the logs of getLogs', () => {
  test.each([
    true,
    false,
  ])('matches uppercase topic0 with strict %s', (strict) => {
    const topic0 = `0x${transferTopic.slice(2).toUpperCase()}` as const
    const log = {
      ...transferLog,
      topics: [topic0, fromTopic, toTopic] as const,
    }

    expect(
      parseEventLogs({ abi: [transferEvent], logs: [log], strict }),
    ).toStrictEqual([
      { ...log, eventName: 'Transfer', args: { from, to, value: 7_561_729n } },
    ])
  })

  test('keeps the log fields and adds eventName / args', () => {
    const logs = parseEventLogs({ abi: [transferEvent], logs: [transferLog] })
    expect(logs).toStrictEqual([
      {
        ...transferLog,
        eventName: 'Transfer',
        // Addresses decode to Base58Check, integers to bigint.
        args: { from, to, value: 7_561_729n },
      },
    ])
  })

  test('decodes each log against its own event, in input order', () => {
    const logs = parseEventLogs({
      abi: [transferEvent, approvalEvent],
      logs: [approvalLog, transferLog],
    })
    expect(logs).toStrictEqual([
      {
        ...approvalLog,
        eventName: 'Approval',
        args: { owner: from, spender: to, value: 7_561_729n },
      },
      {
        ...transferLog,
        eventName: 'Transfer',
        args: { from, to, value: 7_561_729n },
      },
    ])
  })

  test('replaces an eventName / args already carried by the input log', () => {
    const stale = { ...transferLog, eventName: 'Stale', args: { stale: true } }
    const [log] = parseEventLogs({ abi: [transferEvent], logs: [stale] })
    expect(log?.eventName).toBe('Transfer')
    expect(log?.args).toStrictEqual({ from, to, value: 7_561_729n })
  })

  test('ignores the non-event items of the ABI', () => {
    const abi = [
      { type: 'function', name: 'Transfer', inputs: [], outputs: [] },
      transferEvent,
    ] as unknown as Abi
    const logs = parseEventLogs({ abi, logs: [transferLog] })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.eventName).toBe('Transfer')
  })
})

describe('decodes the logs of a transaction info', () => {
  const transfer = loadEventFixtures().find((f) => f.name === 'transfer')!

  test('keeps address / topics / data and adds eventName / args', () => {
    const receiptLog: TransactionLog = {
      address: emitter,
      topics: transfer.topics,
      data: transfer.data,
    }
    const logs = parseEventLogs({
      abi: transfer.abi as unknown as Abi,
      logs: [receiptLog],
    })
    expect(logs).toStrictEqual([
      {
        address: emitter,
        topics: transfer.topics,
        data: transfer.data,
        eventName: 'Transfer',
        args: {
          from: 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC',
          to: 'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K',
          value: 1000000n,
        },
      },
    ])
  })

  test('a log without an address gains no address key', () => {
    const receiptLog: TransactionLog = {
      topics: transferLog.topics,
      data: transferLog.data,
    }
    const logs = parseEventLogs({ abi: [transferEvent], logs: [receiptLog] })
    expect(logs).toStrictEqual([
      {
        topics: transferLog.topics,
        data: transferLog.data,
        eventName: 'Transfer',
        args: { from, to, value: 7_561_729n },
      },
    ])
  })
})

describe('logs outside the ABI', () => {
  test('a selector matching none of the events is dropped in both modes', () => {
    const logs = [approvalLog, unknownLog]
    expect(parseEventLogs({ abi: [transferEvent], logs })).toEqual([])
    expect(
      parseEventLogs({ abi: [transferEvent], logs, strict: false }),
    ).toEqual([])
  })

  test('a log without topics is dropped in both modes', () => {
    const logs = [{ ...transferLog, topics: [] }]
    expect(parseEventLogs({ abi: [transferEvent], logs })).toEqual([])
    expect(
      parseEventLogs({ abi: [transferEvent], logs, strict: false }),
    ).toEqual([])
  })

  test('only the matching logs of a mixed list are kept', () => {
    const logs = parseEventLogs({
      abi: [transferEvent],
      logs: [unknownLog, transferLog, approvalLog],
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.logIndex).toBe(0)
  })

  test('an ABI without events returns no logs', () => {
    expect(parseEventLogs({ abi: [], logs: [transferLog] })).toEqual([])
  })

  test('an empty log list returns an empty list', () => {
    expect(parseEventLogs({ abi: [transferEvent], logs: [] })).toEqual([])
    expect(
      parseEventLogs({ abi: [transferEvent], logs: [], strict: false }),
    ).toEqual([])
  })
})

describe('eventName restricts the considered events', () => {
  const abi = [transferEvent, approvalEvent] as const
  const logs = [transferLog, approvalLog]

  test('without eventName every event of the ABI is considered', () => {
    const parsed = parseEventLogs({ abi, logs })
    expect(parsed.map((log) => log.eventName)).toEqual(['Transfer', 'Approval'])
  })

  test('a single name', () => {
    const parsed = parseEventLogs({ abi, logs, eventName: 'Approval' })
    expect(parsed).toStrictEqual([
      {
        ...approvalLog,
        eventName: 'Approval',
        args: { owner: from, spender: to, value: 7_561_729n },
      },
    ])
  })

  test('a list of names', () => {
    const one = parseEventLogs({ abi, logs, eventName: ['Transfer'] })
    expect(one.map((log) => log.eventName)).toEqual(['Transfer'])

    const both = parseEventLogs({
      abi,
      logs,
      eventName: ['Approval', 'Transfer'],
    })
    // The result follows the order of `logs`, not of `eventName`.
    expect(both.map((log) => log.eventName)).toEqual(['Transfer', 'Approval'])
  })

  test('an empty list considers no event', () => {
    expect(parseEventLogs({ abi, logs, eventName: [] })).toEqual([])
  })

  test('a name covers every overload sharing it', () => {
    const parsed = parseEventLogs({
      abi: [transferEvent, nftTransferEvent, approvalEvent],
      logs: [transferLog, nftLog, approvalLog],
      eventName: 'Transfer',
    })
    expect(parsed.map((log) => log.args)).toStrictEqual([
      { from, to, value: 7_561_729n },
      { from, to, tokenId: 42n },
    ])
  })
})

describe('strict', () => {
  test('defaults to true: a log that does not decode exactly is dropped', () => {
    expect(
      parseEventLogs({ abi: [transferEvent], logs: [truncatedLog] }),
    ).toEqual([])
    expect(
      parseEventLogs({
        abi: [transferEvent],
        logs: [truncatedLog],
        strict: true,
      }),
    ).toEqual([])
    // A log with more argument topics than indexed inputs is not exact either.
    expect(parseEventLogs({ abi: [transferEvent], logs: [nftLog] })).toEqual([])
  })

  test('strict: false returns it partially decoded', () => {
    const logs = parseEventLogs({
      abi: [transferEvent],
      logs: [truncatedLog],
      strict: false,
    })
    expect(logs).toStrictEqual([
      { ...truncatedLog, eventName: 'Transfer', args: { from, to } },
    ])
  })

  test('strict: false still decodes exact logs fully', () => {
    const logs = parseEventLogs({
      abi: [transferEvent],
      logs: [transferLog, truncatedLog],
      strict: false,
    })
    expect(logs.map((log) => log.args)).toStrictEqual([
      { from, to, value: 7_561_729n },
      { from, to },
    ])
  })

  test('strict: false recovers a missing indexed parameter from data', () => {
    // An ERC-20-shaped log read through the ERC-721 layout: `tokenId` has no
    // topic, so its value is decoded out of `data` instead.
    const lenient = parseEventLogs({
      abi: [nftTransferEvent],
      logs: [transferLog],
      strict: false,
    })
    expect(lenient[0]?.args).toStrictEqual({ from, to, tokenId: 7_561_729n })
    expect(
      parseEventLogs({ abi: [nftTransferEvent], logs: [transferLog] }),
    ).toEqual([])
  })

  test('strict: false with nothing recoverable carries args: undefined', () => {
    const selectorOnly = { ...transferLog, topics: [transferTopic], data: '0x' }
    const logs = parseEventLogs({
      abi: [transferEvent],
      logs: [selectorOnly as Log],
      strict: false,
    })
    expect(logs).toStrictEqual([
      { ...selectorOnly, eventName: 'Transfer', args: undefined },
    ])
  })

  test('strict: false keeps the name and an empty args container when the topics fail to decode', () => {
    // An undersized argument topic fails to decode even leniently.
    const badTopic: Log = { ...transferLog, topics: [transferTopic, '0xdead'] }
    const named = parseEventLogs({
      abi: [transferEvent],
      logs: [badTopic],
      strict: false,
    })
    expect(named).toStrictEqual([
      { ...badTopic, eventName: 'Transfer', args: {} },
    ])
    expect(parseEventLogs({ abi: [transferEvent], logs: [badTopic] })).toEqual(
      [],
    )

    // Unnamed inputs get the positional container.
    const pingEvent = {
      type: 'event',
      name: 'Ping',
      inputs: [{ indexed: true, type: 'bool' }],
    } as const
    const pingLog: Log = {
      ...transferLog,
      topics: [toEventSelector('Ping(bool)'), '0xdead'],
      data: '0x',
    }
    const unnamed = parseEventLogs({
      abi: [pingEvent],
      logs: [pingLog],
      strict: false,
    })
    expect(unnamed).toStrictEqual([{ ...pingLog, eventName: 'Ping', args: [] }])
  })
})

describe('events sharing one selector', () => {
  test('each log decodes against the candidate that matches it exactly', () => {
    const expected = [
      { from, to, value: 7_561_729n },
      { from, to, tokenId: 42n },
    ]
    const logs = parseEventLogs({
      abi: [transferEvent, nftTransferEvent],
      logs: [transferLog, nftLog],
    })
    expect(logs.map((log) => log.args)).toStrictEqual(expected)

    // The order of the candidates in the ABI does not matter.
    const reversed = parseEventLogs({
      abi: [nftTransferEvent, transferEvent],
      logs: [transferLog, nftLog],
    })
    expect(reversed.map((log) => log.args)).toStrictEqual(expected)
  })

  test('strict: false does not relabel a log another candidate decodes exactly', () => {
    const logs = parseEventLogs({
      abi: [nftTransferEvent, transferEvent],
      logs: [transferLog, nftLog],
      strict: false,
    })
    expect(logs.map((log) => log.args)).toStrictEqual([
      { from, to, value: 7_561_729n },
      { from, to, tokenId: 42n },
    ])
  })

  test('strict: false falls back to the first candidate of the ABI', () => {
    // Only `from` has a topic; `data` carries two words. Neither layout
    // decodes exactly, so the first one of the ABI labels the two words.
    const short: Log = {
      ...transferLog,
      topics: [transferTopic, fromTopic],
      data: `${toTopic}${transferLog.data.slice(2)}`,
    }
    const erc20First = parseEventLogs({
      abi: [transferEvent, nftTransferEvent],
      logs: [short],
      strict: false,
    })
    expect(erc20First[0]?.args).toStrictEqual({ from, to, value: 7_561_729n })

    const erc721First = parseEventLogs({
      abi: [nftTransferEvent, transferEvent],
      logs: [short],
      strict: false,
    })
    expect(erc721First[0]?.args).toStrictEqual({
      from,
      to,
      tokenId: 7_561_729n,
    })

    expect(
      parseEventLogs({
        abi: [transferEvent, nftTransferEvent],
        logs: [short],
      }),
    ).toEqual([])
  })
})

describe('unnamed inputs give positional args', () => {
  test('all inputs unnamed', () => {
    const pairEvent = {
      type: 'event',
      name: 'Pair',
      inputs: [{ type: 'uint256' }, { type: 'uint256' }],
    } as const
    const log: TransactionLog = {
      topics: [toEventSelector('Pair(uint256,uint256)')],
      data: `0x${word(11)}${word(22)}`,
    }
    const logs = parseEventLogs({ abi: [pairEvent], logs: [log] })
    expect(logs).toStrictEqual([
      { ...log, eventName: 'Pair', args: [11n, 22n] },
    ])
  })

  test('one unnamed input makes the whole args positional', () => {
    const mixedEvent = {
      type: 'event',
      name: 'Mixed',
      inputs: [
        { type: 'uint256', name: 'amount' },
        { type: 'address', indexed: true },
        { type: 'uint256', name: 'fee' },
      ],
    } as const
    const log: TransactionLog = {
      topics: [toEventSelector('Mixed(uint256,address,uint256)'), fromTopic],
      data: `0x${word(11)}${word(22)}`,
    }
    const logs = parseEventLogs({ abi: [mixedEvent], logs: [log] })
    expect(logs[0]?.args).toStrictEqual([11n, from, 22n])
  })

  test('strict: false leaves the undecoded positions empty', () => {
    const mixedEvent = {
      type: 'event',
      name: 'Mixed',
      inputs: [
        { type: 'uint256' },
        { type: 'address', indexed: true },
        { type: 'uint256' },
      ],
    } as const
    const log: TransactionLog = {
      topics: [toEventSelector('Mixed(uint256,address,uint256)'), fromTopic],
      data: '0x',
    }
    const [parsed] = parseEventLogs({
      abi: [mixedEvent],
      logs: [log],
      strict: false,
    })
    const args = parsed?.args as readonly unknown[]
    expect(args).toHaveLength(2)
    expect(args[0]).toBeUndefined()
    expect(args[1]).toBe(from)
  })
})

describe('an event without inputs', () => {
  const pausedEvent = { type: 'event', name: 'Paused', inputs: [] } as const
  const pausedLog: TransactionLog = {
    topics: [toEventSelector('Paused()')],
    data: '0x',
  }

  test('carries args: undefined in both modes', () => {
    const expected = [{ ...pausedLog, eventName: 'Paused', args: undefined }]
    expect(
      parseEventLogs({ abi: [pausedEvent], logs: [pausedLog] }),
    ).toStrictEqual(expected)
    expect(
      parseEventLogs({ abi: [pausedEvent], logs: [pausedLog], strict: false }),
    ).toStrictEqual(expected)
  })

  test('strict drops it when it carries an argument topic', () => {
    const extra: TransactionLog = {
      ...pausedLog,
      topics: [pausedLog.topics[0]!, fromTopic],
    }
    expect(parseEventLogs({ abi: [pausedEvent], logs: [extra] })).toEqual([])
    expect(
      parseEventLogs({ abi: [pausedEvent], logs: [extra], strict: false }),
    ).toStrictEqual([{ ...extra, eventName: 'Paused', args: undefined }])
  })
})

describe('indexed parameters of a hashed type', () => {
  test('decode to the 32-byte topic', () => {
    const memo = loadEventFixtures().find((f) => f.name === 'indexed-string')!
    const [log] = parseEventLogs({
      abi: memo.abi as unknown as Abi,
      logs: [{ topics: memo.topics, data: memo.data }],
    })
    expect(log?.eventName).toBe('Memo')
    expect((log?.args as Record<string, unknown>).tag).toBe(
      '0xaa73c1da4a1ef9448c89bb344bc368ba7eb1912a01eb6f4e4df9d940b1cf2caa',
    )
  })
})

describe('anonymous events', () => {
  const anonymousEvent = {
    type: 'event',
    name: 'Ping',
    anonymous: true,
    inputs: [{ indexed: true, name: 'n', type: 'uint256' }],
  } as const
  const pingSelector = toEventSelector('Ping(uint256)')

  /** A real anonymous log: no selector, the first topic is the argument. */
  const anonymousLog: Log = {
    ...transferLog,
    topics: [`0x${word(5)}`],
    data: '0x',
  }
  /** A log whose first topic equals the event's signature hash. */
  const selectorLog: Log = {
    ...transferLog,
    topics: [pingSelector, `0x${word(5)}`],
    data: '0x',
  }

  test('a log without the selector topic is dropped in both modes', () => {
    expect(
      parseEventLogs({ abi: [anonymousEvent], logs: [anonymousLog] }),
    ).toEqual([])
    expect(
      parseEventLogs({
        abi: [anonymousEvent],
        logs: [anonymousLog],
        strict: false,
      }),
    ).toEqual([])
  })

  test('a log carrying the signature hash: strict drops it, strict: false keeps the name with empty args', () => {
    expect(
      parseEventLogs({ abi: [anonymousEvent], logs: [selectorLog] }),
    ).toEqual([])
    expect(
      parseEventLogs({
        abi: [anonymousEvent],
        logs: [selectorLog],
        strict: false,
      }),
    ).toStrictEqual([{ ...selectorLog, eventName: 'Ping', args: {} }])
  })

  test('getLogs gives the same result for the same logs', async () => {
    // The raw (RPC) form of the two logs above.
    const toRaw = (log: Log) => ({
      address: emitterEvm,
      blockHash: log.blockHash,
      blockNumber: '0x3e8a947',
      blockTimestamp: '0x6a26903f',
      data: log.data,
      logIndex: '0x0',
      removed: false,
      topics: log.topics,
      transactionHash: log.transactionHash,
      transactionIndex: '0x1',
    })
    const fetch = async (strict: boolean) => {
      const { transport } = createMockTransport({
        responses: {
          '/jsonrpc': {
            response: {
              jsonrpc: '2.0',
              id: 1,
              result: [toRaw(anonymousLog), toRaw(selectorLog)],
            },
          },
        },
      })
      // The raw `topics` filter keeps the request independent of the event.
      const client = createPublicClient({ transport })
      const plain = await getLogs(client, { topics: [] })
      const decoded = await getLogs(client, {
        events: [anonymousEvent],
        strict,
      })
      return { plain, decoded }
    }

    for (const strict of [true, false]) {
      const { plain, decoded } = await fetch(strict)
      expect(decoded).toEqual(
        parseEventLogs({ abi: [anonymousEvent], logs: plain, strict }),
      )
    }
    expect((await fetch(true)).decoded).toEqual([])
    expect((await fetch(false)).decoded).toEqual([
      { ...selectorLog, eventName: 'Ping', args: {} },
    ])
  })
})

describe('the input is left untouched', () => {
  test('logs are neither mutated nor returned by reference', () => {
    const input = [
      { ...transferLog, topics: [...transferLog.topics] as Hex[] },
      { ...truncatedLog, topics: [...truncatedLog.topics] as Hex[] },
      { ...unknownLog, topics: [...unknownLog.topics] as Hex[] },
    ]
    const snapshot = structuredClone(input)

    const logs = parseEventLogs({
      abi: [transferEvent],
      logs: input,
      strict: false,
    })

    expect(input).toStrictEqual(snapshot)
    expect(logs).toHaveLength(2)
    expect(logs[0]).not.toBe(input[0])
    expect(logs[1]).not.toBe(input[1])
    expect('eventName' in input[0]!).toBe(false)
    expect('args' in input[0]!).toBe(false)
  })

  test('frozen logs and a frozen list are accepted', () => {
    const frozen = Object.freeze([
      Object.freeze({
        ...transferLog,
        topics: Object.freeze([...transferLog.topics]),
      }),
    ])
    const logs = parseEventLogs({ abi: [transferEvent], logs: frozen })
    expect(logs[0]?.args).toStrictEqual({ from, to, value: 7_561_729n })
  })
})
