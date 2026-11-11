import type { Abi, AbiEvent } from 'abitype'

import type { ErrorType } from '../../errors/utils.js'
import type { ContractEventName } from '../../types/contract.js'
import type { EventCandidates, ParsedEvent } from '../../types/log.js'
import type { Hex } from '../../types/misc.js'
import type { InferProperty, Prettify } from '../../types/utils.js'
import {
  type ToEventSelectorErrorType,
  toEventSelector,
} from '../hash/toEventSelector.js'
import {
  type DecodeEventLogReturnType,
  decodeEventLog,
} from './decodeEventLog.js'
import { formatAbiItem } from './formatAbiItem.js'

/** The fields of a log `parseEventLogs` reads. */
type EventLogData = {
  /** The log topics (`topics[0]` is the event selector). */
  topics: readonly Hex[]
  /** ABI-encoded non-indexed parameters. */
  data: Hex
}

export type ParseEventLogsParameters<
  abi extends Abi | readonly unknown[] = Abi | readonly unknown[],
  eventName extends
    | ContractEventName<abi>
    | readonly ContractEventName<abi>[]
    | undefined =
    | ContractEventName<abi>
    | readonly ContractEventName<abi>[]
    | undefined,
  strict extends boolean | undefined = boolean | undefined,
  log extends EventLogData = EventLogData,
> = {
  /** ABI containing the event definitions. */
  abi: abi
  /**
   * The logs to decode — anything carrying `topics` and `data`, such as the
   * logs of `getLogs` or of a transaction's info.
   */
  logs: readonly log[]
  /** Restricts decoding to the event(s) of `abi` with this name / these names. */
  eventName?:
    | eventName
    | ContractEventName<abi>
    | readonly ContractEventName<abi>[]
    | undefined
  /**
   * Drop logs that do not decode exactly against the ABI, instead of
   * returning them partially decoded. @default true
   */
  strict?: strict | undefined
} & InferProperty<'eventName', eventName>

/**
 * The parsed logs: each input log's own fields plus the decoded `eventName`
 * and `args`, one union member per event of `abi` (restricted to `eventName`
 * when given; an `eventName` that can be `undefined` keeps every event).
 * `strict` follows the function's default: only `false` selects the partial
 * `args` form. An ABI that is not a literal keeps the wide `eventName: string`
 * and untyped `args`.
 */
export type ParseEventLogsReturnType<
  abi extends Abi | readonly unknown[] = Abi | readonly unknown[],
  eventName extends
    | ContractEventName<abi>
    | readonly ContractEventName<abi>[]
    | undefined =
    | ContractEventName<abi>
    | readonly ContractEventName<abi>[]
    | undefined,
  strict extends boolean | undefined = boolean | undefined,
  log extends EventLogData = EventLogData,
> = ParsedLog<
  log,
  ParsedEvent<
    EventCandidates<
      abi,
      eventName extends readonly (infer name)[] ? name : eventName
    >,
    [strict] extends [true | undefined] ? true : false
  >
>[]

/** `log` with its `eventName` / `args` replaced by those of `parsedEvent`. */
type ParsedLog<log, parsedEvent> = log extends unknown
  ? parsedEvent extends unknown
    ? Prettify<Omit<log, 'eventName' | 'args'> & parsedEvent>
    : never
  : never

export type ParseEventLogsErrorType = ToEventSelectorErrorType | ErrorType

/**
 * Decodes a list of logs against an ABI, keeping the logs that match one of
 * its events: each returned entry is the input log plus the decoded
 * `eventName` and `args` (addresses as Base58Check, integers as `bigint`).
 *
 * Events are matched by selector (`topics[0]`); `eventName` restricts the
 * events of `abi` that are considered. When several events share a selector
 * (ERC-20 vs ERC-721 `Transfer`), each is tried until one decodes. A log that
 * does not decode exactly against any of them is dropped by default
 * (`strict: true`); with `strict: false` it is returned partially decoded
 * against the first of them — `args` carries what its topics and data
 * recover. A log whose selector matches none of the considered events is
 * always dropped.
 *
 * With a literal (`as const`) `abi` the result is typed per event: `eventName`
 * is the literal name and `args` is inferred from that event's inputs, so
 * checking `eventName` narrows `args`.
 *
 * @example
 * const info = await getTransactionInfo(client, { id })
 * const logs = parseEventLogs({ abi: trc20Abi, logs: info.logs })
 * // [{ address: 'T…', topics: […], data: '0x…', eventName: 'Transfer', args: { from: 'T…', to: 'T…', value: 1000000n } }]
 */
export function parseEventLogs<
  const abi extends Abi | readonly unknown[],
  const eventName extends
    | ContractEventName<abi>
    | readonly ContractEventName<abi>[]
    | undefined = undefined,
  strict extends boolean | undefined = true,
  log extends EventLogData = EventLogData,
>(
  parameters: ParseEventLogsParameters<abi, eventName, strict, log>,
): ParseEventLogsReturnType<abi, eventName, strict, log> {
  const {
    abi,
    eventName,
    logs,
    strict = true,
  } = parameters as ParseEventLogsParameters

  const eventNames = (() => {
    if (!eventName) return undefined
    return typeof eventName === 'string' ? [eventName] : eventName
  })()

  // Several events can share one selector yet differ in indexed layout
  // (ERC-20 vs ERC-721 `Transfer`) — match candidates per log, by selector.
  const decodable = (abi as readonly { type?: string; name?: string }[])
    .filter(
      (item): item is AbiEvent =>
        item.type === 'event' &&
        (!eventNames || eventNames.includes(item.name as string)),
    )
    .map((abiEvent) => ({
      abiEvent,
      selector: toEventSelector(formatAbiItem(abiEvent)),
    }))

  const parsedLogs: (EventLogData & DecodeEventLogReturnType)[] = []
  for (const log of logs) {
    const candidates = decodable.filter(
      ({ selector }) => selector === log.topics[0],
    )
    // A selector outside the considered events is dropped in both modes.
    if (candidates.length === 0) continue

    // Try each candidate until one decodes exactly.
    let decoded: DecodeEventLogReturnType | undefined
    for (const { abiEvent } of candidates) {
      try {
        decoded = decodeEventLog({
          abi: [abiEvent],
          data: log.data,
          topics: log.topics,
        })
        break
      } catch {
        // Mismatched `data` / `topics` — try the next candidate.
      }
    }

    // No candidate decodes exactly: strict mode drops the log; otherwise fall
    // back to a partial decode against the first candidate, so the arguments
    // recoverable from the topics are still returned.
    if (!decoded) {
      if (strict) continue
      const fallback = candidates[0]!.abiEvent
      try {
        decoded = decodeEventLog({
          abi: [fallback],
          data: log.data,
          topics: log.topics,
          strict: false,
        })
      } catch {
        const isUnnamed = (fallback.inputs ?? []).some((input) => !input.name)
        decoded = { eventName: fallback.name, args: isUnnamed ? [] : {} }
      }
    }
    parsedLogs.push({
      ...log,
      eventName: decoded.eventName,
      args: decoded.args,
    })
  }
  return parsedLogs as ParseEventLogsReturnType<abi, eventName, strict, log>
}
