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
import { normalizeSignature } from '../hash/normalizeSignature.js'
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
 * matching is TRON-aware, accepting any address form). If multiple candidates
 * structurally accept all arguments but have different selectors, throws
 * {@link AbiItemAmbiguityError}, regardless of their order in `abi`. Empty
 * arrays cannot distinguish their element types. Duplicate signatures and
 * canonical aliases such as `uint`/`uint256` share a selector and are allowed.
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

  let matchedAbiItem: AbiItem | undefined
  let matchedSelector: Hex | undefined
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
      const signature = formatAbiItem(abiItem)
      const selector =
        abiItem.type === 'event'
          ? toEventSelector(signature)
          : toFunctionSelector(signature)
      // Every retained match has the same selector. The type comparison is
      // only for the diagnostic; it must never decide whether two matching
      // candidates with different selectors are safe to choose between.
      if (
        matchedAbiItem &&
        'inputs' in matchedAbiItem &&
        selector !== matchedSelector
      ) {
        const ambiguousTypes = getAmbiguousTypes(
          abiItem.inputs,
          matchedAbiItem.inputs ?? [],
          args,
        ) ?? [
          formatAbiParams(abiItem.inputs),
          formatAbiParams(matchedAbiItem.inputs),
        ]
        throw new AbiItemAmbiguityError(
          {
            formattedAbiItem: signature,
            type: ambiguousTypes[0]!,
          },
          {
            formattedAbiItem: formatAbiItem(matchedAbiItem),
            type: ambiguousTypes[1]!,
          },
        )
      }
      matchedAbiItem = abiItem
      matchedSelector = selector
    }
  }

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
        if (arg === null || typeof arg !== 'object') return false
        // Arity is part of the tuple's identity: without this, an arg with
        // extra values also matches a shorter tuple, so two overloads that
        // differ only in component count both "match" — and the shorter one
        // encodes, silently dropping the caller's trailing values.
        // Arrays use their positional length, like encodeTuple; extra
        // properties such as metadata are not tuple components.
        const length = Array.isArray(arg) ? arg.length : Object.keys(arg).length
        if (length !== abiParameter.components.length) return false
        return abiParameter.components.every((component, index) => {
          if (Array.isArray(arg))
            return isArgOfType(arg[index], component as AbiParameter)
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
 * Reports the first differing canonical parameter types when both parameter
 * lists structurally accept all of `args`. Tuples and nonempty arrays recurse
 * to report an inner pair where possible. Empty arrays are compared by their
 * declared types: with no elements, there is no evidence to eliminate either
 * candidate, regardless of their element types or shapes.
 *
 * This provides diagnostics for `getAbiItem`; selector equality determines
 * whether two matching ABI items actually refer to the same function/event.
 */
export function getAmbiguousTypes(
  sourceParameters: readonly AbiParameter[],
  targetParameters: readonly AbiParameter[],
  args: readonly unknown[],
): [string, string] | undefined {
  if (
    sourceParameters.length !== targetParameters.length ||
    sourceParameters.length !== args.length ||
    !sourceParameters.every(
      (source, index) =>
        isArgOfType(args[index], source) &&
        isArgOfType(args[index], targetParameters[index]!),
    )
  )
    return undefined

  for (let index = 0; index < sourceParameters.length; index++) {
    const source = sourceParameters[index]!
    const target = targetParameters[index]!
    const types = formatTypes(source, target)
    // Normalize the entire type, including integer aliases nested inside
    // arrays and tuples. Parameter names do not contribute to a selector.
    if (
      normalizeSignature(`f(${types[0]})`) ===
      normalizeSignature(`f(${types[1]})`)
    )
      continue

    const arg = args[index]
    if (
      source.type === 'tuple' &&
      target.type === 'tuple' &&
      'components' in source &&
      'components' in target
    ) {
      const components = source.components as readonly AbiParameter[]
      const tupleArgs = Array.isArray(arg)
        ? arg
        : components.map(
            (component) =>
              (arg as Record<string, unknown>)[component.name ?? ''],
          )
      return (
        getAmbiguousTypes(
          components,
          target.components as readonly AbiParameter[],
          tupleArgs,
        ) ?? types
      )
    }

    if (
      ARRAY_SUFFIX.test(source.type) &&
      ARRAY_SUFFIX.test(target.type) &&
      Array.isArray(arg)
    ) {
      const sourceElement = {
        ...source,
        type: source.type.replace(ARRAY_SUFFIX, ''),
      } as AbiParameter
      const targetElement = {
        ...target,
        type: target.type.replace(ARRAY_SUFFIX, ''),
      } as AbiParameter
      // Only inspect actual elements. An empty array is ambiguous as a
      // whole; never invent an undefined element to infer a scalar type.
      for (const element of arg) {
        const ambiguous = getAmbiguousTypes(
          [sourceElement],
          [targetElement],
          [element],
        )
        if (ambiguous) return ambiguous
      }
    }

    return types
  }

  return undefined
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
