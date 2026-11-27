import type { Abi, AbiEvent, AbiParameter } from 'abitype'

import {
  AbiEventNotFoundError,
  type AbiEventNotFoundErrorType,
  AbiEventOverloadError,
  type AbiEventOverloadErrorType,
} from '../../errors/abi.js'
import {
  FilterTypeNotSupportedError,
  type FilterTypeNotSupportedErrorType,
} from '../../errors/log.js'
import {
  InvalidParameterError,
  type InvalidParameterErrorType,
} from '../../errors/parameter.js'
import type { ErrorType } from '../../errors/utils.js'
import type { Hex, LogTopic } from '../../types/misc.js'
import { type StringToHexErrorType, stringToHex } from '../encoding/toHex.js'
import { type Keccak256ErrorType, keccak256 } from '../hash/keccak256.js'
import {
  type ToEventSelectorErrorType,
  toEventSelector,
} from '../hash/toEventSelector.js'
import {
  type EncodeAbiParametersErrorType,
  encodeAbiParameters,
  getArrayComponents,
} from './encodeAbiParameters.js'
import { formatAbiItem } from './formatAbiItem.js'

export type EncodeEventTopicsParameters = {
  /** ABI containing the event definition. */
  abi: Abi | readonly unknown[]
  /**
   * Name of the event. May be omitted when the ABI contains exactly one event.
   * For an overloaded name, pass only the desired event definition in `abi`.
   */
  eventName?: string | undefined
  /**
   * Argument values, positional over the indexed inputs or keyed by their
   * names. Each key must match a named indexed input. A `null`/`undefined`
   * entry leaves that topic as a wildcard.
   */
  args?: readonly unknown[] | Record<string, unknown> | undefined
}

export type EncodeEventTopicsReturnType = LogTopic[]

export type EncodeEventTopicsErrorType =
  | AbiEventNotFoundErrorType
  | AbiEventOverloadErrorType
  | EncodeAbiParametersErrorType
  | FilterTypeNotSupportedErrorType
  | InvalidParameterErrorType
  | Keccak256ErrorType
  | StringToHexErrorType
  | ToEventSelectorErrorType
  | ErrorType

/**
 * Builds the log `topics` array for an event, per the Solidity ABI event
 * model: the first topic is the event selector (`keccak256` of the event
 * signature) unless the event is `anonymous`, followed by one topic per
 * indexed parameter. Indexed static values are ABI-encoded into a 32-byte
 * word; indexed `string`/`bytes` values are hashed with `keccak256` of their
 * raw bytes, since only their hash is recoverable from a log.
 *
 * An ARRAY of values for one indexed parameter is an OR-list of alternatives
 * (the {@link LogTopic} alternative-set form): each entry becomes its own
 * topic candidate, e.g. `args: { from: [a, b] }` filters logs from either
 * address.
 *
 * Indexed array/tuple parameters are NOT supported for filtering and throw
 * {@link FilterTypeNotSupportedError}: Solidity hashes them over a
 * non-standard in-place encoding, so a filter topic cannot be derived from
 * the standard ABI encoding.
 *
 * TRON behavior: indexed `address` topics encode the 20-byte EVM body,
 * left-padded to 32 bytes.
 *
 * @example
 * encodeEventTopics({
 *   abi,
 *   eventName: 'Transfer',
 *   args: { from: 'T...', to: 'T...' },
 * })
 */
export function encodeEventTopics(
  parameters: EncodeEventTopicsParameters,
): EncodeEventTopicsReturnType {
  const { abi, eventName, args } = parameters

  const abiItem = selectEvent(abi, eventName)
  const indexedInputs = (abiItem.inputs ?? []).filter((input) => input.indexed)

  const argTopics: LogTopic[] = []
  if (args) {
    const positionalArgs = Array.isArray(args) ? args : undefined
    const namedArgs = positionalArgs
      ? undefined
      : (args as Record<string, unknown>)
    if (namedArgs) {
      for (const name of Object.getOwnPropertyNames(namedArgs)) {
        if (!name || !indexedInputs.some((input) => input.name === name))
          throw new InvalidParameterError(
            `Event "${abiItem.name}" has no indexed input named "${name}".`,
            { param: name, reason: 'unknown-field' },
          )
      }
    }

    for (let i = 0; i < indexedInputs.length; i++) {
      const param = indexedInputs[i]!
      const name = param.name ?? ''
      const value =
        namedArgs && Object.hasOwn(namedArgs, name)
          ? namedArgs[name]
          : positionalArgs?.[i]
      if (value === undefined || value === null) {
        argTopics.push(null)
        continue
      }
      // Array/tuple params first: they cannot be filtered on at all, so an
      // array value must never be misread as an OR-list of them.
      if (
        param.type === 'tuple' ||
        getArrayComponents(param.type) !== undefined
      )
        throw new FilterTypeNotSupportedError(param.type)
      // An array VALUE is an OR-list of alternatives for this topic.
      argTopics.push(
        Array.isArray(value)
          ? value.map((v) => encodeArg(param, v))
          : encodeArg(param, value),
      )
    }
  }

  const signature = abiItem.anonymous
    ? undefined
    : (toEventSelector(formatAbiItem(abiItem)) as Hex)

  return signature ? [signature, ...argTopics] : argTopics
}

/////////////////////////////////////////////////////////////////////////////
// Internal

function selectEvent(
  abi: Abi | readonly unknown[],
  eventName: string | undefined,
): AbiEvent {
  const events = (abi as readonly { type?: string; name?: string }[]).filter(
    (item): item is AbiEvent =>
      item.type === 'event' && (!eventName || item.name === eventName),
  )
  const abiItem = events[0]
  if (!abiItem)
    throw new AbiEventNotFoundError(eventName, {
      docsPath: '/docs/abi/encodeEventTopics',
    })
  if (events.length === 1) return abiItem
  if (!eventName)
    throw new InvalidParameterError(
      'Specify `eventName` when the ABI contains multiple events, or pass only the desired event definition in `abi`.',
      { param: 'eventName', reason: 'conflict' },
    )
  throw new AbiEventOverloadError(
    eventName,
    events.map((event) => formatAbiItem(event)),
    'Pass only the desired event definition in `abi`.',
  )
}

/** Encodes a single indexed argument into its 32-byte topic word. */
function encodeArg(param: AbiParameter, value: unknown): Hex {
  if (param.type === 'string') return keccak256(stringToHex(value as string))
  if (param.type === 'bytes') return keccak256(value as Hex)
  return encodeAbiParameters([param], [value] as never)
}
