import type { Abi, AbiEvent, AbiParameter } from 'abitype'

import {
  AbiDecodingDataSizeTooSmallError,
  AbiEventNotFoundError,
  type AbiEventNotFoundErrorType,
  AbiEventSignatureEmptyTopicsError,
  type AbiEventSignatureEmptyTopicsErrorType,
  AbiEventSignatureNotFoundError,
  type AbiEventSignatureNotFoundErrorType,
  DecodeLogDataMismatchError,
  type DecodeLogDataMismatchErrorType,
  DecodeLogTopicsMismatchError,
  type DecodeLogTopicsMismatchErrorType,
} from '../../errors/abi.js'
import { PositionOutOfBoundsError } from '../../errors/cursor.js'
import type { ErrorType } from '../../errors/utils.js'
import type { ContractEventName } from '../../types/contract.js'
import type {
  DecodedEvent,
  EventCandidates,
  WideEventName,
} from '../../types/log.js'
import type { Hex } from '../../types/misc.js'
import type { InferProperty } from '../../types/utils.js'
import { size } from '../data/size.js'
import {
  type ToEventSelectorErrorType,
  toEventSelector,
} from '../hash/toEventSelector.js'
import {
  type DecodeAbiParametersErrorType,
  decodeAbiParameters,
} from './decodeAbiParameters.js'
import { getArrayComponents } from './encodeAbiParameters.js'
import { formatAbiItem, formatAbiParams } from './formatAbiItem.js'

export type DecodeEventLogParameters<
  abi extends Abi | readonly unknown[] = Abi | readonly unknown[],
  eventName extends string | undefined = ContractEventName<abi> | undefined,
  strict extends boolean | undefined = boolean | undefined,
> = {
  /** ABI containing the event definition. */
  abi: abi
  /** Ordered log topics (`topics[0]` is the selector for non-anonymous events). */
  topics: readonly Hex[]
  /** Non-indexed event data. */
  data?: Hex | undefined
  /**
   * Event name (required to decode `anonymous` events): one of the event
   * names of `abi`, or a name held as a plain `string`.
   */
  eventName?: ContractEventName<abi> | WideEventName<eventName> | undefined
  /**
   * Whether decoding must be exact. When `false`, an indexed parameter with no
   * topic is recovered from `data` instead, extra topics are ignored, and
   * `data` that fails to decode is skipped — the decodable subset of `args`
   * is still returned.
   * @default true
   */
  strict?: strict | undefined
} & InferProperty<'eventName', eventName>

/**
 * The decoded `{ eventName, args }`, one union member per event of `abi`
 * (restricted to `eventName` when it is a literal name), with `args` inferred
 * from the event's inputs — see `DecodedEventArgs`. An `eventName` that can be
 * `undefined`, or that is a plain `string`, keeps every event. `strict`
 * follows the function's default: only `false` selects the partial form. An
 * ABI that is not a literal keeps the wide `eventName: string` and untyped
 * `args`.
 */
export type DecodeEventLogReturnType<
  abi extends Abi | readonly unknown[] = Abi | readonly unknown[],
  eventName extends string | undefined = ContractEventName<abi> | undefined,
  strict extends boolean | undefined = boolean | undefined,
> = DecodedEvent<
  EventCandidates<abi, eventName>,
  [strict] extends [true | undefined] ? true : false
>

export type DecodeEventLogErrorType =
  | AbiEventNotFoundErrorType
  | AbiEventSignatureEmptyTopicsErrorType
  | AbiEventSignatureNotFoundErrorType
  | DecodeAbiParametersErrorType
  | DecodeLogDataMismatchErrorType
  | DecodeLogTopicsMismatchErrorType
  | ToEventSelectorErrorType
  | ErrorType

const docsPath = '/docs/abi/decodeEventLog'

/**
 * Decodes an event log into its parameter values, per the Solidity ABI event
 * model (the inverse of `encodeEventTopics` + `encodeAbiParameters`): the
 * event is resolved from `topics[0]` (the selector) or from `eventName`,
 * indexed parameters are read from `topics`, and non-indexed parameters are
 * decoded from `data`.
 *
 * Several events of `abi` can share one selector and differ only in which
 * inputs are indexed (TRC-20 vs TRC-721 `Transfer`). Each of them is tried in
 * ABI order and the first one the log decodes against exactly is the result,
 * with or without `strict`. When none decodes exactly, the first of them
 * decides: its mismatch is thrown, or with `strict: false` its partial decode
 * is returned. With `eventName`, the events tried are those of that name.
 *
 * TRON behavior: indexed/non-indexed `address` parameters decode to the
 * canonical Base58Check form (`T…`). Indexed dynamic parameters (`string`,
 * `bytes`, arrays, tuples) are only present as their `keccak256` hash in the
 * topic, so they decode to that 32-byte hash hex (not the original value).
 *
 * By default a log that does not match the event exactly throws
 * ({@link DecodeLogTopicsMismatchError} / {@link DecodeLogDataMismatchError})
 * — a missing topic for an indexed parameter and a log carrying more topics
 * than the event has indexed parameters both count as mismatches. With
 * `strict: false` the mismatch is tolerated instead: an indexed parameter with
 * no topic is recovered from `data`, extra topics are ignored, undecodable
 * `data` is skipped, and the decodable subset of `args` is returned.
 *
 * @example
 * decodeEventLog({ abi, topics, data })
 * // { eventName: 'Transfer', args: { from: 'T…', to: 'T…', value: 1000000n } }
 */
export function decodeEventLog<
  const abi extends Abi | readonly unknown[],
  eventName extends string | undefined = undefined,
  strict extends boolean | undefined = true,
>(
  parameters: DecodeEventLogParameters<abi, eventName, strict>,
): DecodeEventLogReturnType<abi, eventName, strict> {
  const {
    abi,
    topics,
    data,
    eventName,
    strict = true,
  } = parameters as DecodeEventLogParameters
  const candidates = selectEvents(abi, { eventName, topic0: topics[0] })

  // Events sharing one selector differ in indexed layout only: the first one
  // the log decodes against exactly is the result.
  if (candidates.length > 1)
    for (const abiItem of candidates) {
      try {
        return decodeEvent(abiItem, {
          topics,
          data,
          strict: true,
        }) as DecodeEventLogReturnType<abi, eventName, strict>
      } catch {
        // Mismatched `topics` / `data` — try the next candidate.
      }
    }

  // A single candidate, or none that decodes exactly: the first candidate
  // decides, in the requested mode.
  return decodeEvent(candidates[0]!, {
    topics,
    data,
    strict,
  }) as DecodeEventLogReturnType<abi, eventName, strict>
}

/////////////////////////////////////////////////////////////////////////////
// Internal

/** Whether an indexed value of this type is stored as its `keccak256` hash. */
function isHashedType(type: string): boolean {
  return (
    type === 'string' ||
    type === 'bytes' ||
    type === 'tuple' ||
    getArrayComponents(type) !== undefined
  )
}

/**
 * Decodes a log against one event: indexed parameters from `topics`,
 * non-indexed ones from `data`. With `strict`, a log that does not match the
 * event exactly throws; otherwise the decodable subset of `args` is returned.
 */
function decodeEvent(
  abiItem: AbiEvent,
  {
    topics,
    data,
    strict,
  }: { topics: readonly Hex[]; data?: Hex | undefined; strict: boolean },
): {
  eventName: string
  args: Record<string, unknown> | unknown[] | undefined
} {
  const inputs = (abiItem.inputs ?? []) as readonly AbiParameter[]

  // Anonymous events carry no selector, so every topic is an argument topic.
  const argTopics = abiItem.anonymous ? topics : topics.slice(1)

  // A log carrying MORE topics than the event has indexed parameters is not a
  // log of this event — reject it instead of silently dropping the extras.
  const indexedCount = inputs.filter(
    (input) => 'indexed' in input && input.indexed,
  ).length
  if (strict && argTopics.length > indexedCount)
    throw new DecodeLogTopicsMismatchError({
      abiItem,
      expectedTopics: indexedCount,
      formattedAbiItem: formatAbiItem(abiItem, { includeName: true }),
      receivedTopics: argTopics.length,
    })

  const isUnnamed = inputs.some((input) => !input.name)
  const args: Record<string, unknown> | unknown[] = isUnnamed ? [] : {}
  const setArg = (input: AbiParameter, index: number, value: unknown) => {
    if (isUnnamed) (args as unknown[])[index] = value
    else (args as Record<string, unknown>)[input.name!] = value
  }

  // Indexed parameters come from the topics, in declaration order.
  const missingIndexed: (readonly [AbiParameter, number])[] = []
  let topicIndex = 0
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!
    if (!('indexed' in input && input.indexed)) continue
    const topic = argTopics[topicIndex]
    topicIndex++
    if (topic === undefined) {
      if (strict)
        throw new DecodeLogTopicsMismatchError({
          abiItem,
          formattedAbiItem: formatAbiItem(abiItem, { includeName: true }),
          param: input as AbiParameter & { indexed: boolean },
        })
      // The emitting contract may not have actually indexed this parameter —
      // recover its value from `data` below.
      missingIndexed.push([input, i])
      continue
    }
    setArg(input, i, decodeTopic(input, topic))
  }

  // Non-indexed parameters come from `data`, joined — in lenient mode — by
  // the indexed parameters whose topics were missing. An emitter that did not
  // actually index them laid their values out in `data` at their DECLARATION
  // positions, so the merge must preserve declaration order.
  const missingIndexedAt = new Set(missingIndexed.map(([, i]) => i))
  const inputsToDecode: (readonly [AbiParameter, number])[] = []
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!
    if ('indexed' in input && input.indexed && !missingIndexedAt.has(i))
      continue
    inputsToDecode.push([input, i])
  }
  const paramsToDecode = inputsToDecode.map(([input]) => input)
  if (inputsToDecode.length > 0) {
    if (data && data !== '0x') {
      try {
        const decoded = decodeAbiParameters(
          paramsToDecode,
          data,
        ) as readonly unknown[]
        // Consume the decoded values in order, like `topicIndex` above. An
        // identity lookup (`paramsToDecode.indexOf(input)`) would resolve
        // every occurrence of a reused parameter object to its first slot.
        let dataIndex = 0
        for (const [input, i] of inputsToDecode)
          setArg(input, i, decoded[dataIndex++])
      } catch (err) {
        if (strict) {
          if (
            err instanceof AbiDecodingDataSizeTooSmallError ||
            err instanceof PositionOutOfBoundsError
          )
            throw new DecodeLogDataMismatchError({
              abiItem,
              data,
              formattedParams: formatAbiParams(paramsToDecode, {
                includeName: true,
              }),
              params: paramsToDecode,
              size: size(data),
            })
          throw err
        }
        // Lenient mode keeps whatever the topics yielded.
      }
    } else if (strict) {
      throw new DecodeLogDataMismatchError({
        abiItem,
        data: data ?? '0x',
        formattedParams: formatAbiParams(paramsToDecode, {
          includeName: true,
        }),
        params: paramsToDecode,
        size: data ? size(data) : 0,
      })
    }
  }

  return {
    eventName: abiItem.name,
    args: (Array.isArray(args) ? args.length : Object.keys(args).length)
      ? args
      : undefined,
  }
}

/**
 * The events of `abi` a log can decode against, in ABI order: the
 * non-anonymous events whose selector is `topic0`, restricted to the events
 * named `eventName` when it is given. With no selector to go by — a log
 * without topics, or events of that name that are all anonymous — the first
 * event named `eventName` is the only candidate.
 */
function selectEvents(
  abi: Abi | readonly unknown[],
  {
    eventName,
    topic0,
  }: { eventName?: string | undefined; topic0?: Hex | undefined },
): readonly AbiEvent[] {
  const events = (abi as readonly { type?: string; name?: string }[]).filter(
    (item): item is AbiEvent => item.type === 'event',
  )

  if (eventName) {
    const named = events.filter((event) => event.name === eventName)
    if (named.length === 0)
      throw new AbiEventNotFoundError(eventName, { docsPath })
    // A non-anonymous log's topic0 IS the event's identity — validate it (and
    // disambiguate overloads) instead of matching by the name label alone.
    if (topic0) {
      const matched = filterBySelector(named, topic0)
      if (matched.length > 0) return matched
      // All-anonymous candidates: topic0 is the first indexed arg, not a
      // selector — the name match is all there is to go on.
      if (named.every((event) => event.anonymous)) return [named[0]!]
      throw new AbiEventSignatureNotFoundError(topic0, { docsPath })
    }
    return [named[0]!]
  }

  if (!topic0) throw new AbiEventSignatureEmptyTopicsError({ docsPath })
  const matched = filterBySelector(events, topic0)
  if (matched.length === 0)
    throw new AbiEventSignatureNotFoundError(topic0, { docsPath })
  return matched
}

/**
 * The non-anonymous events of `events` whose selector is `selector`, in ABI
 * order. Events sharing a selector share a name: up to the first match every
 * event is compared, and past it only the events of that name are, one whose
 * signature cannot be formed counting as no match.
 */
function filterBySelector(
  events: readonly AbiEvent[],
  selector: Hex,
): readonly AbiEvent[] {
  const matched: AbiEvent[] = []
  for (const event of events) {
    if (event.anonymous) continue
    if (matched.length === 0) {
      if (toEventSelector(formatAbiItem(event)) === selector)
        matched.push(event)
      continue
    }
    if (event.name !== matched[0]!.name) continue
    try {
      if (toEventSelector(formatAbiItem(event)) === selector)
        matched.push(event)
    } catch {
      // No signature to compare — not an event of this selector.
    }
  }
  return matched
}

/** Decodes a single indexed topic back to its value (or its hash hex). */
function decodeTopic(param: AbiParameter, topic: Hex): unknown {
  // Dynamic indexed values are only recoverable as their keccak256 hash.
  if (isHashedType(param.type)) return topic
  const [value] = decodeAbiParameters([param], topic)
  return value
}
