import { expectTypeOf, test } from 'vitest'
import {
  privateKeyToAddress,
  signMessage as signMessageWithKey,
  signTransaction as signTransactionWithKey,
  signTypedData as signTypedDataWithKey,
} from '../src/accounts/index.js'
import type {
  Address,
  BaseError,
  ByteArray,
  Chain,
  Client,
  ContractFunctionName,
  ContractFunctionRevertedError,
  DecodeEventLogErrorType,
  DecodeLogDataMismatchError,
  DecodeLogDataMismatchErrorType,
  DecodeLogTopicsMismatchError,
  DecodeLogTopicsMismatchErrorType,
  EncodePackedErrorType,
  EvmAddress,
  Hex,
  InvalidAbiParameterValueErrorType,
  PublicClient,
  RequestErrorType,
  Transport,
  TronHexAddress,
  TronNodeError,
  TronRequestFn,
  UnsupportedPackedAbiTypeError,
  UnsupportedPackedAbiTypeErrorType,
} from '../src/index.js'
import {
  addressToHex,
  createPublicClient,
  http,
  isAddress,
  keccak256,
  nile,
  parseTrx,
  signMessage,
  signTransaction,
  signTypedData,
  toBase58,
  toEvm,
} from '../src/index.js'

test('branded address types', () => {
  expectTypeOf<Address>().toEqualTypeOf<`T${string}`>()
  expectTypeOf<TronHexAddress>().toEqualTypeOf<`41${string}`>()
  expectTypeOf<EvmAddress>().toEqualTypeOf<`0x${string}`>()
  expectTypeOf<Hex>().toEqualTypeOf<`0x${string}`>()
  expectTypeOf<ByteArray>().toEqualTypeOf<Uint8Array>()
})

test('address utils return branded forms', () => {
  expectTypeOf(
    toBase58('412b5ad5c4795c026514f8317c7a215e218dccd6cf'),
  ).toEqualTypeOf<Address>()
  expectTypeOf(
    addressToHex('TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K'),
  ).toEqualTypeOf<TronHexAddress>()
  expectTypeOf(
    toEvm('TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K'),
  ).toEqualTypeOf<EvmAddress>()
  expectTypeOf(
    isAddress('TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K'),
  ).toEqualTypeOf<boolean>()
})

test('units + hash return types', () => {
  expectTypeOf(parseTrx('1')).toEqualTypeOf<bigint>()
  expectTypeOf(keccak256('0x')).toEqualTypeOf<Hex>()
  expectTypeOf(keccak256('0x', 'bytes')).toEqualTypeOf<ByteArray>()
})

test('accounts barrel', () => {
  expectTypeOf(privateKeyToAddress).parameter(0).toEqualTypeOf<Hex | string>()
  expectTypeOf(privateKeyToAddress).returns.toEqualTypeOf<Address>()
})

test('ContractFunctionName resolves against a const abi', () => {
  const trc20Abi = [
    {
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      name: 'transfer',
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ] as const
  expectTypeOf<
    ContractFunctionName<typeof trc20Abi, 'view'>
  >().toEqualTypeOf<'balanceOf'>()
  expectTypeOf<ContractFunctionName<typeof trc20Abi>>().toEqualTypeOf<
    'balanceOf' | 'transfer'
  >()
})

test('root barrel exposes the client / transport / chain type surface', () => {
  const client = createPublicClient({ chain: nile, transport: http() })
  // Client carries the read action set and a wrapped request fn.
  expectTypeOf(client).toMatchTypeOf<PublicClient>()
  expectTypeOf(client).toMatchTypeOf<Client>()
  expectTypeOf(client.request).toEqualTypeOf<TronRequestFn>()
  expectTypeOf(client.readContract).toBeFunction()
  expectTypeOf(client.getBalance).toBeFunction()
  // Chain / Transport are re-exported as types.
  expectTypeOf(nile).toMatchTypeOf<Chain>()
  expectTypeOf(http).returns.toMatchTypeOf<Transport>()
})

test('RequestErrorType is importable from the root entrypoint', () => {
  // The error-union building block every action's *ErrorType references; it
  // must be nameable by consumers, not only resolvable structurally.
  expectTypeOf<RequestErrorType>().not.toBeNever()
})

test('the ABI error types carry the `Error`-suffixed class name', () => {
  expectTypeOf<
    DecodeLogDataMismatchErrorType['name']
  >().toEqualTypeOf<'DecodeLogDataMismatchError'>()
  expectTypeOf<
    DecodeLogTopicsMismatchErrorType['name']
  >().toEqualTypeOf<'DecodeLogTopicsMismatchError'>()
  expectTypeOf<
    UnsupportedPackedAbiTypeErrorType['name']
  >().toEqualTypeOf<'UnsupportedPackedAbiTypeError'>()
  expectTypeOf<DecodeLogDataMismatchErrorType>().toMatchTypeOf<DecodeLogDataMismatchError>()
  expectTypeOf<DecodeLogTopicsMismatchErrorType>().toMatchTypeOf<DecodeLogTopicsMismatchError>()
  expectTypeOf<UnsupportedPackedAbiTypeErrorType>().toMatchTypeOf<UnsupportedPackedAbiTypeError>()
})

test('the root entrypoint exports the ABI error classes under the suffixed names only', () => {
  type Root = typeof import('../src/index.js')
  expectTypeOf<Root>().toHaveProperty('DecodeLogDataMismatchError')
  expectTypeOf<Root>().toHaveProperty('DecodeLogTopicsMismatchError')
  expectTypeOf<Root>().toHaveProperty('UnsupportedPackedAbiTypeError')
  expectTypeOf<Root>().not.toHaveProperty('DecodeLogDataMismatch')
  expectTypeOf<Root>().not.toHaveProperty('DecodeLogTopicsMismatch')
  expectTypeOf<Root>().not.toHaveProperty('UnsupportedPackedAbiType')
})

test('decodeEventLog / encodePacked error unions name the classes they throw', () => {
  expectTypeOf<DecodeLogDataMismatchErrorType>().toMatchTypeOf<DecodeEventLogErrorType>()
  expectTypeOf<DecodeLogTopicsMismatchErrorType>().toMatchTypeOf<DecodeEventLogErrorType>()
  // `encodePacked` reports an unpackable type and an invalid value separately.
  expectTypeOf<UnsupportedPackedAbiTypeErrorType>().toMatchTypeOf<EncodePackedErrorType>()
  expectTypeOf<InvalidAbiParameterValueErrorType>().toMatchTypeOf<EncodePackedErrorType>()
})

test('BaseError.details is `string | undefined`', () => {
  expectTypeOf<BaseError['details']>().toEqualTypeOf<string | undefined>()
  // Subclasses inherit the declaration.
  expectTypeOf<ContractFunctionRevertedError['details']>().toEqualTypeOf<
    string | undefined
  >()
})

test('ContractFunctionRevertedError carries the panic code as `panicCode`', () => {
  expectTypeOf<ContractFunctionRevertedError['panicCode']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<ContractFunctionRevertedError>().not.toHaveProperty('code')
  expectTypeOf<
    NonNullable<ConstructorParameters<typeof ContractFunctionRevertedError>[0]>
  >().toHaveProperty('panicCode')
  expectTypeOf<
    NonNullable<ConstructorParameters<typeof ContractFunctionRevertedError>[0]>
  >().not.toHaveProperty('code')
  // The node errors keep their string `code`.
  expectTypeOf<TronNodeError['code']>().toEqualTypeOf<string | undefined>()
})

test('root sign* exports are the client actions; ./accounts holds the key utilities', () => {
  // Actions take `(client, parameters)`; the utilities take a single object
  // carrying `privateKey`.
  expectTypeOf(signMessage)
    .parameters.toHaveProperty('length')
    .toEqualTypeOf<2>()
  expectTypeOf(signTransaction)
    .parameters.toHaveProperty('length')
    .toEqualTypeOf<2>()
  expectTypeOf(signTypedData)
    .parameters.toHaveProperty('length')
    .toEqualTypeOf<2>()
  expectTypeOf(signMessageWithKey)
    .parameters.toHaveProperty('length')
    .toEqualTypeOf<1>()
  expectTypeOf(signTransactionWithKey)
    .parameters.toHaveProperty('length')
    .toEqualTypeOf<1>()
  expectTypeOf(signTypedDataWithKey)
    .parameters.toHaveProperty('length')
    .toEqualTypeOf<1>()
  expectTypeOf<
    Parameters<typeof signTransactionWithKey>[0]
  >().not.toHaveProperty('address')
})
