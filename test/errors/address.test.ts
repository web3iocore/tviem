import { expect, test } from 'vitest'
import { InvalidAddressError } from '../../src/errors/address.js'
import { version } from '../../src/errors/version.js'

test('InvalidAddressError', () => {
  expect(
    new InvalidAddressError({
      address: 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLX',
    }),
  ).toMatchObject({
    name: 'InvalidAddressError',
    message: `Address "TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLX" is invalid.

- Address must be a "T"-prefixed Base58Check string of 34 characters, or a "41"-prefixed hex value of 21 bytes (42 hex characters).
- Base58Check address must match its double-SHA256 checksum.

Version: @tronweb3/tviem@${version}`,
  })
})

// A `0x41`-prefixed hex address is 44 characters — the longest valid form, so
// it must still be echoed in full to stay debuggable.
test('InvalidAddressError echoes a value at the longest valid length', () => {
  const address = `0x41${'0'.repeat(40)}`
  expect(address).toHaveLength(44)
  expect(new InvalidAddressError({ address }).message).toContain(
    `Address "${address}" is invalid.`,
  )
})

// A value longer than any address form is shown as its first characters and
// its length.
test('InvalidAddressError truncates a value too long to be an address', () => {
  const privateKey = `0x${'ab'.repeat(32)}` // 66 chars
  const error = new InvalidAddressError({ address: privateKey })
  expect(error.message).toContain('Address "0xabab…" is invalid.')
  expect(error.message).not.toContain(privateKey)
  expect(error.message).not.toContain('ab'.repeat(4))
  expect(error.message).toContain('66 characters long')
})

// With `hideValue`, no part of the value appears in the message.
test('InvalidAddressError with hideValue leaves the value out entirely', () => {
  for (const value of [
    `0x${'ab'.repeat(32)}`,
    'ab'.repeat(32),
    'TshortKeyish',
  ]) {
    const error = new InvalidAddressError({ address: value, hideValue: true })
    expect(error.shortMessage).toBe('Address is invalid.')
    expect(error.message).not.toContain(value)
    expect(error.message).not.toContain(value.slice(0, 4))
  }
})

test('InvalidAddressError metaMessages replace the default guidance', () => {
  const error = new InvalidAddressError({
    address: 'x',
    hideValue: true,
    metaMessages: ['- custom guidance'],
  })
  expect(error.metaMessages).toEqual(['- custom guidance'])
  expect(error.message).not.toContain('"41"-prefixed')
})
