import { BaseError } from './base.js'

/**
 * The longest valid address form: `0x41` + 21 bytes = 44 characters. Longer
 * values are shown truncated.
 */
const maxAddressLength = 44

/** How much of an over-long value is kept — enough to see which form it is. */
const redactedPrefixLength = 6

export type InvalidAddressErrorType = InvalidAddressError & {
  name: 'InvalidAddressError'
}
export class InvalidAddressError extends BaseError {
  constructor({
    address,
    hideValue = false,
    metaMessages,
  }: {
    address: string
    /**
     * Omit the value from the message. Used when validating `account`
     * strings.
     */
    hideValue?: boolean | undefined
    /** Replaces the default guidance on accepted address forms. */
    metaMessages?: string[] | undefined
  }) {
    // A value longer than any address form is shown as its first characters
    // and its length.
    const redacted = !hideValue && address.length > maxAddressLength
    const shown = redacted
      ? `${address.slice(0, redactedPrefixLength)}…`
      : address
    super(
      hideValue ? 'Address is invalid.' : `Address "${shown}" is invalid.`,
      {
        metaMessages: metaMessages ?? [
          '- Address must be a "T"-prefixed Base58Check string of 34 characters, or a "41"-prefixed hex value of 21 bytes (42 hex characters).',
          '- Base58Check address must match its double-SHA256 checksum.',
          ...(redacted
            ? [
                `- The value is ${address.length} characters long, longer than any address form, so only its first characters are shown.`,
              ]
            : []),
        ],
        name: 'InvalidAddressError',
      },
    )
  }
}
