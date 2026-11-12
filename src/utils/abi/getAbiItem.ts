import type { Abi, AbiParameter } from 'abitype'

import {
  AbiItemAmbiguityError,
  type AbiItemAmbiguityErrorType,
} from '../../errors/abi.js'
import type { ErrorType } from '../../errors/utils.js'
import type {
  AbiItem,
  AbiItemArgs,
  AbiItemName,
  ExtractAbiItemForArgs,
} from '../../types/contract.js'
import type { Hex } from '../../types/misc.js'
import { isAddress } from '../address/isAddress.js'
import { isHex } from '../data/isHex.js'
import { toEventSelector } from '../hash/toEventSelector.js'
import { toFunctionSelector } from '../hash/toFunctionSelector.js'
import { formatAbiItem, formatAbiParams } from './formatAbiItem.js'

export type GetAbiItemParameters<
  abi extends Abi | readonly unknown[] = Abi,
  name extends AbiItemName<abi> = AbiItemName<abi>,
  args extends AbiItemArgs<abi, name> = AbiItemArgs<abi, name>,
> = {
  abi: abi
  args?: args | readonly unknown[] | undefined
  /** Item name, or a 4-byte function / 32-byte event selector (`0x…`). */
  name: name | Hex
}

export type GetAbiItemReturnType<
  abi extends Abi | readonly unknown[] = Abi,
  name extends AbiItemName<abi> = AbiItemName<abi>,
  args extends AbiItemArgs<abi, name> = AbiItemArgs<abi, name>,
> = abi extends Abi
  ? Abi extends abi
    ? AbiItem | undefined
    : ExtractAbiItemForArgs<abi, name, args> | undefined
  : AbiItem | undefined

export type GetAbiItemErrorType = AbiItemAmbiguityErrorType | ErrorType

/** Matches `uint`/`int` at any valid bit width (a bare `uint`/`int` = 256). */
const INTEGER_TYPE =
  /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/

/** Matches the dynamic `bytes` or any fixed-width `bytesN` (1 ≤ N ≤ 32). */
const BYTES_TYPE = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/

/**
 * Matches the trailing `[]` / `[M]` of an array type — stripping it yields
 * the element type, and the capture holds `M` (empty for dynamic arrays).
 */
const ARRAY_SUFFIX = /\[([0-9]*)\]$/

/**
 * Finds an ABI item by `name` or by 4-byte function / 32-byte event selector
 * (`0x…` hex). When several overloads share a name, `args` disambiguates them
 * by matching each argument against the candidate parameter types (`address`
 * matching is TRON-aware, accepting any address form). A combination that two
 * overloads could both encode throws {@link AbiItemAmbiguityError}, whatever
 * their order in `abi` — see {@link getAmbiguousTypes} for the type pairs.
 * Passing the 4-byte selector as `name`, or an `abi` holding the single
 * overload, selects one of them.
 *
 * @example
 * getAbiItem({ abi, name: 'transfer' })
 * getAbiItem({ abi, name: '0xa9059cbb' })
 */
export function getAbiItem<
  const abi extends Abi | readonly unknown[],
  name extends AbiItemName<abi>,
  const args extends AbiItemArgs<abi, name>,
>(
  parameters: GetAbiItemParameters<abi, name, args>,
): GetAbiItemReturnType<abi, name, args> {
  const {
    abi,
    args = [],
    name,
  } = parameters as {
    abi: Abi
    args?: readonly unknown[]
    name: string
  }

  const isSelector = isHex(name, { strict: false })
  const abiItems = abi.filter((abiItem) => {
    if (isSelector) {
      if (abiItem.type === 'function')
        return toFunctionSelector(abiItem) === name
      if (abiItem.type === 'event') return toEventSelector(abiItem) === name
      return false
    }
    return 'name' in abiItem && abiItem.name === name
  })

  if (abiItems.length === 0)
    return undefined as GetAbiItemReturnType<abi, name, args>
  if (abiItems.length === 1)
    return abiItems[0] as GetAbiItemReturnType<abi, name, args>

  const matchedAbiItems: AbiItem[] = []
  for (const abiItem of abiItems) {
    if (!('inputs' in abiItem)) continue
    if (!args || args.length === 0) {
      if (!abiItem.inputs || abiItem.inputs.length === 0)
        return abiItem as GetAbiItemReturnType<abi, name, args>
      continue
    }
    if (!abiItem.inputs) continue
    if (abiItem.inputs.length === 0) continue
    if (abiItem.inputs.length !== args.length) continue
    const matched = args.every((arg, index) => {
      const abiParameter = abiItem.inputs![index]
      if (!abiParameter) return false
      return isArgOfType(arg, abiParameter)
    })
    if (matched) {
      // Overloads that all structurally accept `args` are ambiguous when a
      // parameter position holds a pair of types `getAmbiguousTypes` reports.
      // This match is compared with every earlier one, nearest first, so the
      // outcome is the same for any order of the overloads in the ABI.
      for (let index = matchedAbiItems.length - 1; index >= 0; index--) {
        const matchedAbiItem = matchedAbiItems[index]!
        if (!('inputs' in matchedAbiItem) || !matchedAbiItem.inputs) continue
        const ambiguousTypes = getAmbiguousTypes(
          abiItem.inputs,
          matchedAbiItem.inputs,
          args,
        )
        if (ambiguousTypes)
          throw new AbiItemAmbiguityError(
            {
              formattedAbiItem: formatAbiItem(abiItem),
              type: ambiguousTypes[0]!,
            },
            {
              formattedAbiItem: formatAbiItem(matchedAbiItem),
              type: ambiguousTypes[1]!,
            },
          )
      }
      // With no ambiguous pair, the last structural match is the result,
      // matching the reference overload-resolution semantics.
      matchedAbiItems.push(abiItem)
    }
  }

  const matchedAbiItem = matchedAbiItems[matchedAbiItems.length - 1]
  if (matchedAbiItem)
    return matchedAbiItem as GetAbiItemReturnType<abi, name, args>
  return abiItems[0] as GetAbiItemReturnType<abi, name, args>
}

/**
 * Whether a runtime argument could be an ABI value of the given parameter's
 * type. `address` uses TRON-aware validation (any address form passes);
 * `trcToken` behaves like an integer. Used to disambiguate overloads.
 */
export function isArgOfType(arg: unknown, abiParameter: AbiParameter): boolean {
  const argType = typeof arg
  const abiParameterType = abiParameter.type
  switch (abiParameterType) {
    case 'address':
      return typeof arg === 'string' && isAddress(arg, { strict: false })
    case 'bool':
      return argType === 'boolean'
    case 'function':
      return argType === 'string'
    case 'string':
      return argType === 'string'
    case 'trcToken':
      return argType === 'number' || argType === 'bigint'
    default: {
      if (
        abiParameterType === 'tuple' &&
        'components' in abiParameter &&
        Array.isArray(abiParameter.components)
      ) {
        // Only a non-null object/array can be a tuple value. Without the
        // `object` guard a primitive string would "match" (Object.values(
        // 'ab') is ['a','b']) and steal the overload from foo(string); the
        // explicit null check keeps Object.values(null) from throwing,
        // since typeof null === 'object' too.
        if (arg === null || argType !== 'object') return false
        const values = Object.values(arg as Record<string, unknown>)
        // Arity is part of the tuple's identity: without this, an arg with
        // extra values also matches a shorter tuple, so two overloads that
        // differ only in component count both "match" — and the shorter one
        // encodes, silently dropping the caller's trailing values.
        if (values.length !== abiParameter.components.length) return false
        return abiParameter.components.every((component, index) => {
          if (Array.isArray(arg))
            return isArgOfType(values[index], component as AbiParameter)
          // Encoding reads an object tuple value by component name (see
          // encodeTuple), so matching must too — key order is irrelevant,
          // wrong key names never "match" positionally, and an object can
          // never satisfy an unnamed component.
          const name = (component as AbiParameter).name
          if (name === undefined) return false
          return isArgOfType(
            (arg as Record<string, unknown>)[name],
            component as AbiParameter,
          )
        })
      }

      // `(u)intN`
      if (INTEGER_TYPE.test(abiParameterType))
        return argType === 'number' || argType === 'bigint'

      // `bytes`, `bytesN`
      if (BYTES_TYPE.test(abiParameterType))
        return argType === 'string' || arg instanceof Uint8Array

      // arrays of any of the above; detected by the bare suffix so element
      // widths containing a 0 digit (uint160[], bytes20[]) are not skipped
      const arraySuffix = ARRAY_SUFFIX.exec(abiParameterType)
      if (arraySuffix) {
        if (!Array.isArray(arg)) return false
        // A fixed-size array only accepts exactly M values.
        if (arraySuffix[1] !== '' && arg.length !== Number(arraySuffix[1]))
          return false
        return arg.every((x: unknown) =>
          isArgOfType(x, {
            ...abiParameter,
            // Pop off `[]` or `[M]`.
            type: abiParameterType.replace(ARRAY_SUFFIX, ''),
          } as AbiParameter),
        )
      }

      return false
    }
  }
}

/**
 * Returns the first pair of parameter types (source, target) that could both
 * encode the corresponding argument, or `undefined` when the two parameter
 * lists are unambiguous. Tuples recurse component-wise and arrays
 * element-wise; an empty array still compares the element types once, so
 * arg-independent pairs (`address`/`bytes20`) stay ambiguous. On TRON,
 * `address` is ambiguous with `bytes20` and `bytes21` — the widths of the EVM
 * and the `41…` address forms — and with `string`/`bytes` when the
 * argument is a valid address. `string` is ambiguous with any `bytes`/`bytesN`
 * for a string argument, and differing bytes widths are ambiguous with each
 * other for a string/Uint8Array argument — like differing integer widths,
 * they accept the same arguments but select different functions.
 *
 * Two types that differ in shape are ambiguous for an argument both accept:
 * arrays of different length (`T[]` and `T[k]` for `k` elements), and a tuple
 * with an array (`(T,T)` and `T[2]` or `T[]` for an array-form value whose
 * elements fit both). The pair is reported as the two formatted types, e.g.
 * `['address[]', 'address[2]']` or `['(uint256,uint256)', 'uint256[2]']`.
 * The scalar types the two shapes hold have to be one type, or a pair
 * reported above for the value: `uint8[]` and `uint256[2]` are ambiguous for
 * two numbers, `address[]` and `bytes32[2]` are not for two addresses. Under
 * an empty array there is no element to inspect, and the two element types
 * are compared with no value — `T[]` and `T[2]`, or `T[2]` and `T[3]`, are
 * ambiguous as the element types of an empty array. An object-form tuple
 * value is not an array value, and an argument only one of the two types
 * accepts settles the position.
 */
export function getAmbiguousTypes(
  sourceParameters: readonly AbiParameter[],
  targetParameters: readonly AbiParameter[],
  args: readonly unknown[],
): [string, string] | undefined {
  for (const parameterIndex in sourceParameters) {
    const sourceParameter = sourceParameters[parameterIndex]!
    const targetParameter = targetParameters[parameterIndex]
    // The tuple recursion below passes the two overloads' component lists,
    // which need not be the same length. Where they diverge there is nothing
    // to compare against, and lists of different arity cannot encode
    // identically — so they are not ambiguous.
    if (!targetParameter) return undefined

    if (
      sourceParameter.type === 'tuple' &&
      targetParameter.type === 'tuple' &&
      'components' in sourceParameter &&
      'components' in targetParameter
    ) {
      const components = sourceParameter.components as readonly AbiParameter[]
      const arg = args[parameterIndex as unknown as number]
      // An object tuple value is read by component name at encode time (see
      // encodeTuple) and matched by name in `isArgOfType`, so it has to be
      // laid out positionally here too: indexing the object directly yields
      // `undefined` for every component, and the arg-dependent rules below
      // then never fire — the array form of the same call would throw while
      // the object form silently resolved. Both overloads had to match the
      // same object to reach this point, so their component names are the
      // same set and the source list is a faithful index. The array branch
      // below probes empty arrays with a placeholder element, so a tuple's
      // arg can legitimately be absent here.
      const tupleArgs =
        arg !== null && typeof arg === 'object' && !Array.isArray(arg)
          ? components.map(
              (component) =>
                (arg as Record<string, unknown>)[component.name ?? ''],
            )
          : ((arg ?? []) as readonly unknown[])
      const ambiguous = getAmbiguousTypes(
        components,
        targetParameter.components as readonly AbiParameter[],
        tupleArgs,
      )
      // An unambiguous tuple only settles this position — the remaining
      // parameters still have to be compared.
      if (ambiguous) return ambiguous
      continue
    }

    const sourceArray = ARRAY_SUFFIX.exec(sourceParameter.type)
    const targetArray = ARRAY_SUFFIX.exec(targetParameter.type)

    if (sourceArray && targetArray) {
      const sourceElement = {
        ...sourceParameter,
        type: sourceParameter.type.replace(ARRAY_SUFFIX, ''),
      } as AbiParameter
      const targetElement = {
        ...targetParameter,
        type: targetParameter.type.replace(ARRAY_SUFFIX, ''),
      } as AbiParameter
      const arg = args[parameterIndex as unknown as number]
      // Compare the element types against every element of the argument.
      // With no elements to inspect, probe once with no argument so
      // arg-independent pairs (address/bytes20) are still detected, while
      // arg-dependent ones (address/string) correctly stay unambiguous.
      const elements = Array.isArray(arg) && arg.length > 0 ? arg : [undefined]
      const ambiguous = getAmbiguousTypes(
        elements.map(() => sourceElement),
        elements.map(() => targetElement),
        elements,
      )
      if (ambiguous) return ambiguous
      // No element pair is ambiguous; `T[]` and `T[k]` (or, under an empty
      // array, `T[j]` and `T[k]`) still accept the same value.
      if (
        sourceArray[1] !== targetArray[1] &&
        isArgOfBoth(arg, sourceParameter, targetParameter)
      )
        return formatTypes(sourceParameter, targetParameter)
      continue
    }

    // A tuple and an array both accept an array-form value whose elements fit
    // the tuple's components and the array's element type.
    if (
      (sourceParameter.type === 'tuple' && targetArray) ||
      (sourceArray && targetParameter.type === 'tuple')
    ) {
      const arg = args[parameterIndex as unknown as number]
      if (isArgOfBoth(arg, sourceParameter, targetParameter))
        return formatTypes(sourceParameter, targetParameter)
      continue
    }

    const types = [sourceParameter.type, targetParameter.type] as [
      string,
      string,
    ]

    const ambiguous = (() => {
      // `address` overlaps every fixed bytes width an accepted address form
      // fits: `bytes20` (the EVM form) and, because `address` matching is
      // TRON-aware, `bytes21` (the `41…` form) — the one width where a
      // `0x41…` arg also ENCODES under the bytes overload, to a different
      // selector and word layout, so the last structural match would
      // silently pick the function by ABI order. No address is a valid value
      // of any other width; those pairs fail at encoding instead.
      if (types.includes('address') && types.some(isAddressWidthBytesType))
        return true
      if (types.includes('address') && types.includes('string'))
        return isAddressArg(args[parameterIndex as unknown as number])
      if (types.includes('address') && types.includes('bytes'))
        return isAddressArg(args[parameterIndex as unknown as number])
      // `string` and every `bytes`/`bytesN` all accept a string argument
      // while producing different selectors, so a string arg cannot pick
      // between the overloads.
      if (types.includes('string') && types.some(isBytesLikeType))
        return typeof args[parameterIndex as unknown as number] === 'string'
      // Differing bytes widths (`bytes` included) likewise all accept the
      // same string / Uint8Array arguments but select different functions.
      if (types.every(isBytesLikeType) && types[0] !== types[1]) {
        const arg = args[parameterIndex as unknown as number]
        return typeof arg === 'string' || arg instanceof Uint8Array
      }
      // Every integer-like type (`(u)intN` at any width, and the TRON
      // `trcToken`) encodes a number/bigint into the same left-padded 32-byte
      // word, while differing canonical widths still produce DIFFERENT
      // selectors — so a numeric arg cannot pick between the overloads, and
      // resolving one silently would call a different function. Equal
      // canonical types (`uint` is `uint256` to the selector) encode AND
      // select identically, so they settle nothing at this position.
      if (
        types.every(isIntegerLikeType) &&
        canonicalIntegerType(types[0]) !== canonicalIntegerType(types[1])
      ) {
        const arg = args[parameterIndex as unknown as number]
        return typeof arg === 'number' || typeof arg === 'bigint'
      }
      return false
    })()

    if (ambiguous) return types
  }

  return undefined
}

/**
 * Whether `arg` is a value of both parameter types with nothing in it to tell
 * them apart: both types accept it, and each pair of scalar types it is read
 * as is one type or a pair {@link getAmbiguousTypes} reports for that value.
 * An absent `arg` is the placeholder element of an empty array; the types are
 * then compared with no value.
 */
function isArgOfBoth(
  arg: unknown,
  sourceParameter: AbiParameter,
  targetParameter: AbiParameter,
): boolean {
  if (
    arg !== undefined &&
    !(isArgOfType(arg, sourceParameter) && isArgOfType(arg, targetParameter))
  )
    return false

  const sourceComponents = getTupleComponents(sourceParameter)
  const targetComponents = getTupleComponents(targetParameter)

  // An object-form value is read by component name by both tuples.
  if (
    sourceComponents &&
    targetComponents &&
    arg !== undefined &&
    !Array.isArray(arg)
  )
    return sourceComponents.every((sourceComponent) => {
      const targetComponent = targetComponents.find(
        (component) => component.name === sourceComponent.name,
      )
      return (
        targetComponent !== undefined &&
        isArgOfBoth(
          (arg as Record<string, unknown>)[sourceComponent.name ?? ''],
          sourceComponent,
          targetComponent,
        )
      )
    })

  // One parameter per value: a tuple's components, an array's element type
  // repeated. With no value, an array stands for as many elements as the
  // tuple it is compared with has components, or for one.
  const values = Array.isArray(arg) && arg.length > 0 ? arg : undefined
  const count =
    values?.length ?? sourceComponents?.length ?? targetComponents?.length ?? 1
  const sourceElements =
    sourceComponents ?? getArrayElements(sourceParameter, count)
  const targetElements =
    targetComponents ?? getArrayElements(targetParameter, count)

  if (!sourceElements || !targetElements) {
    // A scalar type and a tuple or array hold no common value.
    if (sourceElements || targetElements) return false
    return (
      canonicalIntegerType(sourceParameter.type) ===
        canonicalIntegerType(targetParameter.type) ||
      getAmbiguousTypes([sourceParameter], [targetParameter], [arg]) !==
        undefined
    )
  }

  return (
    sourceElements.length === targetElements.length &&
    sourceElements.every((sourceElement, index) =>
      isArgOfBoth(values?.[index], sourceElement, targetElements[index]!),
    )
  )
}

/** The components of a tuple parameter; `undefined` for any other type. */
function getTupleComponents(
  abiParameter: AbiParameter,
): readonly AbiParameter[] | undefined {
  if (abiParameter.type !== 'tuple') return undefined
  return 'components' in abiParameter
    ? (abiParameter.components as readonly AbiParameter[])
    : []
}

/**
 * The element parameter of an array parameter, `count` times; `undefined`
 * for any other type.
 */
function getArrayElements(
  abiParameter: AbiParameter,
  count: number,
): readonly AbiParameter[] | undefined {
  if (!ARRAY_SUFFIX.test(abiParameter.type)) return undefined
  const element = {
    ...abiParameter,
    type: abiParameter.type.replace(ARRAY_SUFFIX, ''),
  } as AbiParameter
  return Array.from({ length: count }, () => element)
}

/** The two parameter types as they appear in a formatted ABI item. */
function formatTypes(
  sourceParameter: AbiParameter,
  targetParameter: AbiParameter,
): [string, string] {
  return [
    formatAbiParams([sourceParameter]),
    formatAbiParams([targetParameter]),
  ]
}

function isAddressArg(arg: unknown): boolean {
  return typeof arg === 'string' && isAddress(arg, { strict: false })
}

/**
 * Whether a type is a fixed bytes width that an accepted address form fits:
 * `bytes20` (EVM hex) or `bytes21` (TRON `41…` hex).
 */
function isAddressWidthBytesType(type: string): boolean {
  return type === 'bytes20' || type === 'bytes21'
}

/** Whether a type encodes a number/bigint into a 32-byte word (`(u)intN` or the TRON `trcToken`). */
function isIntegerLikeType(type: string): boolean {
  return type === 'trcToken' || INTEGER_TYPE.test(type)
}

/** Whether a type is the dynamic `bytes` or any fixed-width `bytesN`. */
function isBytesLikeType(type: string): boolean {
  return BYTES_TYPE.test(type)
}

/**
 * Canonical form of an integer-like type: a bare `uint`/`int` is `uint256`/
 * `int256` in the selector signature (see `normalizeSignature`).
 */
function canonicalIntegerType(type: string): string {
  if (type === 'uint') return 'uint256'
  if (type === 'int') return 'int256'
  return type
}
