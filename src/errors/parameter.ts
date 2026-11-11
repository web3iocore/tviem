import { BaseError, type BaseErrorOptions } from './base.js'

/**
 * Why a value was not accepted:
 *
 * - `'type'` — the value has the wrong JavaScript type.
 * - `'format'` — the type is right, but the value is malformed (e.g. not hex,
 *   or not the required length).
 * - `'range'` — the value is well-formed, but outside the accepted range or
 *   set of values.
 * - `'unknown-field'` — the key is not one the receiving object defines.
 * - `'conflict'` — the option is mutually exclusive with, or contradicts,
 *   another one.
 */
export type InvalidParameterReason =
  | 'type'
  | 'format'
  | 'range'
  | 'unknown-field'
  | 'conflict'

export type InvalidParameterErrorType = InvalidParameterError & {
  name: 'InvalidParameterError'
}
/**
 * A caller-supplied value is not accepted. `param` names the parameter or
 * field the value was passed as and `reason` classifies why; the message
 * describes the expected value.
 */
export class InvalidParameterError extends BaseError {
  /**
   * The parameter or field the value was passed as. Nested fields are
   * dot-separated (e.g. `blockHeader.timestamp`); for `'unknown-field'` it is
   * the unrecognised key.
   */
  param: string
  /** Why the value was not accepted. */
  reason: InvalidParameterReason

  constructor(
    shortMessage: string,
    {
      param,
      reason,
      ...options
    }: BaseErrorOptions & { param: string; reason: InvalidParameterReason },
  ) {
    super(shortMessage, { ...options, name: 'InvalidParameterError' })
    this.param = param
    this.reason = reason
  }
}

export type MissingFieldErrorType = MissingFieldError & {
  name: 'MissingFieldError'
}
/** A required field is absent. `field` names it. */
export class MissingFieldError extends BaseError {
  /**
   * The absent field. Nested fields are dot-separated (e.g.
   * `owner.threshold`).
   */
  field: string

  constructor(
    shortMessage: string,
    { field, ...options }: BaseErrorOptions & { field: string },
  ) {
    super(shortMessage, { ...options, name: 'MissingFieldError' })
    this.field = field
  }
}
