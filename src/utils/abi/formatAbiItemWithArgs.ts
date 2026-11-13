import type { AbiParameter } from 'abitype'

import type { AbiItem } from '../../types/contract.js'
import { stringify } from '../stringify.js'

/**
 * Formats an ABI item together with the values of its inputs, e.g.
 * `transfer(to: T…, amount: 100)`. Returns `undefined` for an item without a
 * name or inputs.
 */
export function formatAbiItemWithArgs({
  abiItem,
  args,
  includeFunctionName = true,
  includeName = false,
}: {
  abiItem: AbiItem
  args: readonly unknown[]
  includeFunctionName?: boolean | undefined
  includeName?: boolean | undefined
}) {
  if (!('name' in abiItem)) return
  if (!('inputs' in abiItem)) return
  if (!abiItem.inputs) return
  return `${includeFunctionName ? abiItem.name : ''}(${abiItem.inputs
    .map(
      (input: AbiParameter, i: number) =>
        `${includeName && input.name ? `${input.name}: ` : ''}${
          typeof args[i] === 'object' ? stringify(args[i]) : args[i]
        }`,
    )
    .join(', ')})`
}
