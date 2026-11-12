import type {
  Abi,
  AbiConstructor,
  AbiFunction,
  AbiParameter,
  AbiStateMutability,
  ExtractAbiError,
  ExtractAbiErrorNames,
  ExtractAbiEvent,
  ExtractAbiEventNames,
  ExtractAbiFunction,
  ExtractAbiFunctionNames,
} from 'abitype'

import type { TronAbiParametersToPrimitiveTypes } from '../utils/abi/encodeAbiParameters.js'
import type { DecodedEventArgs, EventFilterArgs } from './log.js'
import type { IsUnion, UnionToTuple } from './utils.js'

export type ContractFunctionName<
  abi extends Abi | readonly unknown[] = Abi,
  mutability extends AbiStateMutability = AbiStateMutability,
> =
  ExtractAbiFunctionNames<
    abi extends Abi ? abi : Abi,
    mutability
  > extends infer functionName extends string
    ? [functionName] extends [never]
      ? string
      : functionName
    : string

export type ContractErrorName<abi extends Abi | readonly unknown[] = Abi> =
  ExtractAbiErrorNames<
    abi extends Abi ? abi : Abi
  > extends infer errorName extends string
    ? [errorName] extends [never]
      ? string
      : errorName
    : string

export type ContractEventName<abi extends Abi | readonly unknown[] = Abi> =
  ExtractAbiEventNames<
    abi extends Abi ? abi : Abi
  > extends infer eventName extends string
    ? [eventName] extends [never]
      ? string
      : eventName
    : string

/**
 * The argument tuple of a contract function, in the TRON `inputs` mapping:
 * `address` accepts any TRON form (`T…` Base58Check, `41…` hex, `0x…` EVM),
 * integers accept `bigint | number`. An overloaded name gives the union of
 * its overloads' tuples. Falls back to `readonly unknown[]` when the function
 * cannot be extracted (wide abi, unknown name).
 */
export type ContractFunctionArgs<
  abi extends Abi | readonly unknown[] = Abi,
  mutability extends AbiStateMutability = AbiStateMutability,
  functionName extends ContractFunctionName<
    abi,
    mutability
  > = ContractFunctionName<abi, mutability>,
> =
  ExtractAbiFunction<
    abi extends Abi ? abi : Abi,
    functionName,
    mutability
  > extends infer abiFunction
    ? [abiFunction] extends [never]
      ? readonly unknown[]
      : abiFunction extends AbiFunction // one tuple per overload
        ? TronAbiParametersToPrimitiveTypes<abiFunction['inputs'], 'inputs'>
        : never
    : readonly unknown[]

/**
 * The argument tuple of the constructor, in the TRON `inputs` mapping (see
 * {@link ContractFunctionArgs}). Falls back to `readonly unknown[]` when the
 * abi is wide or declares no constructor.
 */
export type ContractConstructorArgs<
  abi extends Abi | readonly unknown[] = Abi,
> =
  TronAbiParametersToPrimitiveTypes<
    Extract<
      (abi extends Abi ? abi : Abi)[number],
      { type: 'constructor' }
    >['inputs'],
    'inputs'
  > extends infer args
    ? [args] extends [never]
      ? readonly unknown[]
      : args
    : readonly unknown[]

/**
 * The argument tuple of a contract error, in the TRON `inputs` mapping (see
 * {@link ContractFunctionArgs}) — what `encodeErrorResult` takes. Falls back
 * to `readonly unknown[]` when the error cannot be extracted.
 */
export type ContractErrorArgs<
  abi extends Abi | readonly unknown[] = Abi,
  errorName extends ContractErrorName<abi> = ContractErrorName<abi>,
> =
  TronAbiParametersToPrimitiveTypes<
    ExtractAbiError<abi extends Abi ? abi : Abi, errorName>['inputs'],
    'inputs'
  > extends infer args
    ? [args] extends [never]
      ? readonly unknown[]
      : args
    : readonly unknown[]

/**
 * The indexed-argument filter of a contract event — what `getLogs` and
 * `encodeEventTopics` take as `args`: see {@link EventFilterArgs}. Values are
 * in the TRON `inputs` mapping. Falls back to the wide
 * `readonly unknown[] | Record<string, unknown>` when the event cannot be
 * extracted.
 */
export type ContractEventArgs<
  abi extends Abi | readonly unknown[] = Abi,
  eventName extends ContractEventName<abi> = ContractEventName<abi>,
> =
  EventFilterArgs<
    ExtractAbiEvent<abi extends Abi ? abi : Abi, eventName>
  > extends infer args
    ? [args] extends [never]
      ? readonly unknown[] | Record<string, unknown>
      : args
    : readonly unknown[] | Record<string, unknown>

/**
 * The decoded arguments of a contract event — the `args` `decodeEventLog`
 * returns: see {@link DecodedEventArgs}. Values are in the TRON `outputs`
 * mapping (`address` → Base58Check, integers → `bigint`); an indexed
 * `string` / `bytes` / tuple / array input is its 32-byte topic. Falls back
 * to the wide `readonly unknown[] | Record<string, unknown> | undefined` when
 * the event cannot be extracted.
 */
export type ContractEventArgsFromTopics<
  abi extends Abi | readonly unknown[] = Abi,
  eventName extends ContractEventName<abi> = ContractEventName<abi>,
  strict extends boolean = true,
> =
  DecodedEventArgs<
    ExtractAbiEvent<abi extends Abi ? abi : Abi, eventName>,
    strict
  > extends infer args
    ? [args] extends [never]
      ? readonly unknown[] | Record<string, unknown> | undefined
      : args
    : readonly unknown[] | Record<string, unknown> | undefined

/**
 * The function of `abi` selected by `functionName` and `args`: an overloaded
 * name is narrowed to the overloads whose TRON `inputs` tuple
 * ({@link ContractFunctionArgs}) accepts `args`, so any address form selects
 * an `address` overload. `never` when no overload accepts `args`.
 */
export type ExtractAbiFunctionForArgs<
  abi extends Abi,
  mutability extends AbiStateMutability,
  functionName extends ContractFunctionName<abi, mutability>,
  args extends ContractFunctionArgs<abi, mutability, functionName>,
> =
  ExtractAbiFunction<
    abi,
    functionName,
    mutability
  > extends infer abiFunction extends AbiFunction
    ? IsUnion<abiFunction> extends true // narrow overloads using `args` by converting to tuple and filtering out overloads that don't match
      ? UnionToTuple<abiFunction> extends infer abiFunctions extends
          readonly AbiFunction[]
        ? // convert back to union (removes `never` tuple entries)
          {
            [k in keyof abiFunctions]: CheckArgs<abiFunctions[k], args>
          }[number]
        : never
      : abiFunction
    : never
type CheckArgs<
  abiItem extends { inputs: readonly AbiParameter[] },
  args,
  ///
  targetArgs = TronAbiParametersToPrimitiveTypes<abiItem['inputs'], 'inputs'>,
> = (readonly [] extends args ? readonly [] : args) extends targetArgs // fallback to `readonly []` if `args` has no value (e.g. `args` property not provided)
  ? abiItem
  : never

/**
 * The return type of a contract function, in the TRON `outputs` mapping:
 * `address` is the Base58Check `Address`, integers are `bigint`; `[]` →
 * `void`, `[x]` → `x`, otherwise the positional tuple. An overloaded name is
 * narrowed by `args` (see {@link ExtractAbiFunctionForArgs}). `unknown` when
 * the abi is wide or no overload accepts `args`.
 */
export type ContractFunctionReturnType<
  abi extends Abi | readonly unknown[] = Abi,
  mutability extends AbiStateMutability = AbiStateMutability,
  functionName extends ContractFunctionName<
    abi,
    mutability
  > = ContractFunctionName<abi, mutability>,
  args extends ContractFunctionArgs<
    abi,
    mutability,
    functionName
  > = ContractFunctionArgs<abi, mutability, functionName>,
> = abi extends Abi
  ? Abi extends abi
    ? unknown
    : ExtractAbiFunctionForArgs<
          abi,
          mutability,
          functionName,
          args
        > extends infer abiFunction
      ? [abiFunction] extends [never]
        ? unknown
        : abiFunction extends AbiFunction
          ? TronAbiParametersToPrimitiveTypes<
              abiFunction['outputs'],
              'outputs'
            > extends infer types
            ? types extends readonly []
              ? void
              : types extends readonly [infer type]
                ? type
                : types
            : never
          : unknown
      : never
  : unknown

//////////////////////////////////////////////////////////////////////
// Call value

/**
 * Whether an ABI function or constructor is `payable`: its `stateMutability`
 * is `payable`, or it carries the legacy `payable: true` flag. For a union of
 * items, `true` when any of them is; `false` for `never`.
 */
export type IsPayable<abiItem extends { stateMutability: AbiStateMutability }> =
  'payable' extends abiItem['stateMutability']
    ? true
    : [Extract<abiItem, { payable: true }>] extends [never]
      ? false
      : true

/**
 * The overloads of a function that `args` select. `abiFunction` is the union
 * of the overloads; each tuple of `args` selects the overloads whose TRON
 * `inputs` tuple accepts it, as in {@link ExtractAbiFunctionForArgs}, and a
 * union of tuples selects the overloads of every member. `never` when no
 * overload accepts `args`, or `args` is `any`.
 */
type ExtractOverloadsForArgs<
  abiFunction extends AbiFunction,
  args,
> = 0 extends 1 & args
  ? never
  : args extends unknown // one tuple of `args` at a time
    ? abiFunction extends AbiFunction // one overload at a time
      ? CheckArgs<abiFunction, args>
      : never
    : never

/**
 * Whether the overloads of a function that `args` select are `payable`:
 * `true` when any selected overload is (see {@link IsPayable}). `abiFunction`
 * is the union of the overloads. When `args` select no overload, every
 * overload counts.
 */
export type IsAbiFunctionPayable<abiFunction extends AbiFunction, args> =
  ExtractOverloadsForArgs<abiFunction, args> extends infer selected extends
    AbiFunction
    ? IsPayable<[selected] extends [never] ? abiFunction : selected>
    : never

/**
 * Whether the function a contract call selects is `payable`, i.e. whether the
 * call takes `callValue` / `callTokenValue` / `tokenId`:
 * - the overload selected by `functionName` and `args` decides;
 * - `args` that are a union of tuples (the default: every overload's tuple)
 *   select one overload per tuple, and any `payable` one gives `true`;
 * - when `args` select no overload, any `payable` overload of the name gives
 *   `true`;
 * - `true` when the function is not known at the type level: a wide abi, a
 *   `functionName` that is not a single literal, or a name the abi type does
 *   not list under `mutability`.
 */
export type IsContractFunctionPayable<
  abi extends Abi | readonly unknown[] = Abi,
  mutability extends AbiStateMutability = AbiStateMutability,
  functionName extends ContractFunctionName<
    abi,
    mutability
  > = ContractFunctionName<abi, mutability>,
  args extends ContractFunctionArgs<
    abi,
    mutability,
    functionName
  > = ContractFunctionArgs<abi, mutability, functionName>,
> = abi extends Abi
  ? Abi extends abi
    ? true
    : string extends functionName
      ? true
      : IsUnion<functionName> extends true
        ? true
        : ExtractAbiFunction<
              abi,
              functionName,
              mutability
            > extends infer abiFunction extends AbiFunction
          ? [abiFunction] extends [never]
            ? true
            : IsAbiFunctionPayable<abiFunction, args>
          : never
  : true

/**
 * Whether the constructor of `abi` is `payable`, i.e. whether a deployment
 * takes `callValue` / `callTokenValue` / `tokenId`. An abi tuple without a
 * constructor gives `false`; an abi that is not a tuple of items (a wide abi,
 * an array type) and lists no constructor gives `true`.
 */
export type IsContractConstructorPayable<
  abi extends Abi | readonly unknown[] = Abi,
> = abi extends Abi
  ? Extract<
      abi[number],
      { type: 'constructor' }
    > extends infer abiConstructor extends AbiConstructor
    ? [abiConstructor] extends [never]
      ? number extends abi['length']
        ? true
        : false
      : IsPayable<abiConstructor>
    : never
  : true

/**
 * The type of a call value option (`callValue`, `callTokenValue`, `tokenId`):
 * `bigint` when the called function is `payable`, `undefined` when it is not.
 */
export type CallValue<payable extends boolean = boolean> = [payable] extends [
  false,
]
  ? undefined
  : bigint

/**
 * The call value options of a contract call: each is a {@link CallValue} of
 * `payable`.
 */
export type CallValueOptions<payable extends boolean = boolean> = {
  callValue?: CallValue<payable> | undefined
  callTokenValue?: CallValue<payable> | undefined
  tokenId?: CallValue<payable> | undefined
}

export type AbiItem = Abi[number]

export type ExtractAbiItemNames<abi extends Abi> = Extract<
  abi[number],
  { name: string }
>['name']

export type ExtractAbiItem<
  abi extends Abi,
  name extends ExtractAbiItemNames<abi>,
> = Extract<abi[number], { name: name }>

export type AbiItemName<abi extends Abi | readonly unknown[] = Abi> =
  abi extends Abi ? ExtractAbiItemNames<abi> : string

/**
 * The argument tuple of a named ABI item (function, event or error), in the
 * TRON `inputs` mapping (see {@link ContractFunctionArgs}) — what
 * `getAbiItem` takes to pick an overload. Falls back to `readonly unknown[]`
 * when the item cannot be extracted.
 */
export type AbiItemArgs<
  abi extends Abi | readonly unknown[] = Abi,
  name extends AbiItemName<abi> = AbiItemName<abi>,
> =
  ExtractAbiItem<abi extends Abi ? abi : Abi, name> extends infer abiItem
    ? [abiItem] extends [never]
      ? readonly unknown[]
      : abiItem extends { inputs: readonly AbiParameter[] } // one tuple per overload
        ? TronAbiParametersToPrimitiveTypes<abiItem['inputs'], 'inputs'>
        : never
    : readonly unknown[]

/**
 * The item of `abi` selected by `name` and `args`: an overloaded name is
 * narrowed to the overloads whose TRON `inputs` tuple ({@link AbiItemArgs})
 * accepts `args`. `never` when no overload accepts `args`.
 */
export type ExtractAbiItemForArgs<
  abi extends Abi,
  name extends AbiItemName<abi>,
  args extends AbiItemArgs<abi, name>,
> =
  ExtractAbiItem<abi, name> extends infer abiItem extends AbiItem & {
    inputs: readonly AbiParameter[]
  }
    ? IsUnion<abiItem> extends true // narrow overloads using `args` by converting to tuple and filtering out overloads that don't match
      ? UnionToTuple<abiItem> extends infer abiItems extends
          readonly (AbiItem & {
            inputs: readonly AbiParameter[]
          })[]
        ? {
            [k in keyof abiItems]: CheckArgs<abiItems[k], args>
          }[number] // convert back to union (removes `never` tuple entries: `['foo', never, 'bar'][number]` => `'foo' | 'bar'`)
        : never
      : abiItem
    : never
