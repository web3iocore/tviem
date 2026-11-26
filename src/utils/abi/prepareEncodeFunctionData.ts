import type { Abi, AbiFunction } from 'abitype'

import {
  AbiFunctionNotFoundError,
  type AbiFunctionNotFoundErrorType,
} from '../../errors/abi.js'
import type { ErrorType } from '../../errors/utils.js'
import type {
  ContractFunctionArgs,
  ContractFunctionName,
} from '../../types/contract.js'
import type { Hex } from '../../types/misc.js'
import type { UnionEvaluate } from '../../types/utils.js'
import { isHex } from '../data/isHex.js'
import {
  type ToFunctionSelectorErrorType,
  toFunctionSelector,
} from '../hash/toFunctionSelector.js'
import { formatAbiItem } from './formatAbiItem.js'
import { type GetAbiItemErrorType, getAbiItem } from './getAbiItem.js'

export type PrepareEncodeFunctionDataParameters<
  abi extends Abi | readonly unknown[] = Abi,
  functionName extends ContractFunctionName<abi> = ContractFunctionName<abi>,
  args extends ContractFunctionArgs<
    abi,
    'nonpayable' | 'payable' | 'pure' | 'view',
    functionName
  > = ContractFunctionArgs<
    abi,
    'nonpayable' | 'payable' | 'pure' | 'view',
    functionName
  >,
> = {
  abi: abi
  /** The function name or its 4-byte selector. */
  functionName: functionName | ContractFunctionName<abi> | Hex
  args?: args | readonly unknown[] | undefined
}

export type PrepareEncodeFunctionDataReturnType<
  abi extends Abi | readonly unknown[] = Abi,
  functionName extends ContractFunctionName<abi> = ContractFunctionName<abi>,
> = UnionEvaluate<{
  abi: readonly [
    abi extends Abi
      ? Abi extends abi
        ? AbiFunction
        : Extract<abi[number], { type: 'function'; name: functionName }>
      : AbiFunction,
  ]
  functionName: Hex
}>

export type PrepareEncodeFunctionDataErrorType =
  | AbiFunctionNotFoundErrorType
  | GetAbiItemErrorType
  | ToFunctionSelectorErrorType
  | ErrorType

/**
 * Precomputes the function selector and resolved ABI item for
 * {@link encodeFunctionData}, so later calls can use the narrowed ABI and
 * selector to identify the chosen overload.
 *
 * The selector is `toFunctionSelector` of the resolved item's signature; the
 * signature keeps `trcToken` verbatim (e.g. `transferToken(address,trcToken,
 * uint256)`), so TRON-native functions hash to their on-chain selector.
 *
 * @example
 * const { abi, functionName } = prepareEncodeFunctionData({
 *   abi: erc20Abi,
 *   functionName: 'transfer',
 * })
 * encodeFunctionData({ abi, functionName, args })
 */
export function prepareEncodeFunctionData<
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi> = ContractFunctionName<abi>,
>(
  parameters: PrepareEncodeFunctionDataParameters<abi, functionName>,
): PrepareEncodeFunctionDataReturnType<abi, functionName> {
  const { abi, args, functionName } = parameters as {
    abi: Abi
    args?: readonly unknown[]
    functionName: string
  }

  const docsPath = '/docs/contract/encodeFunctionData'
  if (!functionName) throw new AbiFunctionNotFoundError(undefined, { docsPath })
  const abiItem = getAbiItem({
    abi: abi.filter((item) => item.type === 'function'),
    args,
    name: functionName,
  })
  if (abiItem?.type !== 'function')
    throw new AbiFunctionNotFoundError(functionName, { docsPath })

  return {
    abi: [abiItem] as const,
    functionName: isHex(functionName, { strict: false })
      ? functionName
      : toFunctionSelector(formatAbiItem(abiItem)),
  } as PrepareEncodeFunctionDataReturnType<abi, functionName>
}
