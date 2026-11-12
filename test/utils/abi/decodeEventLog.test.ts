import type { Abi } from 'abitype'
import { describe, expect, test } from 'vitest'
import {
  AbiEventSignatureNotFoundError,
  DecodeLogDataMismatchError,
  DecodeLogTopicsMismatchError,
} from '../../../src/errors/abi.js'
import type { Hex } from '../../../src/types/misc.js'
import { decodeEventLog } from '../../../src/utils/abi/decodeEventLog.js'
import { parseEventLogs } from '../../../src/utils/abi/parseEventLogs.js'
import { toEventSelector } from '../../../src/utils/hash/toEventSelector.js'
import {
  type FixtureParameter,
  loadEventFixtures,
  reviveValue,
} from '../../fixtures/abi/loader.js'

const fixtures = loadEventFixtures()

/** Builds the expected name-keyed args from a fixture's `decoded` block. */
function expectedArgs(
  fixture: (typeof fixtures)[number],
): Record<string, unknown> {
  const byName = new Map<string, FixtureParameter>(
    fixture.abi[0]!.inputs.map((input) => [input.name!, input]),
  )
  return Object.fromEntries(
    Object.entries(fixture.decoded).map(([name, value]) => [
      name,
      reviveValue(byName.get(name)!, value),
    ]),
  )
}

describe('decodeEventLog (gold fixtures)', () => {
  test.each(
    fixtures.map((fixture) => [fixture.name, fixture] as const),
  )('%s decodes deep-equal', (_name, fixture) => {
    const { eventName, args } = decodeEventLog({
      abi: fixture.abi as unknown as Abi,
      topics: fixture.topics,
      data: fixture.data,
      eventName: fixture.eventName,
    })
    expect(eventName).toBe(fixture.eventName)
    expect(args).toEqual(expectedArgs(fixture))
  })

  test('covers all 7 gold vectors', () => {
    expect(fixtures.length).toBe(7)
  })
})

describe('decodeEventLog (units)', () => {
  const transfer = fixtures.find((f) => f.name === 'transfer')!

  test('resolves the event from topic0 without an eventName', () => {
    const { eventName, args } = decodeEventLog({
      abi: transfer.abi as unknown as Abi,
      topics: transfer.topics,
      data: transfer.data,
    })
    expect(eventName).toBe('Transfer')
    // Indexed addresses decode to canonical Base58Check (`T…`).
    expect((args as Record<string, unknown>).from).toBe(
      'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC',
    )
    expect((args as Record<string, unknown>).to).toBe(
      'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K',
    )
    expect((args as Record<string, unknown>).value).toBe(1000000n)
  })

  test('indexed dynamic parameters decode to their keccak256 hash hex', () => {
    const memo = fixtures.find((f) => f.name === 'indexed-string')!
    const { args } = decodeEventLog({
      abi: memo.abi as unknown as Abi,
      topics: memo.topics,
      data: memo.data,
      eventName: 'Memo',
    })
    expect((args as Record<string, unknown>).tag).toBe(
      '0xaa73c1da4a1ef9448c89bb344bc368ba7eb1912a01eb6f4e4df9d940b1cf2caa',
    )
  })

  test('throws when non-indexed data is missing', () => {
    expect(() =>
      decodeEventLog({
        abi: transfer.abi as unknown as Abi,
        topics: transfer.topics,
        data: '0x',
        eventName: 'Transfer',
      }),
    ).toThrow(DecodeLogDataMismatchError)
  })

  test('throws when non-indexed data is truncated', () => {
    expect(() =>
      decodeEventLog({
        abi: transfer.abi as unknown as Abi,
        topics: transfer.topics,
        data: '0x0001',
        eventName: 'Transfer',
      }),
    ).toThrow(DecodeLogDataMismatchError)
  })
})

describe('strict: false decodes leniently', () => {
  const transfer = fixtures.find((f) => f.name === 'transfer')!
  const fromAddress = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  const toAddress = 'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K'

  /** The ERC-721 `Transfer` layout — same selector, all three indexed. */
  const nftTransferAbi = [
    {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { indexed: true, name: 'from', type: 'address' },
        { indexed: true, name: 'to', type: 'address' },
        { indexed: true, name: 'tokenId', type: 'uint256' },
      ],
    },
  ] as unknown as Abi

  test('missing data: the indexed parameters still decode', () => {
    const { eventName, args } = decodeEventLog({
      abi: transfer.abi as unknown as Abi,
      topics: transfer.topics,
      data: '0x',
      strict: false,
    })
    expect(eventName).toBe('Transfer')
    expect(args).toEqual({ from: fromAddress, to: toAddress })
  })

  test('truncated data is skipped, not thrown', () => {
    const { args } = decodeEventLog({
      abi: transfer.abi as unknown as Abi,
      topics: transfer.topics,
      data: '0x0001',
      strict: false,
    })
    expect(args).toEqual({ from: fromAddress, to: toAddress })
  })

  test('an indexed parameter with no topic is recovered from data', () => {
    // The ERC-721 layout over an ERC-20-shaped log: `tokenId` has no topic,
    // so its value is decoded out of `data` instead.
    const { args } = decodeEventLog({
      abi: nftTransferAbi,
      topics: transfer.topics,
      data: transfer.data,
      strict: false,
    })
    expect(args).toEqual({
      from: fromAddress,
      to: toAddress,
      tokenId: 1000000n,
    })
  })

  test('an indexed parameter with no topic still throws by default', () => {
    expect(() =>
      decodeEventLog({
        abi: nftTransferAbi,
        topics: transfer.topics,
        data: transfer.data,
      }),
    ).toThrow(DecodeLogTopicsMismatchError)
  })

  test('a recovered indexed parameter declared first is read first', () => {
    // `a` is declared before `b`, so the emitter that skipped indexing laid
    // out `data` as [a, b] — declaration order, which here puts the recovered
    // parameter first.
    const abi = [
      {
        type: 'event',
        name: 'Both',
        inputs: [
          { indexed: true, name: 'a', type: 'uint256' },
          { indexed: false, name: 'b', type: 'uint256' },
        ],
      },
    ] as unknown as Abi
    const word = (n: number) => n.toString(16).padStart(64, '0')
    const { args } = decodeEventLog({
      abi,
      topics: [toEventSelector('Both(uint256,uint256)')],
      data: `0x${word(111)}${word(222)}`,
      strict: false,
    })
    expect(args).toEqual({ a: 111n, b: 222n })
  })

  test('a recovered indexed parameter is read at its declaration position', () => {
    // The emitter declared `trader` non-indexed, so its value sits in `data`
    // in DECLARATION order: amount first, then trader. Hoisting the recovered
    // parameter to the front would decode the amount word as `trader` (a
    // plausible-looking address) and the trader word as `amount`.
    const abi = [
      {
        type: 'event',
        name: 'OrderFilled',
        inputs: [
          { indexed: false, name: 'amount', type: 'uint256' },
          { indexed: true, name: 'trader', type: 'address' },
        ],
      },
    ] as unknown as Abi
    const word = (n: number) => n.toString(16).padStart(64, '0')
    // The transfer fixture's `from` topic doubles as the trader's data word.
    const traderWord = transfer.topics[1]!.slice(2)
    const { args } = decodeEventLog({
      abi,
      topics: [toEventSelector('OrderFilled(uint256,address)')],
      data: `0x${word(1_000_000)}${traderWord}`,
      strict: false,
    })
    expect(args).toEqual({ amount: 1000000n, trader: fromAddress })
  })
})

describe('extra topics are rejected in strict mode', () => {
  const transfer = fixtures.find((f) => f.name === 'transfer')!
  const EXTRA_TOPIC =
    '0x00000000000000000000000000000000000000000000000000000000000004d2'

  test('a log with more argument topics than indexed parameters throws', () => {
    // An ERC-721-shaped log (3 argument topics) decoded with the ERC-20
    // Transfer ABI (2 indexed): the extra topic proves the log is not this
    // event, even though the data alone would decode cleanly.
    expect(() =>
      decodeEventLog({
        abi: transfer.abi as unknown as Abi,
        topics: [...transfer.topics, EXTRA_TOPIC],
        data: transfer.data,
      }),
    ).toThrow(DecodeLogTopicsMismatchError)
  })

  test('the error reports the expected and received topic counts', () => {
    expect(() =>
      decodeEventLog({
        abi: transfer.abi as unknown as Abi,
        topics: [...transfer.topics, EXTRA_TOPIC],
        data: transfer.data,
      }),
    ).toThrow('Expected 2 argument topics')
  })

  test('anonymous events count every topic as an argument topic', () => {
    const abi = [
      {
        type: 'event',
        name: 'Ping',
        anonymous: true,
        inputs: [{ indexed: true, name: 'n', type: 'uint256' }],
      },
    ] as unknown as Abi
    expect(() =>
      decodeEventLog({
        abi,
        eventName: 'Ping',
        topics: [EXTRA_TOPIC, EXTRA_TOPIC],
      }),
    ).toThrow(DecodeLogTopicsMismatchError)
  })

  test('strict: false tolerates the extra topic', () => {
    const { eventName, args } = decodeEventLog({
      abi: transfer.abi as unknown as Abi,
      topics: [...transfer.topics, EXTRA_TOPIC],
      data: transfer.data,
      strict: false,
    })
    expect(eventName).toBe('Transfer')
    expect((args as Record<string, unknown>).value).toBe(1000000n)
  })
})

describe('strict data mismatches are reported as DecodeLogDataMismatchError', () => {
  test('an out-of-bounds tail offset is wrapped, not leaked raw', () => {
    // One 32-byte word holding offset 32 — the dynamic tail it points at is
    // absent, which surfaces as a cursor overrun rather than a size shortfall.
    const abi = [
      {
        type: 'event',
        name: 'Note',
        inputs: [{ indexed: false, name: 'text', type: 'string' }],
      },
    ] as unknown as Abi
    expect(() =>
      decodeEventLog({
        abi,
        topics: [toEventSelector('Note(string)')],
        data: `0x${(32).toString(16).padStart(64, '0')}`,
      }),
    ).toThrow(DecodeLogDataMismatchError)
  })
})

describe('eventName is validated against topic0 (the log identity)', () => {
  const bothAbi = [
    {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { name: 'from', type: 'address', indexed: true },
        { name: 'to', type: 'address', indexed: true },
        { name: 'value', type: 'uint256', indexed: false },
      ],
    },
    {
      type: 'event',
      name: 'Approval',
      inputs: [
        { name: 'owner', type: 'address', indexed: true },
        { name: 'spender', type: 'address', indexed: true },
        { name: 'value', type: 'uint256', indexed: false },
      ],
    },
  ]
  const A1_TOPIC =
    '0x0000000000000000000000007e5f4552091a69125d5dfcb7b8c2659029395bdf'
  const A2_TOPIC =
    '0x0000000000000000000000002b5ad5c4795c026514f8317c7a215e218dccd6cf'
  const TRANSFER_SELECTOR =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  const APPROVAL_SELECTOR =
    '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
  const data =
    '0x000000000000000000000000000000000000000000000000000000000000007b'

  test('a log of a DIFFERENT event never decodes under the given name', () => {
    // topic0 is an Approval selector; naming it 'Transfer' must throw, not
    // silently relabel the log.
    expect(() =>
      decodeEventLog({
        abi: bothAbi as unknown as Abi,
        eventName: 'Transfer',
        topics: [APPROVAL_SELECTOR, A1_TOPIC, A2_TOPIC],
        data,
      }),
    ).toThrow(AbiEventSignatureNotFoundError)
  })

  test('the matching selector decodes under its name', () => {
    const decoded = decodeEventLog({
      abi: bothAbi as unknown as Abi,
      eventName: 'Transfer',
      topics: [TRANSFER_SELECTOR, A1_TOPIC, A2_TOPIC],
      data,
    })
    expect(decoded.eventName).toBe('Transfer')
    expect((decoded.args as { value: bigint }).value).toBe(123n)
  })
})

// The non-indexed write-back must map by POSITION. `nonIndexedInputs` comes
// from `inputs.filter(...)`, so when one AbiParameter object is reused at two
// positions — legal, and natural when an ABI is built from shared parameter
// constants — an identity lookup resolves both occurrences to the first slot.
describe('non-indexed parameters map by position, not object identity', () => {
  const amount = { type: 'uint256' } as const
  const word = (n: number) => n.toString(16).padStart(64, '0')

  test('a reused parameter object still decodes each slot', () => {
    const abi = [
      { type: 'event', name: 'Pair', inputs: [amount, amount] },
    ] as unknown as Abi
    const { args } = decodeEventLog({
      abi,
      topics: [toEventSelector('Pair(uint256,uint256)')],
      data: `0x${word(11)}${word(22)}`,
    })
    // Identity mapping returned [11n, 11n]: the second slot was never read.
    expect(args).toStrictEqual([11n, 22n])
  })

  test('a reused parameter object interleaved with an indexed one', () => {
    const abi = [
      {
        type: 'event',
        name: 'Mixed',
        inputs: [amount, { type: 'address', indexed: true }, amount],
      },
    ] as unknown as Abi
    const holder = '417e5f4552091a69125d5dfcb7b8c2659029395bdf'
    const { args } = decodeEventLog({
      abi,
      topics: [
        toEventSelector('Mixed(uint256,address,uint256)'),
        `0x${'00'.repeat(12)}${holder.slice(2)}`,
      ],
      data: `0x${word(11)}${word(22)}`,
    })
    expect((args as unknown[])[0]).toBe(11n)
    expect((args as unknown[])[2]).toBe(22n)
  })
})

// Events that share one selector and differ only in which inputs are indexed
// (TRC-20 vs TRC-721 `Transfer`): the event a log decodes against exactly is
// the result, whatever the order of the events in the ABI.
describe('events sharing one selector', () => {
  const transfer = fixtures.find((f) => f.name === 'transfer')!
  const from = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  const to = 'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K'
  const [selector, fromTopic, toTopic] = transfer.topics as [Hex, Hex, Hex]
  const word = (n: number) => n.toString(16).padStart(64, '0')

  const trc20Event = {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  } as const
  const trc721Event = {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
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

  /** A TRC-20 transfer of 5: two argument topics, the amount in `data`. */
  const trc20Log = {
    topics: [selector, fromTopic, toTopic],
    data: `0x${word(5)}`,
  } as const
  /** A TRC-721 transfer of token 5: three argument topics, no `data`. */
  const trc721Log = {
    topics: [selector, fromTopic, toTopic, `0x${word(5)}`],
    data: '0x',
  } as const
  /** Only `from` has a topic: neither layout decodes it exactly. */
  const shortLog = {
    topics: [selector, fromTopic],
    data: `${toTopic}${word(5)}`,
  } as const

  const trc20Decoded = {
    eventName: 'Transfer',
    args: { from, to, value: 5n },
  }
  const trc721Decoded = {
    eventName: 'Transfer',
    args: { from, to, tokenId: 5n },
  }

  /** The error `fn` throws, or `undefined` when it returns. */
  const thrown = (fn: () => unknown): unknown => {
    try {
      fn()
    } catch (error) {
      return error
    }
    return undefined
  }

  const orders = [
    ['TRC-20 first', [trc20Event, trc721Event]],
    ['TRC-721 first', [trc721Event, trc20Event]],
  ] as const
  const modes = [undefined, true, false] as const

  describe.each(orders)('%s', (_order, abi) => {
    test.each(
      modes,
    )('strict: %s — each log decodes against its own layout', (strict) => {
      expect(decodeEventLog({ abi, ...trc20Log, strict })).toStrictEqual(
        trc20Decoded,
      )
      expect(decodeEventLog({ abi, ...trc721Log, strict })).toStrictEqual(
        trc721Decoded,
      )
    })

    test.each(
      modes,
    )('strict: %s — eventName selects among the events of that name', (strict) => {
      const withApproval = [approvalEvent, ...abi] as const
      expect(
        decodeEventLog({
          abi: withApproval,
          eventName: 'Transfer',
          ...trc20Log,
          strict,
        }),
      ).toStrictEqual(trc20Decoded)
      expect(
        decodeEventLog({
          abi: withApproval,
          eventName: 'Transfer',
          ...trc721Log,
          strict,
        }),
      ).toStrictEqual(trc721Decoded)
    })

    test('trailing data after the last parameter does not change the layout picked', () => {
      const padded = {
        ...trc20Log,
        data: `${trc20Log.data}${word(9)}`,
      } as const
      expect(decodeEventLog({ abi, ...padded })).toStrictEqual(trc20Decoded)
      expect(decodeEventLog({ abi, ...padded, strict: false })).toStrictEqual(
        trc20Decoded,
      )
    })

    test('no layout decodes exactly: strict throws the mismatch of the first event', () => {
      const first = abi[0]
      const error = thrown(() => decodeEventLog({ abi, ...shortLog }))
      expect(error).toBeInstanceOf(DecodeLogTopicsMismatchError)
      expect((error as DecodeLogTopicsMismatchError).abiItem).toBe(first)
      // The same error as decoding against the first event alone.
      const alone = thrown(() => decodeEventLog({ abi: [first], ...shortLog }))
      expect((error as Error).message).toBe((alone as Error).message)
    })

    test('no layout decodes exactly: strict: false decodes leniently against the first event', () => {
      expect(decodeEventLog({ abi, ...shortLog, strict: false })).toStrictEqual(
        decodeEventLog({ abi: [abi[0]], ...shortLog, strict: false }),
      )
    })

    test('strict: false still throws for a malformed topic', () => {
      const malformed = { topics: [selector, '0xdead'], data: '0x' } as const
      expect(() => decodeEventLog({ abi, ...malformed })).toThrow()
      expect(() =>
        decodeEventLog({ abi, ...malformed, strict: false }),
      ).toThrow()
    })
  })

  test('TRC-721 first, TRC-20 log: the amount is decoded as `value` in both modes', () => {
    const abi = [trc721Event, trc20Event] as const
    expect(decodeEventLog({ abi, ...trc20Log })).toStrictEqual(trc20Decoded)
    expect(decodeEventLog({ abi, ...trc20Log, strict: false })).toStrictEqual(
      trc20Decoded,
    )
  })

  test('TRC-20 first, TRC-721 log: the token is decoded as `tokenId` in both modes', () => {
    const abi = [trc20Event, trc721Event] as const
    expect(decodeEventLog({ abi, ...trc721Log })).toStrictEqual(trc721Decoded)
    expect(decodeEventLog({ abi, ...trc721Log, strict: false })).toStrictEqual(
      trc721Decoded,
    )
  })

  test('the lenient fallback follows the ABI order', () => {
    expect(
      decodeEventLog({
        abi: [trc20Event, trc721Event],
        ...shortLog,
        strict: false,
      }).args,
    ).toStrictEqual({ from, to, value: 5n })
    expect(
      decodeEventLog({
        abi: [trc721Event, trc20Event],
        ...shortLog,
        strict: false,
      }).args,
    ).toStrictEqual({ from, to, tokenId: 5n })
  })

  test('a single event keeps its mismatch in strict mode and its partial decode otherwise', () => {
    expect(() => decodeEventLog({ abi: [trc721Event], ...trc20Log })).toThrow(
      DecodeLogTopicsMismatchError,
    )
    expect(
      decodeEventLog({ abi: [trc721Event], ...trc20Log, strict: false }),
    ).toStrictEqual(trc721Decoded)
    expect(() => decodeEventLog({ abi: [trc20Event], ...trc721Log })).toThrow(
      DecodeLogTopicsMismatchError,
    )
  })

  test('eventName still validates topic0 against the events of that name', () => {
    const abi = [trc721Event, trc20Event, approvalEvent] as const
    expect(() =>
      decodeEventLog({ abi, eventName: 'Approval', ...trc20Log }),
    ).toThrow(AbiEventSignatureNotFoundError)
    expect(() =>
      decodeEventLog({
        abi,
        eventName: 'Approval',
        ...trc20Log,
        strict: false,
      }),
    ).toThrow(AbiEventSignatureNotFoundError)
  })

  test('events of one name with different selectors resolve by topic0', () => {
    const shortTransfer = {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { indexed: true, name: 'to', type: 'address' },
        { indexed: false, name: 'value', type: 'uint256' },
      ],
    } as const
    for (const abi of [
      [shortTransfer, trc721Event, trc20Event],
      [trc20Event, trc721Event, shortTransfer],
    ] as const) {
      expect(
        decodeEventLog({ abi, eventName: 'Transfer', ...trc20Log }),
      ).toStrictEqual(trc20Decoded)
      expect(
        decodeEventLog({
          abi,
          eventName: 'Transfer',
          topics: [toEventSelector('Transfer(address,uint256)'), toTopic],
          data: `0x${word(5)}`,
        }),
      ).toStrictEqual({ eventName: 'Transfer', args: { to, value: 5n } })
    }
  })

  test('anonymous events sharing a name resolve to the first of them', () => {
    const anonymous = (name: string, indexed: boolean) =>
      ({
        type: 'event',
        name: 'Ping',
        anonymous: true,
        inputs: [{ indexed, name, type: 'uint256' }],
      }) as const
    const byTopic = anonymous('fromTopic', true)
    const byData = anonymous('fromData', false)
    const log = { topics: [`0x${word(5)}`], data: `0x${word(7)}` } as const
    expect(
      decodeEventLog({ abi: [byTopic, byData], eventName: 'Ping', ...log })
        .args,
    ).toStrictEqual({ fromTopic: 5n })
    expect(() =>
      decodeEventLog({ abi: [byData, byTopic], eventName: 'Ping', ...log }),
    ).toThrow(DecodeLogTopicsMismatchError)
  })

  describe('the events compared past the first one of the selector', () => {
    /** An event that counts how often its inputs are read. */
    const counted = (name: string) => {
      const event = {
        type: 'event',
        name,
        reads: 0,
        get inputs() {
          event.reads++
          return [{ indexed: false, name: 'a', type: 'uint256' }]
        },
      }
      return event
    }

    test('only the events of its name are', () => {
      const [before, between, after] = [
        counted('Mint'),
        counted('Approval'),
        counted('Burn'),
      ]
      const abi = [
        before,
        trc20Event,
        between,
        trc721Event,
        after,
      ] as unknown as Abi
      expect(decodeEventLog({ abi, ...trc20Log })).toStrictEqual(trc20Decoded)
      expect(decodeEventLog({ abi, ...trc721Log })).toStrictEqual(trc721Decoded)
      expect(before.reads).toBeGreaterThan(0)
      expect(between.reads).toBe(0)
      expect(after.reads).toBe(0)
    })

    test.each([
      ['inputs that are not a list', { name: 'Bad', inputs: 'abc' }],
      ['a name that forms no signature', { name: 'Bad(', inputs: [] }],
      ['the same name, inputs not a list', { name: 'Transfer', inputs: 'abc' }],
    ])('an item with %s is not one of them', (_label, item) => {
      const malformed = { type: 'event', ...item }
      for (const eventName of [undefined, 'Transfer']) {
        expect(
          decodeEventLog({
            abi: [trc20Event, malformed] as unknown as Abi,
            eventName,
            ...trc20Log,
          }),
        ).toStrictEqual(trc20Decoded)
        // The events after it are still compared.
        expect(
          decodeEventLog({
            abi: [trc20Event, malformed, trc721Event] as unknown as Abi,
            eventName,
            ...trc721Log,
          }),
        ).toStrictEqual(trc721Decoded)
      }
    })
  })

  describe('parity with parseEventLogs', () => {
    describe.each(orders)('%s', (_order, abi) => {
      test.each([
        true,
        false,
      ])('strict: %s — both give the same eventName / args', (strict) => {
        for (const log of [trc20Log, trc721Log]) {
          const [parsed] = parseEventLogs({ abi, logs: [log], strict })
          const decoded = decodeEventLog({ abi, ...log, strict })
          expect({
            eventName: parsed?.eventName,
            args: parsed?.args,
          }).toStrictEqual(decoded)
        }
        expect(
          parseEventLogs({ abi, logs: [trc20Log, trc721Log], strict }).map(
            ({ eventName, args }) => ({ eventName, args }),
          ),
        ).toStrictEqual([trc20Decoded, trc721Decoded])
      })

      test('a log no layout decodes exactly: dropped / thrown in strict mode, the same partial decode otherwise', () => {
        expect(parseEventLogs({ abi, logs: [shortLog] })).toEqual([])
        expect(() => decodeEventLog({ abi, ...shortLog })).toThrow(
          DecodeLogTopicsMismatchError,
        )
        const [parsed] = parseEventLogs({
          abi,
          logs: [shortLog],
          strict: false,
        })
        expect({
          eventName: parsed?.eventName,
          args: parsed?.args,
        }).toStrictEqual(decodeEventLog({ abi, ...shortLog, strict: false }))
      })
    })
  })
})
