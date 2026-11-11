// Type-surface tests for `parseEventLogs`: each parsed log is the input log's
// own fields plus the `eventName` / `args` inferred from a literal `abi`.
import type { Abi } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import type { Log } from '../../../src/actions/public/getLogs.js'
import type { Address } from '../../../src/types/address.js'
import type { Hex } from '../../../src/types/misc.js'
import type {
  TransactionInfo,
  TransactionLog,
} from '../../../src/types/transaction.js'
import type { Prettify } from '../../../src/types/utils.js'
import {
  type ParseEventLogsParameters,
  type ParseEventLogsReturnType,
  parseEventLogs,
} from '../../../src/utils/abi/parseEventLogs.js'

const abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'spender', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Note',
    inputs: [
      { indexed: true, name: 'label', type: 'string' },
      { indexed: false, type: 'uint256' },
    ],
  },
  { type: 'event', name: 'Ping', inputs: [] },
] as const

const transactionLogs = [] as readonly TransactionLog[]
const logs = [] as Log[]

type TransferArgs = { from: Address; to: Address; value: bigint }
type ApprovalArgs = { owner: Address; spender: Address; value: bigint }

test('TransactionLog input: the log fields are kept, strict by default', () => {
  const parsed = parseEventLogs({ abi, logs: transactionLogs })
  expectTypeOf(parsed).toEqualTypeOf<
    ParseEventLogsReturnType<typeof abi, undefined, true, TransactionLog>
  >()

  const log = parsed[0]!
  // The input log's own fields.
  expectTypeOf(log.address).toEqualTypeOf<Address | undefined>()
  expectTypeOf(log.topics).toEqualTypeOf<readonly Hex[]>()
  expectTypeOf(log.data).toEqualTypeOf<Hex>()
  // One member per event of the ABI; the function contributes none.
  expectTypeOf(log.eventName).toEqualTypeOf<
    'Transfer' | 'Approval' | 'Note' | 'Ping'
  >()

  if (log.eventName === 'Transfer') {
    expectTypeOf(log).toEqualTypeOf<{
      address?: Address | undefined
      topics: readonly Hex[]
      data: Hex
      eventName: 'Transfer'
      args: TransferArgs
    }>()
    expectTypeOf(log.args.from).toEqualTypeOf<Address>()
    expectTypeOf(log.args.value).toEqualTypeOf<bigint>()
  }
  if (log.eventName === 'Approval')
    expectTypeOf(log.args).toEqualTypeOf<ApprovalArgs>()
  // An unnamed input makes the args positional; the indexed string is its topic.
  if (log.eventName === 'Note')
    expectTypeOf(log.args).toEqualTypeOf<readonly [Hex, bigint]>()
  // No inputs: nothing is decoded.
  if (log.eventName === 'Ping')
    expectTypeOf(log.args).toEqualTypeOf<undefined>()

  // The logs of a transaction's info are accepted as they are.
  const info = {} as TransactionInfo
  expectTypeOf(parseEventLogs({ abi, logs: info.logs })).toEqualTypeOf<
    typeof parsed
  >()
})

test('Log input: the getLogs fields are kept, eventName / args replaced', () => {
  const parsed = parseEventLogs({ abi, logs })
  const log = parsed[0]!
  expectTypeOf(log.address).toEqualTypeOf<Address>()
  expectTypeOf(log.blockNumber).toEqualTypeOf<bigint>()
  expectTypeOf(log.blockTimestamp).toEqualTypeOf<bigint | undefined>()
  expectTypeOf(log.logIndex).toEqualTypeOf<number>()
  expectTypeOf(log.removed).toEqualTypeOf<boolean>()
  expectTypeOf(log.transactionHash).toEqualTypeOf<Hex>()
  // The decoded fields replace the plain Log's optional, untyped ones.
  expectTypeOf(log.eventName).toEqualTypeOf<
    'Transfer' | 'Approval' | 'Note' | 'Ping'
  >()
  if (log.eventName === 'Transfer') {
    expectTypeOf(log.args).toEqualTypeOf<TransferArgs>()
    expectTypeOf(log).toEqualTypeOf<
      Prettify<
        Omit<Log, 'eventName' | 'args'> & {
          eventName: 'Transfer'
          args: TransferArgs
        }
      >
    >()
  }

  // Logs already typed by getLogs can be parsed again against another ABI.
  const typed = [] as Log<(typeof abi)[2]>[]
  const reparsed = parseEventLogs({ abi, logs: typed, eventName: 'Transfer' })
  expectTypeOf(reparsed[0]!.eventName).toEqualTypeOf<'Transfer'>()
  expectTypeOf(reparsed[0]!.args).toEqualTypeOf<TransferArgs>()
  expectTypeOf(reparsed[0]!.blockHash).toEqualTypeOf<Hex>()
})

test('any log carrying topics and data is accepted', () => {
  const custom = [] as { topics: readonly Hex[]; data: Hex; tag: 'mine' }[]
  const parsed = parseEventLogs({ abi, logs: custom, eventName: 'Approval' })
  expectTypeOf(parsed).toEqualTypeOf<
    {
      topics: readonly Hex[]
      data: Hex
      tag: 'mine'
      eventName: 'Approval'
      args: ApprovalArgs
    }[]
  >()

  // @ts-expect-error `data` is required
  parseEventLogs({ abi, logs: [] as { topics: readonly Hex[] }[] })
  // @ts-expect-error `topics` is required
  parseEventLogs({ abi, logs: [] as { data: Hex }[] })
})

test('eventName as a name restricts the union', () => {
  const parsed = parseEventLogs({
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
  })
  expectTypeOf(parsed).toEqualTypeOf<
    {
      address?: Address | undefined
      topics: readonly Hex[]
      data: Hex
      eventName: 'Transfer'
      args: TransferArgs
    }[]
  >()

  // @ts-expect-error not an event of the ABI
  parseEventLogs({ abi, logs: transactionLogs, eventName: 'Transferred' })
  // @ts-expect-error a function name is not an event name
  parseEventLogs({ abi, logs: transactionLogs, eventName: 'balanceOf' })
})

test('eventName as a list restricts the union to those events', () => {
  const parsed = parseEventLogs({
    abi,
    logs: transactionLogs,
    eventName: ['Transfer', 'Approval'],
  })
  const log = parsed[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<'Transfer' | 'Approval'>()
  if (log.eventName === 'Transfer')
    expectTypeOf(log.args).toEqualTypeOf<TransferArgs>()
  else expectTypeOf(log.args).toEqualTypeOf<ApprovalArgs>()

  // A one-name list is the single-name result.
  expectTypeOf(
    parseEventLogs({ abi, logs: transactionLogs, eventName: ['Approval'] }),
  ).toEqualTypeOf<
    ReturnType<
      typeof parseEventLogs<typeof abi, 'Approval', true, TransactionLog>
    >
  >()

  // An empty list considers no event.
  expectTypeOf(
    parseEventLogs({ abi, logs: transactionLogs, eventName: [] }),
  ).toEqualTypeOf<never[]>()

  parseEventLogs({
    abi,
    logs: transactionLogs,
    // @ts-expect-error not an event of the ABI
    eventName: ['Transfer', 'Transferred'],
  })
})

test('strict: true and undefined are strict, false and boolean are partial', () => {
  const strict = parseEventLogs({
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
    strict: true,
  })
  expectTypeOf(strict[0]!.args).toEqualTypeOf<TransferArgs>()
  const unset = parseEventLogs({
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
    strict: undefined,
  })
  expectTypeOf(unset[0]!.args).toEqualTypeOf<TransferArgs>()

  type PartialTransferArgs =
    | {
        from?: Address | undefined
        to?: Address | undefined
        value?: bigint | undefined
      }
    | undefined
  const loose = parseEventLogs({
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
    strict: false,
  })
  expectTypeOf(loose[0]!.args).toEqualTypeOf<PartialTransferArgs>()
  const wide = parseEventLogs({
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
    strict: false as boolean,
  })
  expectTypeOf(wide[0]!.args).toEqualTypeOf<PartialTransferArgs>()

  // Non-strict: an indexed string can be its topic or the recovered value,
  // positional entries can be missing, and an input-less event can carry `{}`.
  const all = parseEventLogs({ abi, logs: transactionLogs, strict: false })
  const log = all[0]!
  if (log.eventName === 'Note')
    expectTypeOf(log.args).toEqualTypeOf<
      readonly [(Hex | string | undefined)?, (bigint | undefined)?] | undefined
    >()
  if (log.eventName === 'Ping')
    expectTypeOf(log.args).toEqualTypeOf<Record<string, never> | undefined>()
})

test('a wide abi keeps the wide shape', () => {
  type Wide = {
    address?: Address | undefined
    topics: readonly Hex[]
    data: Hex
    eventName: string
    args: Record<string, unknown> | readonly unknown[] | undefined
  }[]
  expectTypeOf(
    parseEventLogs({ abi: abi as Abi, logs: transactionLogs }),
  ).toEqualTypeOf<Wide>()
  expectTypeOf(
    parseEventLogs({ abi: abi as readonly unknown[], logs: transactionLogs }),
  ).toEqualTypeOf<Wide>()
  // Any name is accepted, in either mode.
  expectTypeOf(
    parseEventLogs({
      abi: abi as Abi,
      logs: transactionLogs,
      eventName: 'Anything',
      strict: false,
    }),
  ).toEqualTypeOf<Wide>()
  expectTypeOf(
    parseEventLogs({
      abi: abi as readonly unknown[],
      logs: transactionLogs,
      eventName: ['Anything', 'Else'],
    }),
  ).toEqualTypeOf<Wide>()
})

test('unparameterised ParseEventLogsParameters / ParseEventLogsReturnType', () => {
  const parameters: ParseEventLogsParameters = {
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
    strict: false,
  }
  expectTypeOf(parameters.abi).toEqualTypeOf<Abi | readonly unknown[]>()
  expectTypeOf(parameters.eventName).toEqualTypeOf<
    string | readonly string[] | undefined
  >()
  expectTypeOf(parameters.strict).toEqualTypeOf<boolean | undefined>()
  expectTypeOf<ParseEventLogsReturnType>().toEqualTypeOf<
    {
      topics: readonly Hex[]
      data: Hex
      eventName: string
      args: Record<string, unknown> | readonly unknown[] | undefined
    }[]
  >()
  expectTypeOf(
    parseEventLogs(parameters),
  ).toEqualTypeOf<ParseEventLogsReturnType>()
})

test('an eventName that can be undefined keeps every event', () => {
  // `undefined` considers every event of the ABI, so the union is not narrowed.
  const forward = (eventName?: 'Transfer') =>
    parseEventLogs({ abi, logs: transactionLogs, eventName })
  expectTypeOf(forward).returns.toEqualTypeOf<
    ParseEventLogsReturnType<typeof abi, undefined, true, TransactionLog>
  >()
  const names = ['Transfer'] as readonly ['Transfer'] | undefined
  const listed = parseEventLogs({
    abi,
    logs: transactionLogs,
    eventName: names,
  })
  expectTypeOf(listed[0]!.eventName).toEqualTypeOf<
    'Transfer' | 'Approval' | 'Note' | 'Ping'
  >()
  const options = {} as { eventName?: 'Approval' | undefined }
  const spread = parseEventLogs({ abi, logs: transactionLogs, ...options })
  expectTypeOf(spread[0]!.eventName).toEqualTypeOf<
    'Transfer' | 'Approval' | 'Note' | 'Ping'
  >()
  expectTypeOf(
    parseEventLogs({ abi, logs: transactionLogs, eventName: undefined }),
  ).toEqualTypeOf<
    ParseEventLogsReturnType<typeof abi, undefined, true, TransactionLog>
  >()

  // The same holds for the types.
  expectTypeOf<
    ParseEventLogsReturnType<
      typeof abi,
      'Transfer' | undefined
    >[number]['eventName']
  >().toEqualTypeOf<'Transfer' | 'Approval' | 'Note' | 'Ping'>()
  expectTypeOf<
    ParseEventLogsReturnType<typeof abi, 'Transfer'>[number]['eventName']
  >().toEqualTypeOf<'Transfer'>()
})

test('an inline abi is inferred as a literal', () => {
  const parsed = parseEventLogs({
    abi: [
      {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { indexed: true, name: 'from', type: 'address' },
          { indexed: true, name: 'to', type: 'address' },
          { indexed: false, name: 'value', type: 'uint256' },
        ],
      },
      { type: 'event', name: 'Ping', inputs: [] },
    ],
    logs: transactionLogs,
  })
  const log = parsed[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<'Transfer' | 'Ping'>()
  if (log.eventName === 'Transfer')
    expectTypeOf(log.args).toEqualTypeOf<TransferArgs>()
  else expectTypeOf(log.args).toEqualTypeOf<undefined>()
})

test('explicit type arguments follow the order of the parameter types', () => {
  // The abi alone: the other type arguments take their defaults.
  const parsed = parseEventLogs<typeof abi>({ abi, logs: transactionLogs })
  expectTypeOf(parsed).toEqualTypeOf<
    ParseEventLogsReturnType<typeof abi, undefined, true>
  >()
  expectTypeOf(parsed[0]!.eventName).toEqualTypeOf<
    'Transfer' | 'Approval' | 'Note' | 'Ping'
  >()
  expectTypeOf(parsed[0]!).not.toHaveProperty('address')

  // abi, eventName, strict, log — as in ParseEventLogsReturnType.
  const transfers = parseEventLogs<typeof abi, 'Transfer'>({
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
  })
  expectTypeOf(transfers).toEqualTypeOf<
    ParseEventLogsReturnType<typeof abi, 'Transfer', true>
  >()
  expectTypeOf(transfers[0]!.args).toEqualTypeOf<TransferArgs>()
  const full = parseEventLogs<typeof abi, 'Transfer', false, TransactionLog>({
    abi,
    logs: transactionLogs,
    eventName: 'Transfer',
    strict: false,
  })
  expectTypeOf(full).toEqualTypeOf<
    ParseEventLogsReturnType<typeof abi, 'Transfer', false, TransactionLog>
  >()
  expectTypeOf(full[0]!.address).toEqualTypeOf<Address | undefined>()
})
