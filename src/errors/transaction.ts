import { BaseError, type BaseErrorOptions } from './base.js'

/**
 * Thrown when a transaction carries a contract type tviem does not support:
 * an unregistered `google.protobuf.Any` type URL, or an unregistered
 * `Transaction.Contract.type` integer or name. Decoding is strict by design —
 * unsupported transactions are refused rather than partially decoded.
 * The raw `Any.value` payload (bare hex), when available, is preserved on
 * the error for inspection.
 */
export type UnknownContractTypeErrorType = UnknownContractTypeError & {
  name: 'UnknownContractTypeError'
}
export class UnknownContractTypeError extends BaseError {
  /** The unsupported contract type: an `Any` type URL or a type integer. */
  type: string | number
  /** The raw `Any.value` payload (bare hex), when available. */
  value?: string | undefined

  constructor({
    type,
    value,
  }: { type: string | number; value?: string | undefined }) {
    super(
      `Contract type ${
        typeof type === 'string' ? `"${type}"` : type
      } is not supported.`,
      {
        metaMessages: value ? [`Any.value (hex): ${value}`] : undefined,
        name: 'UnknownContractTypeError',
      },
    )
    this.type = type
    this.value = value
  }
}

export type InvalidBlockHeaderErrorType = InvalidBlockHeaderError & {
  name: 'InvalidBlockHeaderError'
}
/**
 * A reference block does not carry what the TaPoS fields are derived from: a
 * positive number, a positive timestamp and a 32-byte block id.
 */
export class InvalidBlockHeaderError extends BaseError {
  constructor(shortMessage: string, options: BaseErrorOptions = {}) {
    super(shortMessage, { ...options, name: 'InvalidBlockHeaderError' })
  }
}

export type PermissionErrorType = PermissionError & {
  name: 'PermissionError'
}
/**
 * A multi-signature permission id is not usable: it is not a valid id, it
 * differs from the id the transaction or permission slot is bound to, or it
 * cannot be bound to the transaction in its current state.
 */
export class PermissionError extends BaseError {
  /** The permission id the error is about, when one was supplied. */
  permissionId?: number | undefined

  constructor(
    shortMessage: string,
    {
      permissionId,
      ...options
    }: BaseErrorOptions & { permissionId?: number | undefined } = {},
  ) {
    super(shortMessage, { ...options, name: 'PermissionError' })
    this.permissionId = permissionId
  }
}

export type TransactionIntegrityErrorType = TransactionIntegrityError & {
  name: 'TransactionIntegrityError'
}
/**
 * A transaction is not self-consistent, or not in the state an operation
 * requires: `txID`, `raw_data` and `raw_data_hex` do not describe the same
 * bytes (`txCheck`), a contract's type and its parameter type URL differ, the
 * `owner_address` is absent or is not the signing account, or signatures are
 * already present where none are expected.
 */
export class TransactionIntegrityError extends BaseError {
  /**
   * The transaction field the check failed on (e.g. `owner_address`), when
   * it is a single field.
   */
  field?: string | undefined

  constructor(
    shortMessage: string,
    {
      field,
      ...options
    }: BaseErrorOptions & { field?: string | undefined } = {},
  ) {
    super(shortMessage, { ...options, name: 'TransactionIntegrityError' })
    this.field = field
  }
}
