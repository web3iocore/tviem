import { expectTypeOf, test } from 'vitest'
import {
  privateKeyToAddress,
  signMessage as signMessageWithKey,
  signTransaction as signTransactionWithKey,
  signTypedData as signTypedDataWithKey,
} from '../src/accounts/index.js'
import type {
  AbiItem,
  AbiItemArgs,
  AbiItemName,
  Address,
  AddressInput,
  BaseError,
  ByteArray,
  Chain,
  Client,
  ContractConstructorArgs,
  ContractErrorArgs,
  ContractErrorName,
  ContractEventArgs,
  ContractEventArgsFromTopics,
  ContractEventName,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  ContractFunctionRevertedError,
  DecodeEventLogErrorType,
  DecodeLogDataMismatchError,
  DecodeLogDataMismatchErrorType,
  DecodeLogTopicsMismatchError,
  DecodeLogTopicsMismatchErrorType,
  EncodePackedErrorType,
  EvmAddress,
  ExtractAbiFunctionForArgs,
  ExtractAbiItem,
  ExtractAbiItemForArgs,
  ExtractAbiItemNames,
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
  bytesToBigInt,
  ContractType,
  type contractTypeUrlPrefix,
  createPublicClient,
  HDKey,
  http,
  isAddress,
  keccak256,
  nile,
  normalizeAddress,
  parseTrx,
  signMessage,
  signTransaction,
  signTypedData,
  toBase58,
  toEvm,
  type UnknownContractTypeError,
  type UnsupportedWireTypeError,
  type VarintOverflowError,
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

test('the root entrypoint exports the contract helper types, on the TRON mapping', () => {
  const abi = [
    {
      type: 'function',
      name: 'owner',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
    {
      type: 'function',
      name: 'transfer',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
    {
      type: 'constructor',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'owner', type: 'address' }],
    },
    {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { name: 'from', type: 'address', indexed: true },
        { name: 'value', type: 'uint256', indexed: false },
      ],
    },
    {
      type: 'error',
      name: 'Denied',
      inputs: [{ name: 'account', type: 'address' }],
    },
  ] as const
  type TransferEvent = Extract<(typeof abi)[number], { type: 'event' }>
  type AddressFilter = AddressInput | readonly AddressInput[] | null

  // names
  expectTypeOf<ContractErrorName<typeof abi>>().toEqualTypeOf<'Denied'>()
  expectTypeOf<ContractEventName<typeof abi>>().toEqualTypeOf<'Transfer'>()
  expectTypeOf<AbiItemName<typeof abi>>().toEqualTypeOf<
    'owner' | 'transfer' | 'Transfer' | 'Denied'
  >()
  expectTypeOf<ExtractAbiItemNames<typeof abi>>().toEqualTypeOf<
    AbiItemName<typeof abi>
  >()
  expectTypeOf<
    ExtractAbiItem<typeof abi, 'Transfer'>
  >().toEqualTypeOf<TransferEvent>()
  expectTypeOf<(typeof abi)[number]>().toExtend<AbiItem>()

  // arguments: the TRON `inputs` mapping
  expectTypeOf<
    ContractFunctionArgs<typeof abi, 'nonpayable', 'transfer'>
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf<ContractConstructorArgs<typeof abi>>().toEqualTypeOf<
    readonly [AddressInput]
  >()
  expectTypeOf<ContractErrorArgs<typeof abi, 'Denied'>>().toEqualTypeOf<
    readonly [AddressInput]
  >()
  expectTypeOf<AbiItemArgs<typeof abi, 'transfer'>>().toEqualTypeOf<
    readonly [AddressInput, bigint | number]
  >()
  expectTypeOf<
    ExtractAbiFunctionForArgs<
      typeof abi,
      'nonpayable',
      'transfer',
      readonly [Address, 1n]
    >['name']
  >().toEqualTypeOf<'transfer'>()
  expectTypeOf<
    ExtractAbiItemForArgs<typeof abi, 'Denied', readonly [Address]>['type']
  >().toEqualTypeOf<'error'>()

  // results: the TRON `outputs` mapping
  expectTypeOf<
    ContractFunctionReturnType<typeof abi, 'view', 'owner'>
  >().toEqualTypeOf<Address>()
  expectTypeOf<
    ContractFunctionReturnType<typeof abi, 'nonpayable', 'transfer'>
  >().toEqualTypeOf<boolean>()

  // events: filters take the inputs mapping, decoded args the outputs one
  expectTypeOf<ContractEventArgs<typeof abi, 'Transfer'>>().toEqualTypeOf<
    | readonly [(AddressFilter | undefined)?]
    | { from?: AddressFilter | undefined }
  >()
  expectTypeOf<
    ContractEventArgsFromTopics<typeof abi, 'Transfer'>
  >().toEqualTypeOf<{ from: Address; value: bigint }>()
})

test('the root entrypoint exports no `Tron`-prefixed contract helper type', () => {
  // @ts-expect-error not exported: `ContractFunctionArgs` is the one name
  expectTypeOf<import('../src/index.js').TronContractFunctionArgs>()
  // @ts-expect-error not exported: `ContractFunctionReturnType` is the one name
  expectTypeOf<import('../src/index.js').TronContractFunctionReturnType>()
  // @ts-expect-error not exported: `ExtractAbiFunctionForArgs` is the one name
  expectTypeOf<import('../src/index.js').ExtractTronAbiFunctionForArgs>()
  // @ts-expect-error not exported: `ContractConstructorArgs` is the one name
  expectTypeOf<import('../src/index.js').TronContractConstructorArgs>()
  // @ts-expect-error not exported: `ContractErrorArgs` is the one name
  expectTypeOf<import('../src/index.js').TronContractErrorArgs>()
  // @ts-expect-error not exported: `AbiItemArgs` is the one name
  expectTypeOf<import('../src/index.js').TronAbiItemArgs>()
  // @ts-expect-error not exported: `ExtractAbiItemForArgs` is the one name
  expectTypeOf<import('../src/index.js').ExtractTronAbiItemForArgs>()
  // @ts-expect-error not exported: the mapping stays internal
  expectTypeOf<import('../src/index.js').TronAbiParametersToPrimitiveTypes>()
  // @ts-expect-error not exported: the mapping stays internal
  expectTypeOf<import('../src/index.js').TronAbiParameterToPrimitiveType>()
})

test('the root entrypoint exports none of the removed type names', () => {
  // Every reference supplies the type arguments the removed definition took,
  // so the only error left for each directive is the missing export.
  // event helper types without a function signature that uses them
  expectTypeOf<
    // @ts-expect-error not exported: `ContractEventArgs` is the filter type
    import('../src/index.js').GetEventArgs<readonly unknown[], string>
  >()
  expectTypeOf<
    // @ts-expect-error not exported
    import('../src/index.js').MaybeExtractEventArgsFromAbi<undefined, undefined>
  >()
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').MaybeAbiEventName<undefined>>()
  expectTypeOf<
    // @ts-expect-error not exported
    import('../src/index.js').AbiEventParametersToPrimitiveTypes<readonly []>
  >()
  expectTypeOf<
    // @ts-expect-error not exported
    import('../src/index.js').AbiEventParameterToPrimitiveType<{
      type: 'address'
    }>
  >()
  expectTypeOf<
    // @ts-expect-error not exported
    import('../src/index.js').AbiEventTopicToPrimitiveType<
      { type: 'address' },
      Hex
    >
  >()
  // @ts-expect-error not exported: `LogTopic` is the topic type
  expectTypeOf<import('../src/index.js').LogTopicType>()
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').EventDefinition>()
  // call parameter helper types without a function signature that uses them
  // @ts-expect-error not exported: each action exports its own parameters type
  expectTypeOf<import('../src/index.js').ContractFunctionParameters>()
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').Widen<unknown>>()
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').UnionWiden<unknown>>()
  // the codec registry entry type
  // @ts-expect-error not exported: the codec registry stays internal
  expectTypeOf<import('../src/index.js').ContractCodec>()
  // the types of the removed error classes
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').CallExecutionError>()
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').CallExecutionErrorType>()
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').RlpDepthLimitExceededError>()
  // @ts-expect-error not exported
  expectTypeOf<import('../src/index.js').RlpDepthLimitExceededErrorType>()
})

test('the root entrypoint exports no removed value', () => {
  type Root = typeof import('../src/index.js')
  expectTypeOf<
    Extract<
      keyof Root,
      | 'CallExecutionError'
      | 'RlpDepthLimitExceededError'
      | 'bytesToBigint'
      | 'contractCodecs'
      | 'getContractCodecByType'
      | 'getContractCodecByTypeUrl'
      | 'int64ToJson'
      | 'normalizeTronError'
    >
  >().toEqualTypeOf<never>()
})

test('the root entrypoint keeps the public names next to the removed ones', () => {
  expectTypeOf(HDKey.fromMasterSeed).returns.toEqualTypeOf<HDKey>()
  expectTypeOf<
    typeof contractTypeUrlPrefix
  >().toEqualTypeOf<'type.googleapis.com/protocol.'>()
  expectTypeOf(ContractType.TransferContract).toEqualTypeOf<1>()
  expectTypeOf<ContractType>().toExtend<number>()
  expectTypeOf<VarintOverflowError>().toExtend<BaseError>()
  expectTypeOf<UnsupportedWireTypeError>().toExtend<BaseError>()
  expectTypeOf<UnknownContractTypeError>().toExtend<BaseError>()
  expectTypeOf(normalizeAddress)
    .parameter(0)
    .toEqualTypeOf<AddressInput | ByteArray>()
  expectTypeOf(normalizeAddress).returns.toEqualTypeOf<ByteArray>()
  expectTypeOf(bytesToBigInt).parameter(0).toEqualTypeOf<ByteArray>()
  expectTypeOf(bytesToBigInt).returns.toEqualTypeOf<bigint>()
})
