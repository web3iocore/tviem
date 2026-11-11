// Type-surface tests for `getLogs`: the returned `Log`s and the `args` filter
// are inferred from a literal `event` / `events`.
import type { AbiEvent } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import {
  type GetLogsParameters,
  type GetLogsReturnType,
  getLogs,
  type Log,
} from '../../../src/actions/public/getLogs.js'
import type { Client } from '../../../src/clients/createClient.js'
import type { Address, AddressInput } from '../../../src/types/address.js'
import type {
  DecodedEventArgs,
  EventFilterArgs,
} from '../../../src/types/log.js'
import type { Hex } from '../../../src/types/misc.js'
import type { Prettify } from '../../../src/types/utils.js'

const client = {} as Client

const transfer = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

const approval = {
  type: 'event',
  name: 'Approval',
  inputs: [
    { indexed: true, name: 'owner', type: 'address' },
    { indexed: true, name: 'spender', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

// TRC-721 style: every input unnamed.
const unnamedTransfer = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, type: 'address' },
    { indexed: true, type: 'address' },
    { indexed: true, type: 'uint256' },
  ],
} as const

// One empty-named input among named ones.
const emptyNamed = {
  type: 'event',
  name: 'Mixed',
  inputs: [
    { indexed: true, name: 'account', type: 'address' },
    { indexed: false, name: '', type: 'uint256' },
  ],
} as const

// Indexed inputs of the hashed types, next to non-indexed ones of the same types.
const hashed = {
  type: 'event',
  name: 'Hashed',
  inputs: [
    { indexed: true, name: 'label', type: 'string' },
    { indexed: true, name: 'blob', type: 'bytes' },
    { indexed: true, name: 'ids', type: 'uint256[]' },
    {
      indexed: true,
      name: 'point',
      type: 'tuple',
      components: [
        { name: 'x', type: 'uint256' },
        { name: 'y', type: 'uint256' },
      ],
    },
    { indexed: false, name: 'note', type: 'string' },
    { indexed: false, name: 'raw', type: 'bytes' },
    { indexed: false, name: 'amounts', type: 'uint256[]' },
    { indexed: false, name: 'flag', type: 'bool' },
  ],
} as const

const ping = { type: 'event', name: 'Ping', inputs: [] } as const

/** The fields every `Log` carries, whatever the event. */
type LogBase = {
  address: Address
  blockHash: Hex
  blockNumber: bigint
  blockTimestamp?: bigint | undefined
  data: Hex
  logIndex: number
  removed: boolean
  topics: readonly Hex[]
  transactionHash: Hex
  transactionIndex: number
}

/** The plain, undecoded `Log`. */
type WideLog = Prettify<
  LogBase & {
    eventName?: string | undefined
    args?: Record<string, unknown> | readonly unknown[] | undefined
  }
>

/** One address filter value: a value, an OR-list, or a wildcard. */
type AddressFilter = AddressInput | readonly AddressInput[] | null | undefined

test('unparameterised Log / GetLogsParameters / GetLogsReturnType', () => {
  expectTypeOf<Log>().toEqualTypeOf<WideLog>()
  expectTypeOf<GetLogsReturnType>().toEqualTypeOf<Log[]>()

  // The unparameterised parameters accept every filter form.
  const event = {} as AbiEvent
  expectTypeOf<{ event: AbiEvent }>().toExtend<GetLogsParameters>()
  expectTypeOf<{
    event: AbiEvent
    args: readonly unknown[]
    strict: boolean
  }>().toExtend<GetLogsParameters>()
  expectTypeOf<{
    event: AbiEvent
    args: Record<string, unknown>
  }>().toExtend<GetLogsParameters>()
  expectTypeOf<{
    events: readonly AbiEvent[]
    fromBlock: bigint
  }>().toExtend<GetLogsParameters>()
  expectTypeOf<{
    topics: readonly Hex[]
    blockHash: Hex
  }>().toExtend<GetLogsParameters>()
  expectTypeOf<{}>().toExtend<GetLogsParameters>()
  // A literal event is assignable to the unparameterised parameters too.
  expectTypeOf<{
    event: typeof transfer
    args: { to: null }
  }>().toExtend<GetLogsParameters>()

  // Parameters held under the unparameterised name — which may carry any
  // filter form — give the plain Log, so a wrapper declared with the
  // unparameterised names type-checks.
  const parameters: GetLogsParameters = { event, args: { from: 'T' } }
  expectTypeOf(getLogs(client, parameters)).resolves.toEqualTypeOf<Log[]>()
  const wrapper = (parameters: GetLogsParameters): Promise<GetLogsReturnType> =>
    getLogs(client, parameters)
  expectTypeOf(wrapper).returns.resolves.toEqualTypeOf<Log[]>()
})

test('no filter and topics-only return the plain Log', async () => {
  expectTypeOf(await getLogs(client)).toEqualTypeOf<Log[]>()
  expectTypeOf(await getLogs(client, {})).toEqualTypeOf<Log[]>()
  expectTypeOf(
    await getLogs(client, { address: 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe' }),
  ).toEqualTypeOf<Log[]>()
  expectTypeOf(
    await getLogs(client, {
      topics: [
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        null,
      ],
      fromBlock: 1n,
      toBlock: 'latest',
    }),
  ).toEqualTypeOf<Log[]>()
})

test('single event: eventName literal, args optional by default', async () => {
  const logs = await getLogs(client, { event: transfer })
  expectTypeOf(logs).toEqualTypeOf<Log<typeof transfer>[]>()
  expectTypeOf(logs).toEqualTypeOf<GetLogsReturnType<typeof transfer>>()

  const log = logs[0]!
  expectTypeOf(log).toEqualTypeOf<
    Prettify<
      LogBase & {
        eventName: 'Transfer'
        args:
          | {
              from?: Address | undefined
              to?: Address | undefined
              value?: bigint | undefined
            }
          | undefined
      }
    >
  >()
  expectTypeOf(log.eventName).toEqualTypeOf<'Transfer'>()
  // A partially decoded log carries only what was recovered, and `args` is
  // `undefined` when nothing was.
  expectTypeOf(log.args?.from).toEqualTypeOf<Address | undefined>()
  expectTypeOf(log.args?.value).toEqualTypeOf<bigint | undefined>()
  // The undecoded fields keep their types.
  expectTypeOf(log.address).toEqualTypeOf<Address>()
  expectTypeOf(log.blockNumber).toEqualTypeOf<bigint>()
  expectTypeOf(log.topics).toEqualTypeOf<readonly Hex[]>()

  // `strict: false` and a non-literal `strict` are the same as the default.
  expectTypeOf(
    await getLogs(client, { event: transfer, strict: false }),
  ).toEqualTypeOf<Log<typeof transfer>[]>()
  expectTypeOf(
    await getLogs(client, { event: transfer, strict: false as boolean }),
  ).toEqualTypeOf<Log<typeof transfer>[]>()
  expectTypeOf<Log<typeof transfer, false>>().toEqualTypeOf<
    Log<typeof transfer>
  >()
  expectTypeOf<Log<typeof transfer, boolean>>().toEqualTypeOf<
    Log<typeof transfer>
  >()
})

test('single event, strict: every arg is present', async () => {
  const logs = await getLogs(client, { event: transfer, strict: true })
  expectTypeOf(logs).toEqualTypeOf<Log<typeof transfer, true>[]>()

  const log = logs[0]!
  expectTypeOf(log).toEqualTypeOf<
    Prettify<
      LogBase & {
        eventName: 'Transfer'
        args: { from: Address; to: Address; value: bigint }
      }
    >
  >()
  expectTypeOf(log.args.from).toEqualTypeOf<Address>()
  expectTypeOf(log.args.to).toEqualTypeOf<Address>()
  expectTypeOf(log.args.value).toEqualTypeOf<bigint>()
})

test('an inline event literal is inferred without `as const`', async () => {
  const logs = await getLogs(client, {
    event: {
      type: 'event',
      name: 'Deposit',
      inputs: [
        { indexed: true, name: 'account', type: 'address' },
        { indexed: false, name: 'amount', type: 'uint64' },
        { indexed: false, name: 'memo', type: 'string' },
        { indexed: false, name: 'ok', type: 'bool' },
        { indexed: false, name: 'id', type: 'bytes32' },
      ],
    },
    strict: true,
  })
  expectTypeOf(logs[0]!.eventName).toEqualTypeOf<'Deposit'>()
  expectTypeOf(logs[0]!.args).toEqualTypeOf<{
    account: Address
    amount: bigint
    memo: string
    ok: boolean
    id: Hex
  }>()
})

test('events list: a union that narrows on eventName', async () => {
  const logs = await getLogs(client, { events: [transfer, approval] })
  expectTypeOf(logs).toEqualTypeOf<
    Log<undefined, undefined, readonly [typeof transfer, typeof approval]>[]
  >()

  const log = logs[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<'Transfer' | 'Approval'>()
  if (log.eventName === 'Transfer') {
    expectTypeOf(log.args).toEqualTypeOf<
      | {
          from?: Address | undefined
          to?: Address | undefined
          value?: bigint | undefined
        }
      | undefined
    >()
  } else {
    expectTypeOf(log.eventName).toEqualTypeOf<'Approval'>()
    expectTypeOf(log.args).toEqualTypeOf<
      | {
          owner?: Address | undefined
          spender?: Address | undefined
          value?: bigint | undefined
        }
      | undefined
    >()
  }

  const strict = await getLogs(client, {
    events: [transfer, approval],
    strict: true,
  })
  const strictLog = strict[0]!
  if (strictLog.eventName === 'Approval') {
    expectTypeOf(strictLog.args).toEqualTypeOf<{
      owner: Address
      spender: Address
      value: bigint
    }>()
    // @ts-expect-error `from` belongs to Transfer
    strictLog.args.from
  }
  switch (strictLog.eventName) {
    case 'Transfer':
      expectTypeOf(strictLog.args.from).toEqualTypeOf<Address>()
      break
    case 'Approval':
      expectTypeOf(strictLog.args.spender).toEqualTypeOf<Address>()
      break
    default:
      expectTypeOf(strictLog).toBeNever()
  }

  // An `as const` list declared apart from the call behaves the same.
  const events = [transfer, approval] as const
  expectTypeOf(await getLogs(client, { events, strict: true })).toEqualTypeOf<
    typeof strict
  >()

  // A one-event list is the single-event result.
  expectTypeOf(await getLogs(client, { events: [transfer] })).toEqualTypeOf<
    Log<typeof transfer>[]
  >()
})

test('events sharing a name: named and positional members', async () => {
  const logs = await getLogs(client, {
    events: [transfer, unnamedTransfer],
    strict: true,
  })
  const log = logs[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<'Transfer'>()
  expectTypeOf(log.args).toEqualTypeOf<
    | { from: Address; to: Address; value: bigint }
    | readonly [Address, Address, bigint]
  >()
})

test('unnamed inputs decode to a positional tuple', async () => {
  const strict = await getLogs(client, { event: unnamedTransfer, strict: true })
  expectTypeOf(strict[0]!.eventName).toEqualTypeOf<'Transfer'>()
  expectTypeOf(strict[0]!.args).toEqualTypeOf<
    readonly [Address, Address, bigint]
  >()

  // Without `strict` every entry is optional and can be `undefined`.
  const loose = await getLogs(client, { event: unnamedTransfer })
  expectTypeOf(loose[0]!.args).toEqualTypeOf<
    | readonly [
        (Address | undefined)?,
        (Address | undefined)?,
        (bigint | undefined)?,
      ]
    | undefined
  >()

  // One empty-named input makes the whole event positional.
  const mixed = await getLogs(client, { event: emptyNamed, strict: true })
  expectTypeOf(mixed[0]!.args).toEqualTypeOf<readonly [Address, bigint]>()
})

test('indexed string / bytes / array / tuple decode to the topic', async () => {
  const strict = await getLogs(client, { event: hashed, strict: true })
  expectTypeOf(strict[0]!.args).toEqualTypeOf<{
    // Indexed hashed types: the 32-byte topic.
    label: Hex
    blob: Hex
    ids: Hex
    point: Hex
    // Non-indexed: the real value.
    note: string
    raw: Hex
    amounts: readonly bigint[]
    flag: boolean
  }>()

  // Without `strict` an indexed hashed input whose topic is missing is
  // recovered from `data` as its real value.
  const loose = await getLogs(client, { event: hashed })
  const args = loose[0]!.args
  expectTypeOf(args?.label).toEqualTypeOf<Hex | string | undefined>()
  expectTypeOf(args?.blob).toEqualTypeOf<Hex | undefined>()
  expectTypeOf(args?.ids).toEqualTypeOf<Hex | readonly bigint[] | undefined>()
  expectTypeOf(args?.point).toEqualTypeOf<
    Hex | { x: bigint; y: bigint } | undefined
  >()
  expectTypeOf(args?.note).toEqualTypeOf<string | undefined>()
  expectTypeOf(args?.amounts).toEqualTypeOf<readonly bigint[] | undefined>()
  expectTypeOf(args?.flag).toEqualTypeOf<boolean | undefined>()
})

test('an event without inputs', async () => {
  // Strict: nothing is decoded, so `args` is `undefined`.
  const strict = await getLogs(client, { event: ping, strict: true })
  expectTypeOf(strict[0]!.eventName).toEqualTypeOf<'Ping'>()
  expectTypeOf(strict[0]!.args).toEqualTypeOf<undefined>()

  // Non-strict: the fallback path can also leave an empty object.
  const loose = await getLogs(client, { event: ping })
  expectTypeOf(loose[0]!.eventName).toEqualTypeOf<'Ping'>()
  expectTypeOf(loose[0]!.args).toEqualTypeOf<
    Record<string, never> | undefined
  >()
})

test('a non-narrowable event keeps the wide shape', async () => {
  const event = {} as AbiEvent
  const logs = await getLogs(client, { event })
  expectTypeOf(logs).toEqualTypeOf<Log<AbiEvent>[]>()
  expectTypeOf(logs[0]!).toEqualTypeOf<
    Prettify<
      LogBase & {
        eventName: string
        args: Record<string, unknown> | readonly unknown[] | undefined
      }
    >
  >()
  // Same under `strict`.
  const strict = await getLogs(client, { event, strict: true })
  expectTypeOf(strict[0]!.eventName).toEqualTypeOf<string>()
  expectTypeOf(strict[0]!.args).toEqualTypeOf<
    Record<string, unknown> | readonly unknown[] | undefined
  >()

  // The filter stays untyped.
  getLogs(client, { event, args: { anything: 1 } })
  getLogs(client, { event, args: ['T', null, [1n, 2n]] })

  // `readonly AbiEvent[]` and `readonly unknown[]` lists.
  const events = [] as readonly AbiEvent[]
  const fromEvents = await getLogs(client, { events })
  expectTypeOf(fromEvents[0]!.eventName).toEqualTypeOf<string>()
  expectTypeOf(fromEvents[0]!.args).toEqualTypeOf<
    Record<string, unknown> | readonly unknown[] | undefined
  >()
  expectTypeOf<Log<undefined, undefined, readonly unknown[]>>().toEqualTypeOf<
    Log<AbiEvent>
  >()
  expectTypeOf<Log<undefined, true, readonly AbiEvent[]>>().toEqualTypeOf<
    Log<AbiEvent>
  >()

  // A literal event mixed with a wide one: the literal member still narrows.
  const mixed = await getLogs(client, {
    events: [transfer, event],
    strict: true,
  })
  expectTypeOf(mixed[0]!.eventName).toEqualTypeOf<string>()
})

test('non-literal pieces of a literal event fall back to wide types', () => {
  // A wide input name: the keys are unknown.
  expectTypeOf<
    DecodedEventArgs<{
      type: 'event'
      name: 'E'
      inputs: readonly [{ name: string; type: 'address'; indexed: true }]
    }>
  >().toEqualTypeOf<Record<string, unknown> | readonly unknown[] | undefined>()
  // A wide `indexed` on a hashed type: either the topic or the value.
  expectTypeOf<
    DecodedEventArgs<{
      type: 'event'
      name: 'E'
      inputs: readonly [{ name: 'note'; type: 'string'; indexed: boolean }]
    }>
  >().toEqualTypeOf<{ note: Hex | string }>()
  // ...and the filter is untyped.
  expectTypeOf<
    EventFilterArgs<{
      type: 'event'
      name: 'E'
      inputs: readonly [{ name: 'note'; type: 'string'; indexed: boolean }]
    }>
  >().toEqualTypeOf<Record<string, unknown> | readonly unknown[]>()
})

test('filter args: indexed inputs only, by name or position', () => {
  type Args = NonNullable<
    Extract<
      GetLogsParameters<typeof transfer>,
      { event: typeof transfer }
    >['args']
  >
  expectTypeOf<Args>().toEqualTypeOf<EventFilterArgs<typeof transfer>>()
  expectTypeOf<Args>().toEqualTypeOf<
    | readonly [AddressFilter?, AddressFilter?]
    | { from?: AddressFilter; to?: AddressFilter }
  >()

  // By name: a value (any address form), an OR-list, or a wildcard.
  getLogs(client, { event: transfer, args: { from: 'T...' } })
  getLogs(client, {
    event: transfer,
    args: { from: '0x0000000000000000000000000000000000000001' },
  })
  getLogs(client, { event: transfer, args: { to: ['T...', '41...'] } })
  getLogs(client, { event: transfer, args: { from: null, to: undefined } })
  getLogs(client, { event: transfer, args: {} })
  getLogs(client, { event: transfer, args: undefined })
  // By position.
  getLogs(client, { event: transfer, args: ['T...'] })
  getLogs(client, { event: transfer, args: [null, ['T...', 'T...']] })
  getLogs(client, { event: transfer, args: [] })

  // @ts-expect-error `value` is not indexed
  getLogs(client, { event: transfer, args: { value: 1n } })
  // @ts-expect-error misspelt input name
  getLogs(client, { event: transfer, args: { form: 'T...' } })
  // @ts-expect-error an address filter is not a bigint
  getLogs(client, { event: transfer, args: { from: 1n } })
  // @ts-expect-error an OR-list of the wrong type
  getLogs(client, { event: transfer, args: { from: [1n, 2n] } })
  // @ts-expect-error wrong positional value type
  getLogs(client, { event: transfer, args: [null, 1n] })
  // @ts-expect-error only two inputs are indexed
  getLogs(client, { event: transfer, args: [null, null, 1n] })
})

test('filter args: integers, strings and bytes take the input value', () => {
  // Positional over the indexed inputs of an unnamed event.
  expectTypeOf<EventFilterArgs<typeof unnamedTransfer>>().toEqualTypeOf<
    readonly [
      AddressFilter?,
      AddressFilter?,
      (bigint | number | readonly (bigint | number)[] | null | undefined)?,
    ]
  >()
  getLogs(client, { event: unnamedTransfer, args: [null, null, 1n] })
  getLogs(client, { event: unnamedTransfer, args: [null, null, [1, 2n]] })
  // @ts-expect-error unnamed inputs have no key
  getLogs(client, { event: unnamedTransfer, args: { from: 'T...' } })
  // @ts-expect-error a uint256 filter is not a string
  getLogs(client, { event: unnamedTransfer, args: [null, null, 'one'] })

  // Indexed string / bytes take the raw value; indexed arrays and tuples have
  // no key, and their position only takes the wildcard.
  expectTypeOf<EventFilterArgs<typeof hashed>>().toEqualTypeOf<
    | readonly [
        (string | readonly string[] | null | undefined)?,
        (Hex | readonly Hex[] | null | undefined)?,
        (null | undefined)?,
        (null | undefined)?,
      ]
    | {
        label?: string | readonly string[] | null | undefined
        blob?: Hex | readonly Hex[] | null | undefined
      }
  >()
  getLogs(client, { event: hashed, args: { label: 'hello', blob: '0x1234' } })
  getLogs(client, { event: hashed, args: { label: ['a', 'b'] } })
  getLogs(client, { event: hashed, args: ['hello', null, null, undefined] })
  // @ts-expect-error an indexed array is not filterable
  getLogs(client, { event: hashed, args: { ids: [1n] } })
  // @ts-expect-error an indexed tuple is not filterable
  getLogs(client, { event: hashed, args: { point: { x: 1n, y: 2n } } })
  // @ts-expect-error an indexed array position only takes the wildcard
  getLogs(client, { event: hashed, args: [null, null, [1n]] })
  // @ts-expect-error `note` is not indexed
  getLogs(client, { event: hashed, args: { note: 'hello' } })
  // @ts-expect-error a bytes filter is hex
  getLogs(client, { event: hashed, args: { blob: 'not hex' } })

  // An event without indexed inputs has nothing to filter on.
  expectTypeOf<EventFilterArgs<typeof ping>>().toEqualTypeOf<readonly []>()
  // @ts-expect-error no indexed inputs
  getLogs(client, { event: ping, args: { anything: 1 } })
})

test('filter forms are mutually exclusive', () => {
  // @ts-expect-error `args` needs a single `event`
  getLogs(client, { events: [transfer, approval], args: { from: 'T...' } })
  // @ts-expect-error `event` and `events` cannot be combined
  getLogs(client, { event: transfer, events: [approval] })
  // @ts-expect-error `event` and raw `topics` cannot be combined
  getLogs(client, { event: transfer, topics: [null] })
  // @ts-expect-error `strict` needs `event` / `events`
  getLogs(client, { topics: [null], strict: true })
  // @ts-expect-error a block hash excludes a block range
  getLogs(client, { event: transfer, blockHash: '0x1', fromBlock: 1n })
})

test('an inline events list is inferred without `as const`', async () => {
  const logs = await getLogs(client, {
    events: [
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
    strict: true,
  })
  const log = logs[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<'Transfer' | 'Ping'>()
  if (log.eventName === 'Transfer')
    expectTypeOf(log.args).toEqualTypeOf<{
      from: Address
      to: Address
      value: bigint
    }>()
  else expectTypeOf(log.args).toEqualTypeOf<undefined>()
})

test('events takes event items only', () => {
  const balanceOf = {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  } as const
  const abi = [transfer, balanceOf] as const

  // @ts-expect-error a whole abi carries items that are not events
  getLogs(client, { events: abi })
  // @ts-expect-error a function is not an event
  getLogs(client, { events: [transfer, balanceOf] })
  // @ts-expect-error not abi items
  getLogs(client, { events: [1, 'x'] })
  // @ts-expect-error a list of unknown items
  getLogs(client, { events: [] as readonly unknown[] })
  // @ts-expect-error a function is not an event
  getLogs(client, { event: balanceOf })

  type Events = NonNullable<Parameters<typeof getLogs>[1]>['events']
  expectTypeOf<Events>().toEqualTypeOf<readonly AbiEvent[] | undefined>()
})

test('filter args: a filter that is not narrowable is taken as it is', async () => {
  // An array of unknown length, an object without known keys, or both — the
  // types a filter built at runtime has. The logs are still inferred.
  const list = [] as readonly unknown[]
  const record = {} as Record<string, unknown>
  const wide = {} as GetLogsParameters['args']
  expectTypeOf(
    await getLogs(client, { event: transfer, args: list }),
  ).toEqualTypeOf<Log<typeof transfer>[]>()
  expectTypeOf(
    await getLogs(client, { event: transfer, args: record, strict: true }),
  ).toEqualTypeOf<Log<typeof transfer, true>[]>()
  expectTypeOf(
    await getLogs(client, { event: transfer, args: wide }),
  ).toEqualTypeOf<Log<typeof transfer>[]>()
  // A positional list built at runtime, for named and for unnamed inputs.
  const built = ['T...', null].filter(Boolean)
  expectTypeOf(built).toEqualTypeOf<(string | null)[]>()
  getLogs(client, { event: transfer, args: built })
  getLogs(client, { event: unnamedTransfer, args: built })
  getLogs(client, { event: unnamedTransfer, args: wide })
  getLogs(client, { event: unnamedTransfer, args: record })
  getLogs(client, { event: ping, args: wide })
  // A union of an array and a keyed object, whichever comes first.
  getLogs(client, {
    event: unnamedTransfer,
    args: {} as readonly (string | 1)[] | Record<string, 2>,
  })
  getLogs(client, {
    event: unnamedTransfer,
    args: {} as Record<string, 3> | readonly (string | 4)[],
  })

  // A literal — inline or held in a variable — is still checked.
  const misspelt = { form: 'T...' }
  // @ts-expect-error misspelt input name
  getLogs(client, { event: transfer, args: misspelt })
  const tooLong = [null, null, 1n] as const
  // @ts-expect-error only two inputs are indexed
  getLogs(client, { event: transfer, args: tooLong })
  // @ts-expect-error not a filter
  getLogs(client, { event: transfer, args: 'T...' })
  // @ts-expect-error not a filter
  getLogs(client, { event: transfer, args: {} as string[] | number })
  // @ts-expect-error `args` still needs a single `event`
  getLogs(client, { events: [transfer, approval], args: list })
})

test('a strict that can be undefined is not strict', async () => {
  // `undefined` selects the default, which is non-strict.
  const forward = (strict?: true) =>
    getLogs(client, { event: transfer, strict })
  expectTypeOf(forward).returns.resolves.toEqualTypeOf<Log<typeof transfer>[]>()
  const plural = (strict: true | undefined) =>
    getLogs(client, { events: [transfer, approval], strict })
  expectTypeOf(plural).returns.resolves.toEqualTypeOf<
    Log<undefined, false, [typeof transfer, typeof approval]>[]
  >()
  const options = {} as { strict?: true | undefined }
  expectTypeOf(
    await getLogs(client, { event: transfer, ...options }),
  ).toEqualTypeOf<Log<typeof transfer>[]>()
  expectTypeOf(
    await getLogs(client, { event: transfer, strict: undefined }),
  ).toEqualTypeOf<Log<typeof transfer>[]>()

  // The literal `true` is strict.
  expectTypeOf(
    await getLogs(client, { event: transfer, strict: true }),
  ).toEqualTypeOf<Log<typeof transfer, true>[]>()
})

// A realistic contract surface: 20 events, each with its own `amount<n>` input.
const manyEvents = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount0', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount1', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount2', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawal',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount3', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Mint',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount4', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Burn',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount5', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Swap',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount6', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Sync',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount7', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Paused',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount8', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Unpaused',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount9', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount10', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'RoleGranted',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount11', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'RoleRevoked',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount12', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Staked',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount13', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Unstaked',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount14', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'RewardPaid',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount15', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Frozen',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount16', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Unfrozen',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount17', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'VoteCast',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount18', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { indexed: true, name: 'account', type: 'address' },
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'amount19', type: 'uint256' },
    ],
  },
] as const

test('a 20-event list compiles and narrows', async () => {
  const logs = await getLogs(client, { events: manyEvents, strict: true })
  const log = logs[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<
    (typeof manyEvents)[number]['name']
  >()
  expectTypeOf(log.args.account).toEqualTypeOf<Address>()
  if (log.eventName === 'Transfer')
    expectTypeOf(log.args).toEqualTypeOf<{
      account: Address
      id: bigint
      amount0: bigint
    }>()
  if (log.eventName === 'ProposalCreated')
    expectTypeOf(log.args).toEqualTypeOf<{
      account: Address
      id: bigint
      amount19: bigint
    }>()

  const loose = await getLogs(client, { events: manyEvents })
  const looseLog = loose[0]!
  if (looseLog.eventName === 'Swap')
    expectTypeOf(looseLog.args?.amount6).toEqualTypeOf<bigint | undefined>()

  // Each event of the list is usable on its own, with its typed filter.
  const single = await getLogs(client, {
    event: manyEvents[13],
    args: { account: 'T...', id: [1n, 2n] },
    strict: true,
  })
  expectTypeOf(single[0]!.eventName).toEqualTypeOf<'Staked'>()
  expectTypeOf(single[0]!.args.amount13).toEqualTypeOf<bigint>()
})
