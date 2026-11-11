import type { TronAbiParameterToPrimitiveType } from '../utils/abi/encodeAbiParameters.js'
import type { Hex } from './misc.js'
import type { ExactPartial, Filter } from './utils.js'

/** Decoded `args` of an event whose inputs are not known at the type level. */
type WideEventArgs = Record<string, unknown> | readonly unknown[]

/** An event that is not known at the type level. */
type WideEvent = { type: 'event'; name: string }

/**
 * ABI types whose indexed value is stored in the topic as its `keccak256`
 * hash: `string`, `bytes`, tuples and arrays.
 */
type HashedEventType = 'string' | 'bytes' | 'tuple' | `${string}[${string}]`

/** ABI types an indexed-argument filter cannot be built for: tuples and arrays. */
type UnfilterableEventType = 'tuple' | `${string}[${string}]`

//////////////////////////////////////////////////////////////////////
// Decoded event args

/**
 * The decoded value of one event input: its TRON `outputs` primitive
 * (`address` → Base58Check, integers → `bigint`), except that an indexed input
 * of a hashed type decodes to its 32-byte topic. Without `strict` such an
 * input can also carry its real value, recovered from `data`.
 */
type DecodedEventArg<
  input,
  strict extends boolean,
  _value = input extends { type: string }
    ? TronAbiParameterToPrimitiveType<input, 'outputs'>
    : unknown,
> = input extends { type: HashedEventType; indexed?: infer indexed }
  ? unknown extends indexed
    ? _value
    : true extends indexed
      ? [strict, indexed] extends [true, true]
        ? Hex
        : Hex | _value
      : _value
  : _value

/** The name of an event input: its literal, or `undefined` when it has none. */
type EventInputName<input> = input extends { name: infer name }
  ? name
  : input extends { name?: infer name }
    ? name | undefined
    : undefined

/** Decoded args keyed by input name — every input is named. */
type NamedEventArgs<
  inputs extends readonly unknown[],
  strict extends boolean,
> = {
  [input in inputs[number] as input extends {
    name: infer name extends string
  }
    ? name
    : never]: DecodedEventArg<input, strict>
} extends infer args
  ? strict extends true
    ? args
    : ExactPartial<args> | undefined
  : never

/** Decoded args by input position — at least one input is unnamed. */
type PositionalEventArgs<
  inputs extends readonly unknown[],
  strict extends boolean,
> = strict extends true
  ? { [key in keyof inputs]: DecodedEventArg<inputs[key], strict> }
  :
      | {
          [key in keyof inputs]?:
            | DecodedEventArg<inputs[key], strict>
            | undefined
        }
      | undefined

/**
 * The `args` `decodeEventLog` returns for `abiEvent`: an object keyed by input
 * name when every input is named, otherwise a positional tuple over all
 * inputs. Values are the TRON `outputs` primitives; an indexed `string` /
 * `bytes` / tuple / array input is its 32-byte topic.
 *
 * With `strict: true` every input is present. With `strict: false` each input
 * is optional and `args` is `undefined` when none was recovered. An event
 * without inputs has `args: undefined`. An event whose inputs are not a
 * literal tuple keeps the wide `Record<string, unknown> | readonly unknown[]`.
 */
export type DecodedEventArgs<
  abiEvent,
  strict extends boolean = true,
> = abiEvent extends { inputs: infer inputs extends readonly unknown[] }
  ? number extends inputs['length']
    ? WideEventArgs | undefined
    : inputs extends readonly []
      ? undefined
      : EventInputName<inputs[number]> extends infer name
        ? string extends name
          ? WideEventArgs | undefined
          : undefined extends name
            ? PositionalEventArgs<inputs, strict>
            : '' extends name
              ? PositionalEventArgs<inputs, strict>
              : NamedEventArgs<inputs, strict>
        : never
  : WideEventArgs | undefined

/**
 * The `{ eventName, args }` pair `decodeEventLog` returns for one ABI item,
 * distributed over a union of items: an event contributes its literal name and
 * {@link DecodedEventArgs}, any other ABI item contributes nothing, and an
 * item that is not known at the type level contributes the wide pair.
 */
export type DecodedEvent<
  abiItem,
  strict extends boolean = true,
> = abiItem extends { type: 'event'; name: infer name extends string }
  ? {
      /** The decoded event name. */
      eventName: name
      /**
       * The decoded parameters (keyed by name, or positional for unnamed
       * inputs), normalized to TRON/JS types: `address` → Base58Check,
       * integers → `bigint`.
       */
      args: DecodedEventArgs<abiItem, strict>
    }
  : abiItem extends { type: infer type extends string }
    ? 'event' extends type
      ? DecodedEvent<WideEvent, strict>
      : never
    : DecodedEvent<WideEvent, strict>

/**
 * The items of `abi` a log can decode against: all of them, or — when
 * `eventName` is given — the events named so, plus any item whose name is not
 * known at the type level. An `eventName` that can be `undefined` selects all
 * of them, as does a plain `string` (every name matches it); an empty list of
 * names (`never`) leaves none.
 */
export type EventCandidates<
  abi extends readonly unknown[],
  eventName extends string | undefined = undefined,
  _abiItem = abi[number],
> = [eventName] extends [never]
  ? never
  : undefined extends eventName
    ? _abiItem
    : _abiItem extends { type: 'event'; name: infer name extends string }
      ? string extends name
        ? _abiItem
        : name extends eventName
          ? _abiItem
          : never
      : _abiItem

/**
 * The `{ eventName, args }` pair `parseEventLogs` — and so `getLogs` — adds to
 * a log. Same as {@link DecodedEvent}, except that without `strict` a log of
 * an event without inputs can also carry an empty `args` object.
 */
export type ParsedEvent<abiItem, strict extends boolean = true> =
  | DecodedEvent<abiItem, strict>
  | (strict extends true
      ? never
      : abiItem extends {
            type: 'event'
            name: infer name extends string
            inputs: readonly []
          }
        ? { eventName: name; args: Record<string, never> }
        : never)

//////////////////////////////////////////////////////////////////////
// Event filter args

/** Whether an event input declares `indexed` as a non-literal `boolean`. */
type HasWideIndexed<input> = input extends { indexed?: infer indexed }
  ? boolean extends indexed
    ? true
    : never
  : never

/**
 * The filter accepted for one indexed input: its TRON `inputs` primitive
 * (`string` / `bytes` take the raw value), a list of alternatives, or
 * `null` / `undefined` for a wildcard. A tuple or array input only takes the
 * wildcard.
 */
type EventFilterArg<input> = input extends { type: UnfilterableEventType }
  ? null | undefined
  : (
        input extends { type: string }
          ? TronAbiParameterToPrimitiveType<input, 'inputs'>
          : unknown
      ) extends infer value
    ? value | readonly value[] | null | undefined
    : never

/** Filter args keyed by name, over the named, filterable indexed inputs. */
type NamedEventFilterArgs<indexedInputs extends readonly unknown[]> = {
  [input in indexedInputs[number] as input extends {
    name: infer name extends string
    type: infer type
  }
    ? name extends ''
      ? never
      : type extends UnfilterableEventType
        ? never
        : name
    : never]?: EventFilterArg<input>
} extends infer args
  ? keyof args extends never
    ? never
    : args
  : never

/**
 * The indexed-argument filter `getLogs` accepts for `abiEvent`: positional
 * over its indexed inputs, or keyed by their names. Each value is the TRON
 * `inputs` primitive (any address form, `bigint | number` integers, the raw
 * `string` / `bytes`), a list of alternatives, or `null` / `undefined` for a
 * wildcard. Indexed tuples and arrays cannot be filtered on: they have no key,
 * and their position only takes the wildcard.
 *
 * An event whose inputs are not a literal tuple keeps the wide
 * `readonly unknown[] | Record<string, unknown>`.
 */
export type EventFilterArgs<abiEvent> = abiEvent extends {
  inputs: infer inputs extends readonly unknown[]
}
  ? number extends inputs['length']
    ? WideEventArgs
    : [HasWideIndexed<inputs[number]>] extends [never]
      ? Filter<inputs, { indexed: true }> extends infer indexedInputs extends
          readonly unknown[]
        ?
            | {
                [key in keyof indexedInputs]?: EventFilterArg<
                  indexedInputs[key]
                >
              }
            | NamedEventFilterArgs<indexedInputs>
        : never
      : WideEventArgs
  : WideEventArgs

/**
 * The wide filter type, `readonly unknown[] | Record<string, unknown>`, when
 * the type `args` of a filter cannot be checked against an event — an array of
 * unknown length, or an object without known keys — and `never` otherwise. It
 * lets a filter held in a variable of the wide type be passed next to a
 * literal event. An `args` that is itself `unknown` (a type parameter that was
 * not inferred) gives the wide type too.
 */
export type WideEventFilterArgs<args> = unknown extends args
  ? WideEventArgs
  : args extends readonly unknown[]
    ? number extends args['length']
      ? args | WideEventArgs
      : never
    : string extends keyof args
      ? args | WideEventArgs
      : never

/**
 * `eventName` when it is a plain `string` rather than a literal name, and
 * `never` otherwise.
 */
export type WideEventName<eventName> = string extends eventName
  ? eventName
  : never
