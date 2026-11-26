import type { ErrorType } from '../../errors/utils.js'
import type { ByteArray, Hex } from '../../types/misc.js'

type TrimOptions = {
  dir?: 'left' | 'right' | undefined
}
export type TrimReturnType<value extends ByteArray | Hex> = value extends Hex
  ? Hex
  : ByteArray

export type TrimErrorType = ErrorType

export function trim<value extends ByteArray | Hex>(
  hexOrBytes: value,
  { dir = 'left' }: TrimOptions = {},
): TrimReturnType<value> {
  if (typeof hexOrBytes === 'string') {
    let hex = hexOrBytes.replace('0x', '')

    if (dir === 'right') {
      let end = hex.length
      while (end > 2 && hex.slice(end - 2, end) === '00') end -= 2
      hex = hex.slice(0, end)
    } else {
      let start = 0
      while (start < hex.length - 1 && hex[start] === '0') start++
      hex = hex.slice(start)
    }

    return `0x${hex.length % 2 === 1 ? `0${hex}` : hex}` as TrimReturnType<value>
  }

  const bytes = hexOrBytes
  let sliceLength = 0
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[dir === 'left' ? i : bytes.length - i - 1] !== 0) break
    sliceLength++
  }

  return (
    dir === 'left'
      ? bytes.slice(sliceLength)
      : bytes.slice(0, bytes.length - sliceLength)
  ) as TrimReturnType<value>
}
