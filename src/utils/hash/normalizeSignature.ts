import {
  InvalidParameterError,
  type InvalidParameterErrorType,
} from '../../errors/parameter.js'
import type { ErrorType } from '../../errors/utils.js'

type NormalizeSignatureParameters = string
type NormalizeSignatureReturnType = string
export type NormalizeSignatureErrorType = InvalidParameterErrorType | ErrorType

export function normalizeSignature(
  signature: NormalizeSignatureParameters,
): NormalizeSignatureReturnType {
  let active = true
  let level = 0
  let result = ''
  let valid = false

  for (let i = 0; i < signature.length; i++) {
    const char = signature[i]!
    const previous = result[result.length - 1]
    const atParameterStart = previous === '(' || previous === ','

    if (char === '(' || char === ')' || char === ',') {
      // Commas must separate two parameter types.
      if (
        (char === ',' && atParameterStart) ||
        (char === ')' && previous === ',')
      )
        break
      active = true
    }

    // If the character is a "level" token, we want to increment/decrement.
    if (char === '(') level++
    if (char === ')') level--

    // If we aren't active, we don't want to mutate the result.
    if (!active) continue

    const isWhitespace = /\s/.test(char)

    // If level === 0, we are at the definition level.
    if (level === 0) {
      if (isWhitespace && ['event', 'function', ''].includes(result))
        result = ''
      else {
        result += char

        // If we are at the end of the definition, we must be finished.
        if (char === ')') {
          valid = true
          break
        }
      }

      continue
    }

    if (isWhitespace) {
      // Whitespace after a type introduces its name or modifiers.
      if (!atParameterStart) active = false
      continue
    }

    result += char
  }

  if (!valid)
    throw new InvalidParameterError('Unable to normalize signature.', {
      param: 'signature',
      reason: 'format',
    })

  // Canonicalize bare integer aliases (`uint` → `uint256`, `int` → `int256`);
  // the ABI signature that gets hashed always uses the sized form. The
  // lookarounds keep sized types (`uint8`) and look-alike names (`mint`)
  // untouched. They exclude `$` as well as `\w`: a Solidity identifier may
  // contain `$`, which `\b` treats as a word break, so `a$int(` or `uint$(`
  // would otherwise be rewritten to `a$int256(` / `uint256$(` and hash to a
  // different selector. `uint`/`int` on their own can never be a name — they
  // are reserved words.
  return result.replace(/(?<![\w$])(u?int)(?![\w$])/g, '$1256')
}
