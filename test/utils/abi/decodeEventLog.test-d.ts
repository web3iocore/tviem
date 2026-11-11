// Type-surface tests for `decodeEventLog` (Track C).
//
// `decodeEventLog` infers its return type from a literal `abi` (narrowed by
// `eventName`, shaped by `strict`); with a wide `abi` (`Abi` / `readonly
// unknown[]`) it returns the fixed `DecodeEventLogReturnType` (`args:
// Record<string, unknown> | readonly unknown[] | undefined`). This file pins
// both, the parameter shape, and — against the real TRON decode-target
// machinery — the per-parameter primitive types (address → Base58 `Address`,
// integers → bigint, bool → boolean).
import type { Abi } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import type { Address } from '../../../src/types/address.js'
import type { DecodedEvent, DecodedEventArgs } from '../../../src/types/log.js'
import type { Hex } from '../../../src/types/misc.js'
import {
  type DecodeEventLogParameters,
  type DecodeEventLogReturnType,
  decodeEventLog,
} from '../../../src/utils/abi/decodeEventLog.js'
import type { TronAbiParameterToPrimitiveType } from '../../../src/utils/abi/encodeAbiParameters.js'

const trc20Abi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'spender', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
    name: 'Approval',
    type: 'event',
  },
] as const

test('decodeEventLog return type is the fixed shape for a wide abi', () => {
  const decoded = decodeEventLog({
    abi: trc20Abi as Abi,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    ],
    data: '0x',
  })
  expectTypeOf(decoded).toEqualTypeOf<DecodeEventLogReturnType>()
  expectTypeOf(decoded.eventName).toEqualTypeOf<string>()
  expectTypeOf(decoded.args).toEqualTypeOf<
    Record<string, unknown> | readonly unknown[] | undefined
  >()
})

test('decodeEventLog parameter shape', () => {
  // `data` and `eventName` are optional; `abi` and `topics` are required.
  expectTypeOf<DecodeEventLogParameters['abi']>().toEqualTypeOf<
    Abi | readonly unknown[]
  >()
  expectTypeOf<DecodeEventLogParameters['topics']>().toEqualTypeOf<
    readonly Hex[]
  >()
  expectTypeOf<DecodeEventLogParameters['data']>().toEqualTypeOf<
    Hex | undefined
  >()
  expectTypeOf<DecodeEventLogParameters['eventName']>().toEqualTypeOf<
    string | undefined
  >()

  // eventName is required to decode `anonymous` events, but always optional
  // at the type level.
  decodeEventLog({ abi: trc20Abi, topics: [], eventName: 'Transfer' })
  decodeEventLog({ abi: trc20Abi, topics: ['0x'] })
})

test('runtime decode targets: address → Address, indexed/non-indexed', () => {
  // Both indexed (non-hashed) and non-indexed parameters decode through the
  // TRON `outputs` machinery, so `address` → canonical Base58 `Address`.
  expectTypeOf<
    TronAbiParameterToPrimitiveType<{ type: 'address' }, 'outputs'>
  >().toEqualTypeOf<Address>()
  // non-indexed value: uint256 → bigint
  expectTypeOf<
    TronAbiParameterToPrimitiveType<{ type: 'uint256' }, 'outputs'>
  >().toEqualTypeOf<bigint>()
  expectTypeOf<
    TronAbiParameterToPrimitiveType<{ type: 'bool' }, 'outputs'>
  >().toEqualTypeOf<boolean>()
})

/////////////////////////////////////////////////////////////////////////////
// Inference from a literal abi

const eventsAbi = [
  ...trc20Abi,
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Every input unnamed.
  {
    type: 'event',
    name: 'Unnamed',
    inputs: [
      { indexed: true, type: 'address' },
      { indexed: false, type: 'uint256' },
    ],
  },
  // Indexed inputs of the hashed types, next to a non-indexed one.
  {
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
    ],
  },
  { type: 'event', name: 'Ping', inputs: [] },
] as const

const topics = [
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
] as const

type TransferArgs = { from: Address; to: Address; value: bigint }
type ApprovalArgs = { owner: Address; spender: Address; value: bigint }

test('literal abi: one { eventName, args } member per event', () => {
  const decoded = decodeEventLog({ abi: eventsAbi, topics, data: '0x' })
  expectTypeOf(decoded).toEqualTypeOf<
    DecodeEventLogReturnType<typeof eventsAbi, undefined, true>
  >()
  // The function item contributes no member.
  expectTypeOf(decoded.eventName).toEqualTypeOf<
    'Transfer' | 'Approval' | 'Unnamed' | 'Hashed' | 'Ping'
  >()

  if (decoded.eventName === 'Transfer') {
    expectTypeOf(decoded).toEqualTypeOf<{
      eventName: 'Transfer'
      args: TransferArgs
    }>()
    expectTypeOf(decoded.args.from).toEqualTypeOf<Address>()
    expectTypeOf(decoded.args.value).toEqualTypeOf<bigint>()
  }
  if (decoded.eventName === 'Approval')
    expectTypeOf(decoded.args).toEqualTypeOf<ApprovalArgs>()
  // Unnamed inputs: a positional tuple.
  if (decoded.eventName === 'Unnamed')
    expectTypeOf(decoded.args).toEqualTypeOf<readonly [Address, bigint]>()
  // Indexed string / bytes / array / tuple: the 32-byte topic.
  if (decoded.eventName === 'Hashed')
    expectTypeOf(decoded.args).toEqualTypeOf<{
      label: Hex
      blob: Hex
      ids: Hex
      point: Hex
      note: string
    }>()
  // No inputs: nothing is decoded.
  if (decoded.eventName === 'Ping')
    expectTypeOf(decoded.args).toEqualTypeOf<undefined>()
})

test('literal abi: eventName selects the member', () => {
  const decoded = decodeEventLog({
    abi: eventsAbi,
    topics,
    eventName: 'Approval',
  })
  expectTypeOf(decoded).toEqualTypeOf<{
    eventName: 'Approval'
    args: ApprovalArgs
  }>()

  // A single-event abi needs no eventName.
  expectTypeOf(decodeEventLog({ abi: [trc20Abi[0]], topics })).toEqualTypeOf<{
    eventName: 'Transfer'
    args: TransferArgs
  }>()

  // @ts-expect-error not an event of the abi
  decodeEventLog({ abi: eventsAbi, topics, eventName: 'Transferred' })
  // @ts-expect-error a function name is not an event name
  decodeEventLog({ abi: eventsAbi, topics, eventName: 'balanceOf' })
})

test('literal abi: an eventName that can be undefined keeps every event', () => {
  type All = DecodeEventLogReturnType<typeof eventsAbi, undefined, true>
  // `undefined` falls back to selecting by `topics[0]` over the whole abi.
  const forward = (eventName?: 'Transfer') =>
    decodeEventLog({ abi: eventsAbi, topics, eventName })
  expectTypeOf(forward).returns.toEqualTypeOf<All>()
  const options = {} as { eventName?: 'Approval' | undefined }
  expectTypeOf(
    decodeEventLog({ abi: eventsAbi, topics, ...options }),
  ).toEqualTypeOf<All>()
  expectTypeOf(
    decodeEventLog({ abi: eventsAbi, topics, eventName: undefined }),
  ).toEqualTypeOf<All>()

  // The same holds for the type.
  expectTypeOf<
    DecodeEventLogReturnType<typeof eventsAbi, 'Transfer' | undefined, true>
  >().toEqualTypeOf<All>()
  expectTypeOf<
    DecodeEventLogReturnType<typeof eventsAbi, 'Transfer'>['eventName']
  >().toEqualTypeOf<'Transfer'>()
})

test('literal abi: an eventName held as a plain string keeps every event', () => {
  type All = DecodeEventLogReturnType<typeof eventsAbi, undefined, true>
  const name = 'Transfer' as string
  expectTypeOf(
    decodeEventLog({ abi: eventsAbi, topics, eventName: name }),
  ).toEqualTypeOf<All>()
  const maybeName = undefined as string | undefined
  expectTypeOf(
    decodeEventLog({ abi: eventsAbi, topics, eventName: maybeName }),
  ).toEqualTypeOf<All>()
  expectTypeOf<
    DecodeEventLogReturnType<typeof eventsAbi, string, true>
  >().toEqualTypeOf<All>()

  // The parameters offer the event names of the abi, and take a plain string
  // only when the name was inferred as one.
  expectTypeOf<
    DecodeEventLogParameters<typeof eventsAbi, 'Transfer'>['eventName']
  >().toEqualTypeOf<
    'Transfer' | 'Approval' | 'Unnamed' | 'Hashed' | 'Ping' | undefined
  >()
  expectTypeOf<
    DecodeEventLogParameters<typeof eventsAbi, string>['eventName']
  >().toEqualTypeOf<string | undefined>()

  // A literal name is still checked against the abi.
  const misspelt = 'Transferred'
  // @ts-expect-error not an event of the abi
  decodeEventLog({ abi: eventsAbi, topics, eventName: misspelt })
  // @ts-expect-error not a name
  decodeEventLog({ abi: eventsAbi, topics, eventName: 1 })
})

test('an inline abi is inferred as a literal', () => {
  const decoded = decodeEventLog({
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
    topics,
  })
  expectTypeOf(decoded.eventName).toEqualTypeOf<'Transfer' | 'Ping'>()
  if (decoded.eventName === 'Transfer')
    expectTypeOf(decoded.args).toEqualTypeOf<TransferArgs>()
  else expectTypeOf(decoded.args).toEqualTypeOf<undefined>()
})

test('literal abi: strict defaults to true; false gives the partial form', () => {
  // `strict: true` and `strict: undefined` are the default.
  expectTypeOf(
    decodeEventLog({
      abi: eventsAbi,
      topics,
      eventName: 'Transfer',
      strict: true,
    }).args,
  ).toEqualTypeOf<TransferArgs>()
  expectTypeOf(
    decodeEventLog({
      abi: eventsAbi,
      topics,
      eventName: 'Transfer',
      strict: undefined,
    }).args,
  ).toEqualTypeOf<TransferArgs>()

  // Non-strict: each arg is optional, and `args` is `undefined` when nothing
  // was recovered.
  type PartialTransferArgs =
    | {
        from?: Address | undefined
        to?: Address | undefined
        value?: bigint | undefined
      }
    | undefined
  expectTypeOf(
    decodeEventLog({
      abi: eventsAbi,
      topics,
      eventName: 'Transfer',
      strict: false,
    }).args,
  ).toEqualTypeOf<PartialTransferArgs>()
  // A non-literal `strict` selects the partial form too.
  expectTypeOf(
    decodeEventLog({
      abi: eventsAbi,
      topics,
      eventName: 'Transfer',
      strict: true as boolean,
    }).args,
  ).toEqualTypeOf<PartialTransferArgs>()

  expectTypeOf(
    decodeEventLog({
      abi: eventsAbi,
      topics,
      eventName: 'Unnamed',
      strict: false,
    }).args,
  ).toEqualTypeOf<
    readonly [(Address | undefined)?, (bigint | undefined)?] | undefined
  >()

  // An indexed hashed input with no topic is recovered from `data` as its
  // real value.
  const hashed = decodeEventLog({
    abi: eventsAbi,
    topics,
    eventName: 'Hashed',
    strict: false,
  })
  expectTypeOf(hashed.args?.label).toEqualTypeOf<Hex | string | undefined>()
  expectTypeOf(hashed.args?.blob).toEqualTypeOf<Hex | undefined>()
  expectTypeOf(hashed.args?.ids).toEqualTypeOf<
    Hex | readonly bigint[] | undefined
  >()
  expectTypeOf(hashed.args?.point).toEqualTypeOf<
    Hex | { x: bigint; y: bigint } | undefined
  >()
  expectTypeOf(hashed.args?.note).toEqualTypeOf<string | undefined>()

  // An event without inputs has `args: undefined` in both modes.
  expectTypeOf(
    decodeEventLog({
      abi: eventsAbi,
      topics,
      eventName: 'Ping',
      strict: false,
    }),
  ).toEqualTypeOf<{ eventName: 'Ping'; args: undefined }>()
})

test('wide abi: any eventName, the fixed return shape', () => {
  const fromAbi = decodeEventLog({
    abi: eventsAbi as Abi,
    topics,
    eventName: 'Anything',
    strict: false,
  })
  expectTypeOf(fromAbi).toEqualTypeOf<DecodeEventLogReturnType>()
  const fromUnknown = decodeEventLog({
    abi: eventsAbi as readonly unknown[],
    topics,
  })
  expectTypeOf(fromUnknown).toEqualTypeOf<DecodeEventLogReturnType>()
  expectTypeOf<DecodeEventLogReturnType>().toEqualTypeOf<{
    eventName: string
    args: Record<string, unknown> | readonly unknown[] | undefined
  }>()

  // The unparameterised parameters accept a literal abi.
  const parameters: DecodeEventLogParameters = {
    abi: eventsAbi,
    topics,
    eventName: 'Transfer',
    strict: false,
  }
  expectTypeOf(
    decodeEventLog(parameters),
  ).toEqualTypeOf<DecodeEventLogReturnType>()
})

test('DecodedEvent / DecodedEventArgs helpers', () => {
  type Transfer = (typeof trc20Abi)[0]
  // `strict` defaults to `true`.
  expectTypeOf<DecodedEventArgs<Transfer>>().toEqualTypeOf<TransferArgs>()
  expectTypeOf<DecodedEventArgs<Transfer, true>>().toEqualTypeOf<TransferArgs>()
  expectTypeOf<DecodedEvent<Transfer>>().toEqualTypeOf<{
    eventName: 'Transfer'
    args: TransferArgs
  }>()
  // Distributes over the abi items; non-events drop out.
  expectTypeOf<
    DecodedEvent<(typeof eventsAbi)[number]>['eventName']
  >().toEqualTypeOf<'Transfer' | 'Approval' | 'Unnamed' | 'Hashed' | 'Ping'>()
  expectTypeOf<DecodedEvent<(typeof eventsAbi)[2]>>().toBeNever()
})
