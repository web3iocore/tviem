import { BaseError, type BaseErrorOptions } from './base.js'

export type InvalidSignatureErrorType = InvalidSignatureError & {
  name: 'InvalidSignatureError'
}
/**
 * A signature, or one of its components, is not well-formed: the serialized
 * form is 65 bytes (`r ++ s ++ v`), `r` and `s` are 32 bytes each, and the
 * recovery value is one of the accepted `v` / `yParity` forms. The message
 * names the component.
 */
export class InvalidSignatureError extends BaseError {
  constructor(shortMessage: string, options: BaseErrorOptions = {}) {
    super(shortMessage, { ...options, name: 'InvalidSignatureError' })
  }
}
