import type { Abi } from 'abitype'

import type { AbiFunctionNotFoundErrorType } from '../../errors/abi.js'
import type { ErrorType } from '../../errors/utils.js'
import type {
  ContractFunctionArgs,
  ContractFunctionName,
} from '../../types/contract.js'
import type { Hex } from '../../types/misc.js'
import type { UnionEvaluate } from '../../types/utils.js'
import { type ConcatHexErrorType, concatHex } from '../data/concat.js'
import {
  type EncodeAbiParametersErrorType,
  encodeAbiParameters,
} from './encodeAbiParameters.js'
import {
  type PrepareEncodeFunctionDataErrorType,
  prepareEncodeFunctionData,
} from './prepareEncodeFunctionData.js'

export type EncodeFunctionDataParameters<
  abi extends Abi | readonly unknown[] = Abi,
  functionName extends ContractFunctionName<abi> = ContractFunctionName<abi>,
  //
  hasFunctions = abi extends Abi
    ? Abi extends abi
      ? true
      : [ExtractAbiFunctions<abi>] extends [never]
        ? false
        : true
    : true,
  allArgs = ContractFunctionArgs<
    abi,
    'nonpayable' | 'payable' | 'pure' | 'view',
    functionName
  >,
  allFunctionNames = ContractFunctionName<abi>,
> = {
  abi: abi
  args?: allArgs | readonly unknown[] | undefined
} & UnionEvaluate<
  hasFunctions extends true
    ? {
        /** The function name or its 4-byte selector. */
        functionName:
          | allFunctionNames
          | (functionName extends allFunctionNames ? functionName : never)
          | Hex
      }
    : { functionName: never }
>

type ExtractAbiFunctions<abi extends Abi> = Extract<
  abi[number],
  { type: 'function' }
>

export type EncodeFunctionDataReturnType = Hex

export type EncodeFunctionDataErrorType =
  | AbiFunctionNotFoundErrorType
  | ConcatHexErrorType
  | EncodeAbiParametersErrorType
  | PrepareEncodeFunctionDataErrorType
  | ErrorType

/**
 * Encodes a function call into ABI-encoded calldata: the 4-byte selector
 * (`toFunctionSelector` of the resolved item's signature) followed by
 * `encodeAbiParameters(inputs, args)`. TRON `address` arguments accept any
 * form and `trcToken` arguments encode like `uint256`.
 *
 * Pass the output of {@link prepareEncodeFunctionData} (an `abi` of one item
 * plus a hex `functionName`) to reuse the selected overload.
 *
 * @example
 * encodeFunctionData({
 *   abi: erc20Abi,
 *   functionName: 'transfer',
 *   args: ['T...', 1000000n],
 * })
 * // '0xa9059cbb…'
 */
export function encodeFunctionData<
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi> = ContractFunctionName<abi>,
>(
  parameters: EncodeFunctionDataParameters<abi, functionName>,
): EncodeFunctionDataReturnType {
  const { args } = parameters
  const {
    abi: [abiItem],
    functionName: signature,
  } = prepareEncodeFunctionData(
    parameters as Parameters<typeof prepareEncodeFunctionData>[0],
  )

  const data = abiItem.inputs
    ? encodeAbiParameters(abiItem.inputs, args ?? [])
    : undefined
  return concatHex([signature, data ?? '0x'])
}
