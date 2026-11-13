import type { Abi } from 'abitype'
import { ContractFunctionRevertedError } from '../../errors/rpc.js'
import { decodeAbiParameters } from '../../utils/abi/decodeAbiParameters.js'
import { hexToString } from '../../utils/encoding/fromHex.js'

/** 4-byte selector of the Solidity `Error(string)` revert helper. */
const ERROR_STRING_SELECTOR = '08c379a0'

/**
 * Decodes the text of an `Error(string)` revert payload (bare or `0x` hex).
 * Returns `undefined` for any other payload.
 */
export function decodeRevertReason(
  payload: string | undefined,
): string | undefined {
  const hex = (payload ?? '').replace(/^0x/i, '').toLowerCase()
  if (hex.startsWith(ERROR_STRING_SELECTOR) && hex.length > 8) {
    try {
      const [reason] = decodeAbiParameters(
        [{ type: 'string' }],
        `0x${hex.slice(8)}`,
      )
      return reason as string
    } catch {}
  }
  return undefined
}

/**
 * Builds the {@link ContractFunctionRevertedError} for a failed constant
 * call: the revert payload (bare or `0x` hex) is decoded against `abi`; when
 * there is no payload, the node's (possibly hex-encoded) message becomes the
 * reason.
 */
export function decodeRevert(
  constantResult: string | undefined,
  message: string | undefined,
  { abi, functionName }: { abi: Abi; functionName: string },
): ContractFunctionRevertedError {
  const hex = (constantResult ?? '').replace(/^0x/i, '').toLowerCase()
  return new ContractFunctionRevertedError({
    abi,
    functionName,
    message: decodeNodeMessage(message),
    ...(hex ? { data: `0x${hex}` as const } : {}),
  })
}

/** Best-effort decode of a node-provided (possibly hex-encoded) message. */
export function decodeNodeMessage(
  message: string | undefined,
): string | undefined {
  if (!message) return undefined
  if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
    try {
      return hexToString(`0x${message}`)
    } catch {}
  }
  return message
}
