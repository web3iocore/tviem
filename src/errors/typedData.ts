import { stringify } from '../utils/stringify.js'
import { BaseError, type BaseErrorOptions } from './base.js'

export type InvalidDomainErrorType = InvalidDomainError & {
  name: 'InvalidDomainError'
}
export class InvalidDomainError extends BaseError {
  constructor({ domain }: { domain: unknown }) {
    super(`Invalid domain "${stringify(domain)}".`, {
      metaMessages: ['Must be a valid TIP-712 domain object.'],
      name: 'InvalidDomainError',
    })
  }
}

export type InvalidPrimaryTypeErrorType = InvalidPrimaryTypeError & {
  name: 'InvalidPrimaryTypeError'
}
export class InvalidPrimaryTypeError extends BaseError {
  constructor({
    primaryType,
    types,
  }: { primaryType: string; types: Record<string, unknown> }) {
    super(
      `Invalid primary type \`${primaryType}\` must be one of \`${JSON.stringify(Object.keys(types))}\`.`,
      {
        metaMessages: ['Check that the primary type is a key in `types`.'],
        name: 'InvalidPrimaryTypeError',
      },
    )
  }
}

export type InvalidStructTypeErrorType = InvalidStructTypeError & {
  name: 'InvalidStructTypeError'
}
export class InvalidStructTypeError extends BaseError {
  constructor({ type }: { type: string }) {
    super(`Struct type "${type}" is invalid.`, {
      metaMessages: [
        'Use a valid identifier for the struct name. Primitive type names and array syntax are reserved.',
      ],
      name: 'InvalidStructTypeError',
    })
  }
}

export type TypedDataErrorType = TypedDataError & {
  name: 'TypedDataError'
}
/**
 * Typed data does not pass TIP-712 validation: a value does not match its
 * declared type, a declared field has no value, a field has no declared
 * type, a field name is invalid or duplicated within a struct, or a declared
 * type is not a supported TIP-712 type.
 */
export class TypedDataError extends BaseError {
  /**
   * The location of the offending value or declaration, when known. Value
   * paths start with the struct type name (e.g. `Mail.to.wallet`) and use
   * `[index]` for array elements.
   */
  path?: string | undefined

  constructor(
    shortMessage: string,
    { path, ...options }: BaseErrorOptions & { path?: string | undefined } = {},
  ) {
    super(shortMessage, { ...options, name: 'TypedDataError' })
    this.path = path
  }
}
