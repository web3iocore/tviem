import { describe, expect, test } from 'vitest'
import {
  AbiDecodingDataSizeInvalidError,
  AbiDecodingDataSizeTooSmallError,
  AbiDecodingZeroSizeElementError,
  AbiEncodingArrayLengthMismatchError,
  AbiEncodingLengthMismatchError,
  AbiEventSignatureEmptyTopicsError,
  DecodeLogDataMismatchError,
  DecodeLogTopicsMismatchError,
  InvalidAbiDecodingTypeError,
  InvalidAbiEncodingTypeError,
  InvalidAbiParameterValueError,
  InvalidArrayError,
  UnsupportedPackedAbiTypeError,
} from '../../src/errors/abi.js'
import { version } from '../../src/errors/version.js'

test('AbiDecodingDataSizeInvalidError', () => {
  expect(
    new AbiDecodingDataSizeInvalidError({ data: '0x1234', size: 2 }),
  ).toMatchObject({
    name: 'AbiDecodingDataSizeInvalidError',
    message: `Data size of 2 bytes is invalid.
Size must be in increments of 32 bytes (size % 32 === 0).

Data: 0x1234 (2 bytes)

Version: @tronweb3/tviem@${version}`,
  })
})

test('AbiDecodingDataSizeTooSmallError', () => {
  expect(
    new AbiDecodingDataSizeTooSmallError({
      data: '0x1234',
      formattedParams: 'uint256 a, uint256 b',
      params: [
        { name: 'a', type: 'uint256' },
        { name: 'b', type: 'uint256' },
      ],
      size: 2,
    }),
  ).toMatchObject({
    name: 'AbiDecodingDataSizeTooSmallError',
    message: `Data size of 2 bytes is too small for given parameters.

Params: (uint256 a, uint256 b)
Data:   0x1234 (2 bytes)

Version: @tronweb3/tviem@${version}`,
  })
})

test('AbiDecodingZeroSizeElementError', () => {
  expect(new AbiDecodingZeroSizeElementError('tuple')).toMatchObject({
    name: 'AbiDecodingZeroSizeElementError',
    message: `Array element type "tuple" consumes no bytes.
A zero-size element never advances the decoder, so the array length cannot be trusted to terminate it.
Solidity does not emit such a type; check where this ABI came from.

Version: @tronweb3/tviem@${version}`,
  })
})

test('InvalidAbiDecodingTypeError', () => {
  expect(
    new InvalidAbiDecodingTypeError('lol', { docsPath: '/lol' }),
  ).toMatchObject({
    name: 'InvalidAbiDecodingTypeError',
    message: `Type "lol" is not a valid decoding type.
Please provide a valid ABI type.

Version: @tronweb3/tviem@${version}`,
  })
})

test('AbiEncodingArrayLengthMismatchError', () => {
  expect(
    new AbiEncodingArrayLengthMismatchError({
      expectedLength: 69,
      givenLength: 420,
      type: 'uint256[3]',
    }),
  ).toMatchObject({
    name: 'AbiEncodingArrayLengthMismatchError',
    message: `ABI encoding array length mismatch for type uint256[3].
Expected length: 69
Given length: 420

Version: @tronweb3/tviem@${version}`,
  })
})

test('AbiEncodingLengthMismatchError', () => {
  expect(
    new AbiEncodingLengthMismatchError({
      expectedLength: 69,
      givenLength: 420,
    }),
  ).toMatchObject({
    name: 'AbiEncodingLengthMismatchError',
    message: `ABI encoding params/values length mismatch.
Expected length (params): 69
Given length (values): 420

Version: @tronweb3/tviem@${version}`,
  })
})

test('AbiEventSignatureEmptyTopicsError', () => {
  expect(
    new AbiEventSignatureEmptyTopicsError({ docsPath: '/test' }),
  ).toMatchObject({
    name: 'AbiEventSignatureEmptyTopicsError',
    message: `Cannot extract event signature from empty topics.

Version: @tronweb3/tviem@${version}`,
  })
})

test('DecodeLogDataMismatchError', () => {
  expect(
    new DecodeLogDataMismatchError({
      abiItem: {
        name: 'Event',
        inputs: [
          { name: 'a', type: 'uint256' },
          { name: 'b', type: 'uint256' },
        ],
        type: 'event',
      },
      data: '0x1234',
      formattedParams: 'uint256 a, uint256 b',
      params: [
        { name: 'a', type: 'uint256' },
        { name: 'b', type: 'uint256' },
      ],
      size: 2,
    }),
  ).toMatchObject({
    name: 'DecodeLogDataMismatchError',
    message: `Data size of 2 bytes is too small for non-indexed event parameters.

Params: (uint256 a, uint256 b)
Data:   0x1234 (2 bytes)

Version: @tronweb3/tviem@${version}`,
  })
})

describe('DecodeLogTopicsMismatchError', () => {
  test('default', () => {
    expect(
      new DecodeLogTopicsMismatchError({
        abiItem: {
          inputs: [
            {
              indexed: true,
              name: 'from',
              type: 'address',
            },
            {
              indexed: true,
              name: 'to',
              type: 'address',
            },
            {
              indexed: true,
              name: 'id',
              type: 'uint256',
            },
          ],
          name: 'Transfer',
          type: 'event',
        },
        formattedAbiItem: 'Transfer(address from, address to, uint256 id)',
        param: {
          indexed: true,
          name: 'id',
          type: 'uint256',
        },
      }),
    ).toMatchObject({
      name: 'DecodeLogTopicsMismatchError',
      message: `Expected a topic for indexed event parameter "id" on event "Transfer(address from, address to, uint256 id)".

Version: @tronweb3/tviem@${version}`,
    })
  })

  test('unnamed', () => {
    expect(
      new DecodeLogTopicsMismatchError({
        abiItem: {
          inputs: [
            {
              indexed: true,
              type: 'address',
            },
            {
              indexed: true,
              type: 'address',
            },
            {
              indexed: true,
              type: 'uint256',
            },
          ],
          name: 'Transfer',
          type: 'event',
        },
        formattedAbiItem: 'Transfer(address, address, uint256)',
        param: {
          indexed: true,
          type: 'uint256',
        },
      }),
    ).toMatchObject({
      name: 'DecodeLogTopicsMismatchError',
      message: `Expected a topic for indexed event parameter on event "Transfer(address, address, uint256)".

Version: @tronweb3/tviem@${version}`,
    })
  })
})

test('InvalidAbiEncodingTypeError', () => {
  expect(
    new InvalidAbiEncodingTypeError('lol', { docsPath: '/lol' }),
  ).toMatchObject({
    name: 'InvalidAbiEncodingTypeError',
    message: `Type "lol" is not a valid encoding type.
Please provide a valid ABI type.

Version: @tronweb3/tviem@${version}`,
  })
})

test('InvalidArrayError', () => {
  expect(new InvalidArrayError('lol')).toMatchObject({
    name: 'InvalidArrayError',
    message: `Value "lol" is not a valid array.

Version: @tronweb3/tviem@${version}`,
  })
})

test('UnsupportedPackedAbiTypeError', () => {
  expect(new UnsupportedPackedAbiTypeError('tuple')).toMatchObject({
    name: 'UnsupportedPackedAbiTypeError',
    message: `Type "tuple" is not supported for packed encoding.

Version: @tronweb3/tviem@${version}`,
  })
})

test('InvalidAbiParameterValueError', () => {
  expect(
    new InvalidAbiParameterValueError({ type: 'bool', value: 'yes' }),
  ).toMatchObject({
    name: 'InvalidAbiParameterValueError',
    message: `Value "yes" is not a valid value for ABI type "bool".

Version: @tronweb3/tviem@${version}`,
  })
})

test('InvalidAbiParameterValueError: a value whose string conversion throws is reported by its `typeof`', () => {
  expect(
    new InvalidAbiParameterValueError({
      type: 'bool',
      value: Object.create(null),
    }).shortMessage,
  ).toBe('Value "object" is not a valid value for ABI type "bool".')
  expect(
    new InvalidAbiParameterValueError({
      type: 'uint256',
      value: [Symbol('s')],
    }).shortMessage,
  ).toBe('Value "object" is not a valid value for ABI type "uint256".')
})

const abiItem = {
  inputs: [{ indexed: true, name: 'id', type: 'uint256' }],
  name: 'Transfer',
  type: 'event',
} as const

test.each([
  [
    'DecodeLogDataMismatchError',
    DecodeLogDataMismatchError,
    () =>
      new DecodeLogDataMismatchError({
        abiItem,
        data: '0x',
        formattedParams: 'uint256 id',
        params: abiItem.inputs,
        size: 0,
      }),
  ],
  [
    'DecodeLogTopicsMismatchError',
    DecodeLogTopicsMismatchError,
    () =>
      new DecodeLogTopicsMismatchError({
        abiItem,
        formattedAbiItem: 'Transfer(uint256 id)',
        param: abiItem.inputs[0],
      }),
  ],
  [
    'UnsupportedPackedAbiTypeError',
    UnsupportedPackedAbiTypeError,
    () => new UnsupportedPackedAbiTypeError('tuple'),
  ],
])('%s: the class identifier and the `name` property agree', (name, ErrorClass, create) => {
  const error = create()
  expect(error).toBeInstanceOf(ErrorClass)
  expect(ErrorClass.name).toBe(name)
  expect(error.name).toBe(name)
})
