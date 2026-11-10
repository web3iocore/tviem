import { BaseError } from './base.js'

export type SliceOffsetOutOfBoundsErrorType = SliceOffsetOutOfBoundsError & {
  name: 'SliceOffsetOutOfBoundsError'
}
export class SliceOffsetOutOfBoundsError extends BaseError {
  constructor({
    offset,
    position,
    size,
  }: { offset: number; position: 'start' | 'end'; size: number }) {
    super(
      `Slice ${
        position === 'start' ? 'starting' : 'ending'
      } at offset "${offset}" is out-of-bounds (size: ${size}).`,
      { name: 'SliceOffsetOutOfBoundsError' },
    )
  }
}

export type SizeExceedsPaddingSizeErrorType = SizeExceedsPaddingSizeError & {
  name: 'SizeExceedsPaddingSizeError'
}
export class SizeExceedsPaddingSizeError extends BaseError {
  constructor({
    size,
    targetSize,
    type,
  }: {
    size: number
    targetSize: number
    type: 'hex' | 'bytes'
  }) {
    super(
      `${type.charAt(0).toUpperCase()}${type
        .slice(1)
        .toLowerCase()} size (${size}) exceeds padding size (${targetSize}).`,
      { name: 'SizeExceedsPaddingSizeError' },
    )
  }
}

export type InvalidBytesLengthErrorType = InvalidBytesLengthError & {
  name: 'InvalidBytesLengthError'
}
export class InvalidBytesLengthError extends BaseError {
  constructor({
    size,
    targetSize,
    type,
  }: {
    size: number
    targetSize: number
    type: 'hex' | 'bytes'
  }) {
    super(
      `${type.charAt(0).toUpperCase()}${type
        .slice(1)
        .toLowerCase()} is expected to be ${targetSize} ${type} long, but is ${size} ${type} long.`,
      { name: 'InvalidBytesLengthError' },
    )
  }
}

export type InvalidHashErrorType = InvalidHashError & {
  name: 'InvalidHashError'
}
/**
 * A value that should be a 32-byte digest is not one: as a string it must be
 * `0x`-prefixed hex of exactly 64 hex characters; as bytes, exactly 32 bytes.
 */
export class InvalidHashError extends BaseError {
  constructor({ hash }: { hash: string | Uint8Array }) {
    const got =
      typeof hash === 'string'
        ? `a string of ${hash.length} characters`
        : `${hash.length} bytes`
    super(
      `Invalid hash: expected a 32-byte digest as 0x-prefixed hex (64 hex characters) or a 32-byte array, got ${got}.`,
      { name: 'InvalidHashError' },
    )
  }
}
