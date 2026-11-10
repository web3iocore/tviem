import { ContractFunctionRevertedError } from '../../errors/rpc.js'
import { decodeAbiParameters } from '../../utils/abi/decodeAbiParameters.js'
import { hexToString } from '../../utils/encoding/fromHex.js'

/** 4-byte selector of the Solidity `Error(string)` revert helper. */
const ERROR_STRING_SELECTOR = '08c379a0'
/** 4-byte selector of the Solidity `Panic(uint256)` revert helper. */
const PANIC_SELECTOR = '4e487b71'

/** The decoded form of a revert payload. */
export type RevertData = {
  /** The `Error(string)` text, when the payload is one. */
  reason?: string | undefined
  /** The `Panic(uint256)` code, when the payload is one. */
  code?: bigint | undefined
  /** Which Solidity revert helper produced the payload. */
  signature?: 'Error(string)' | 'Panic(uint256)' | undefined
}

/**
 * Decodes an ABI-encoded revert payload (bare or `0x` hex): `Error(string)`
 * → `reason`, `Panic(uint256)` → `code`; anything else decodes to `{}`.
 */
export function decodeRevertData(payload: string | undefined): RevertData {
  const hex = (payload ?? '').replace(/^0x/, '').toLowerCase()
  if (hex.startsWith(ERROR_STRING_SELECTOR) && hex.length > 8) {
    try {
      const [reason] = decodeAbiParameters(
        [{ type: 'string' }],
        `0x${hex.slice(8)}`,
      )
      return { reason: reason as string, signature: 'Error(string)' }
    } catch {}
  }
  if (hex.startsWith(PANIC_SELECTOR) && hex.length > 8) {
    try {
      const [code] = decodeAbiParameters(
        [{ type: 'uint256' }],
        `0x${hex.slice(8)}`,
      )
      return { code: code as bigint, signature: 'Panic(uint256)' }
    } catch {}
  }
  return {}
}

/**
 * Decodes a `triggerconstantcontract` revert payload into a
 * {@link ContractFunctionRevertedError}: `Error(string)` → a human-readable
 * reason, `Panic(uint256)` → a panic code; otherwise the node's (possibly
 * hex-encoded) message is surfaced best-effort.
 */
export function decodeRevert(
  constantResult: string | undefined,
  message: string | undefined,
  { functionName }: { functionName: string },
): ContractFunctionRevertedError {
  const hex = (constantResult ?? '').toLowerCase()
  const decoded = decodeRevertData(hex)
  if (decoded.signature === 'Error(string)')
    return new ContractFunctionRevertedError({
      functionName,
      reason: decoded.reason as string,
      signature: decoded.signature,
      data: `0x${hex}`,
    })
  if (decoded.signature === 'Panic(uint256)')
    return new ContractFunctionRevertedError({
      functionName,
      code: decoded.code as bigint,
      signature: decoded.signature,
      data: `0x${hex}`,
    })

  return new ContractFunctionRevertedError({
    functionName,
    reason: decodeNodeMessage(message),
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
