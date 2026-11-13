import { BaseError } from './base.js'

export type InvalidDecimalNumberErrorType = InvalidDecimalNumberError & {
  name: 'InvalidDecimalNumberError'
}
export class InvalidDecimalNumberError extends BaseError {
  constructor({ value }: { value: string }) {
    super(`Number \`${value}\` is not a valid decimal number.`, {
      name: 'InvalidDecimalNumberError',
    })
  }
}

export type InvalidDecimalsErrorType = InvalidDecimalsError & {
  name: 'InvalidDecimalsError'
}
export class InvalidDecimalsError extends BaseError {
  constructor({ decimals }: { decimals: number }) {
    super(`\`decimals\` must be a non-negative integer. Got \`${decimals}\`.`, {
      name: 'InvalidDecimalsError',
    })
  }
}
