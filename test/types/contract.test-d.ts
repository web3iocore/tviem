import {
  type Abi,
  type AbiFunction,
  type ExtractAbiEvent,
  type ExtractAbiFunction,
  parseAbi,
} from 'abitype'
import { expectTypeOf, test } from 'vitest'

import type {
  Address,
  AddressInput,
  EvmAddress,
  TronHexAddress,
} from '../../src/types/address.js'
import type {
  AbiItem,
  AbiItemArgs,
  AbiItemName,
  CallValue,
  CallValueOptions,
  ContractConstructorArgs,
  ContractErrorArgs,
  ContractErrorName,
  ContractEventArgs,
  ContractEventArgsFromTopics,
  ContractEventName,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  ExtractAbiFunctionForArgs,
  ExtractAbiItem,
  ExtractAbiItemForArgs,
  ExtractAbiItemNames,
  IsAbiFunctionPayable,
  IsContractConstructorPayable,
  IsContractFunctionPayable,
  IsPayable,
} from '../../src/types/contract.js'
import type { DecodedEventArgs, EventFilterArgs } from '../../src/types/log.js'
import type { Hex } from '../../src/types/misc.js'
import {
  base58Address,
  evmAddress,
  hexAddress,
  type largeAbi,
  type noConstructorAbi,
  type nonpayableConstructorAbi,
  type payableConstructorAbi,
  type payableNoArgsConstructorAbi,
  type vaultAbi,
} from '../fixtures/abi/contractTypes.js'

const trc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
])

test('ContractFunctionName', () => {
  expectTypeOf<ContractFunctionName<typeof trc20Abi>>().toEqualTypeOf<
    | 'name'
    | 'symbol'
    | 'decimals'
    | 'totalSupply'
    | 'balanceOf'
    | 'transfer'
    | 'transferFrom'
    | 'approve'
    | 'allowance'
  >()

  expectTypeOf<ContractFunctionName<typeof trc20Abi, 'view'>>().toEqualTypeOf<
    'name' | 'symbol' | 'decimals' | 'totalSupply' | 'balanceOf' | 'allowance'
  >()

  expectTypeOf<
    ContractFunctionName<typeof trc20Abi, 'nonpayable' | 'payable'>
  >().toEqualTypeOf<'transfer' | 'transferFrom' | 'approve'>()

  // non-inferrable abi falls back to `string`
  expectTypeOf<ContractFunctionName>().toEqualTypeOf<string>()
  expectTypeOf<
    ContractFunctionName<readonly unknown[]>
  >().toEqualTypeOf<string>()
})

test('ContractFunctionArgs', () => {
  expectTypeOf<
    ContractFunctionArgs<typeof trc20Abi, 'view', 'balanceOf'>
  >().toEqualTypeOf<readonly [AddressInput]>()

  expectTypeOf<
    ContractFunctionArgs<typeof trc20Abi, 'nonpayable', 'transfer'>
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()

  expectTypeOf<
    ContractFunctionArgs<typeof trc20Abi, 'view', 'totalSupply'>
  >().toEqualTypeOf<readonly []>()

  const abi = parseAbi([
    'function foo() view returns (int8)',
    'function foo(address) view returns (string)',
    'function foo(address, address) view returns ((address foo, address bar))',
    'function bar() view returns (int8)',
  ])
  expectTypeOf<
    ContractFunctionArgs<typeof abi, 'pure' | 'view', 'foo'>
  >().toEqualTypeOf<
    | readonly []
    | readonly [AddressInput]
    | readonly [AddressInput, AddressInput]
  >()

  // non-inferrable abi falls back to `readonly unknown[]`
  expectTypeOf<ContractFunctionArgs>().toEqualTypeOf<readonly unknown[]>()
})

test('ContractFunctionReturnType', () => {
  expectTypeOf<
    ContractFunctionReturnType<typeof trc20Abi, 'view', 'balanceOf'>
  >().toEqualTypeOf<bigint>()

  expectTypeOf<
    ContractFunctionReturnType<typeof trc20Abi, 'nonpayable', 'transfer'>
  >().toEqualTypeOf<boolean>()

  // empty outputs resolve to `void` (upstream parity — regression for an
  // accidental `undefined` introduced while vendoring)
  const noOutputAbi = parseAbi(['function foo()'])
  expectTypeOf<
    ContractFunctionReturnType<typeof noOutputAbi, 'nonpayable', 'foo'>
  >().toEqualTypeOf<void>()

  // multiple outputs resolve to the tuple of types
  const multiOutputAbi = parseAbi([
    'function foo() view returns (uint256, bool)',
  ])
  expectTypeOf<
    ContractFunctionReturnType<typeof multiOutputAbi, 'view', 'foo'>
  >().toEqualTypeOf<readonly [bigint, boolean]>()

  // non-inferrable abi falls back to `unknown`
  expectTypeOf<ContractFunctionReturnType>().toEqualTypeOf<unknown>()
})

test('AbiItem', () => {
  expectTypeOf<AbiItem>().toEqualTypeOf<Abi[number]>()
  expectTypeOf<(typeof trc20Abi)[number]>().toExtend<AbiItem>()
})

//////////////////////////////////////////////////////////////////////
// One helper family on the TRON mapping

type AddressFilter = AddressInput | readonly AddressInput[] | null | undefined

test('ContractFunctionArgs: address inputs take every TRON address form', () => {
  type Args = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'transfer'>
  expectTypeOf<Args>().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf<Args[0]>().toEqualTypeOf<Address | TronHexAddress | EvmAddress>()

  // `T…`, `41…` and `0x…` literals, `bigint` and `number` amounts
  expectTypeOf([base58Address, 1n] as const).toExtend<Args>()
  expectTypeOf([hexAddress, 1] as const).toExtend<Args>()
  expectTypeOf([evmAddress, 1n] as const).toExtend<Args>()
  expectTypeOf<[Address, bigint]>().toExtend<Args>()

  // a string without an address prefix is not an address
  expectTypeOf(['abc', 1n] as const).not.toExtend<Args>()
  // an integer input does not take a string
  expectTypeOf([base58Address, '1'] as const).not.toExtend<Args>()
  // the arity is the function's
  expectTypeOf([base58Address] as const).not.toExtend<Args>()
  expectTypeOf([base58Address, 1n, 1n] as const).not.toExtend<Args>()
})

test('ContractFunctionArgs: arrays and tuples', () => {
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'batch'>
  >().toEqualTypeOf<
    readonly [
      readonly AddressInput[],
      readonly (bigint | number)[],
      { to: AddressInput; amount: bigint | number },
      readonly [AddressInput, boolean],
    ]
  >()

  type Args = ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'batch'>
  expectTypeOf([
    [base58Address, hexAddress, evmAddress],
    [1n, 2],
    { to: hexAddress, amount: 3 },
    [evmAddress, true],
  ] as const).toExtend<Args>()

  // a tuple with unnamed components takes a `readonly` or a mutable tuple
  expectTypeOf<readonly [typeof evmAddress, true]>().toExtend<Args[3]>()
  expectTypeOf<[AddressInput, boolean]>().toExtend<Args[3]>()
  const raw = [evmAddress, true] as const
  const args: Args = [
    [evmAddress],
    [1n, 2n],
    { to: evmAddress, amount: 1n },
    raw,
  ]
  expectTypeOf(args[3]).toEqualTypeOf<readonly [AddressInput, boolean]>()
  expectTypeOf<readonly [typeof evmAddress]>().not.toExtend<Args[3]>()
})

test('ContractFunctionArgs: no inputs, mutability filter, overloads', () => {
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'view', 'name'>
  >().toEqualTypeOf<readonly []>()
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'payable', 'deposit'>
  >().toEqualTypeOf<readonly []>()

  // an overloaded name gives one tuple per overload
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'view', 'lookup'>
  >().toEqualTypeOf<
    | readonly []
    | readonly [AddressInput]
    | readonly [AddressInput, bigint | number]
  >()

  // the mutability narrows the overloads of a name
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'nonpayable' | 'payable', 'send'>
  >().toEqualTypeOf<
    readonly [AddressInput, bigint | number] | readonly [AddressInput]
  >()
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'payable', 'send'>
  >().toEqualTypeOf<readonly [AddressInput]>()
  expectTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'send'>
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
})

test('ContractFunctionArgs: wide abi and unparameterised fallbacks', () => {
  expectTypeOf<ContractFunctionArgs>().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<ContractFunctionArgs<Abi>>().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<ContractFunctionArgs<readonly unknown[]>>().toEqualTypeOf<
    readonly unknown[]
  >()
  expectTypeOf<ContractFunctionArgs<Abi, 'view', 'anything'>>().toEqualTypeOf<
    readonly unknown[]
  >()
  expectTypeOf<
    ContractFunctionArgs<readonly unknown[], 'payable', 'anything'>
  >().toEqualTypeOf<readonly unknown[]>()
})

test('ContractFunctionReturnType: address out is Base58, integers out are bigint', () => {
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'owner'>
  >().toEqualTypeOf<Address>()
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'owner'>
  >().toEqualTypeOf<`T${string}`>()

  // every integer width decodes to `bigint`
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'decimals'>
  >().toEqualTypeOf<bigint>()
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'balanceOf'>
  >().toEqualTypeOf<bigint>()
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'name'>
  >().toEqualTypeOf<string>()
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'payable', 'depositFor'>
  >().toEqualTypeOf<bigint>()
})

test('ContractFunctionReturnType: no outputs, multiple outputs, tuples', () => {
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'nonpayable', 'burn'>
  >().toEqualTypeOf<void>()
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'payable', 'deposit'>
  >().toEqualTypeOf<void>()

  // multiple outputs → the positional tuple
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'holders'>
  >().toEqualTypeOf<readonly [readonly Address[], bigint]>()

  // a single named-tuple output → the object
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'position'>
  >().toEqualTypeOf<{
    holder: Address
    amount: bigint
    tags: readonly Hex[]
  }>()

  // a single unnamed-tuple output → the positional tuple
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'pair'>
  >().toEqualTypeOf<[Address, bigint]>()
})

test('ContractFunctionReturnType: overloads are selected by args', () => {
  type Lookup<
    args extends ContractFunctionArgs<typeof vaultAbi, 'view', 'lookup'>,
  > = ContractFunctionReturnType<typeof vaultAbi, 'view', 'lookup', args>

  expectTypeOf<Lookup<readonly []>>().toEqualTypeOf<bigint>()
  // each address form selects the `address` overload
  expectTypeOf<
    Lookup<readonly [typeof base58Address]>
  >().toEqualTypeOf<Address>()
  expectTypeOf<Lookup<readonly [typeof hexAddress]>>().toEqualTypeOf<Address>()
  expectTypeOf<Lookup<readonly [typeof evmAddress]>>().toEqualTypeOf<Address>()
  expectTypeOf<Lookup<readonly [AddressInput]>>().toEqualTypeOf<Address>()
  expectTypeOf<Lookup<readonly [typeof base58Address, 1n]>>().toEqualTypeOf<
    readonly [Address, boolean]
  >()
  expectTypeOf<Lookup<readonly [typeof hexAddress, 1]>>().toEqualTypeOf<
    readonly [Address, boolean]
  >()

  // without `args` the overload without inputs is selected
  expectTypeOf<
    ContractFunctionReturnType<typeof vaultAbi, 'view', 'lookup'>
  >().toEqualTypeOf<bigint>()
  // a name without such an overload: no overload accepts the default args
  expectTypeOf<
    ContractFunctionReturnType<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send'
    >
  >().toEqualTypeOf<unknown>()

  // mixed-mutability overloads
  expectTypeOf<
    ContractFunctionReturnType<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send',
      readonly [typeof base58Address]
    >
  >().toEqualTypeOf<Address>()
  expectTypeOf<
    ContractFunctionReturnType<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send',
      readonly [typeof evmAddress, 5n]
    >
  >().toEqualTypeOf<boolean>()
})

test('ContractFunctionReturnType: wide abi and unparameterised fallbacks', () => {
  expectTypeOf<ContractFunctionReturnType>().toEqualTypeOf<unknown>()
  expectTypeOf<ContractFunctionReturnType<Abi>>().toEqualTypeOf<unknown>()
  expectTypeOf<
    ContractFunctionReturnType<readonly unknown[]>
  >().toEqualTypeOf<unknown>()
  expectTypeOf<
    ContractFunctionReturnType<Abi, 'view', 'anything', readonly [1n]>
  >().toEqualTypeOf<unknown>()
})

test('ContractConstructorArgs', () => {
  expectTypeOf<
    ContractConstructorArgs<typeof nonpayableConstructorAbi>
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf<
    ContractConstructorArgs<typeof payableConstructorAbi>
  >().toEqualTypeOf<readonly [AddressInput]>()
  expectTypeOf<
    ContractConstructorArgs<typeof payableNoArgsConstructorAbi>
  >().toEqualTypeOf<readonly []>()

  expectTypeOf([hexAddress, 100] as const).toExtend<
    ContractConstructorArgs<typeof nonpayableConstructorAbi>
  >()
  expectTypeOf([hexAddress, '100'] as const).not.toExtend<
    ContractConstructorArgs<typeof nonpayableConstructorAbi>
  >()

  // no constructor, wide abi, unparameterised
  expectTypeOf<
    ContractConstructorArgs<typeof noConstructorAbi>
  >().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<ContractConstructorArgs>().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<ContractConstructorArgs<Abi>>().toEqualTypeOf<
    readonly unknown[]
  >()
  expectTypeOf<ContractConstructorArgs<readonly unknown[]>>().toEqualTypeOf<
    readonly unknown[]
  >()
})

test('ContractErrorName / ContractErrorArgs', () => {
  expectTypeOf<ContractErrorName<typeof vaultAbi>>().toEqualTypeOf<
    'InsufficientBalance' | 'Locked'
  >()
  expectTypeOf<ContractErrorName>().toEqualTypeOf<string>()
  expectTypeOf<ContractErrorName<readonly unknown[]>>().toEqualTypeOf<string>()

  expectTypeOf<
    ContractErrorArgs<typeof vaultAbi, 'InsufficientBalance'>
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf<ContractErrorArgs<typeof vaultAbi, 'Locked'>>().toEqualTypeOf<
    readonly []
  >()

  expectTypeOf([base58Address, 1] as const).toExtend<
    ContractErrorArgs<typeof vaultAbi, 'InsufficientBalance'>
  >()
  expectTypeOf(['abc', 1] as const).not.toExtend<
    ContractErrorArgs<typeof vaultAbi, 'InsufficientBalance'>
  >()

  // an abi without errors
  expectTypeOf<ContractErrorArgs<typeof noConstructorAbi>>().toEqualTypeOf<
    readonly unknown[]
  >()
  expectTypeOf<
    ContractErrorArgs<typeof noConstructorAbi, 'Anything'>
  >().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<ContractErrorArgs>().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<ContractErrorArgs<Abi>>().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<ContractErrorArgs<readonly unknown[]>>().toEqualTypeOf<
    readonly unknown[]
  >()
})

test('ContractEventName / ContractEventArgs: the indexed-argument filter', () => {
  expectTypeOf<ContractEventName<typeof vaultAbi>>().toEqualTypeOf<
    'Transfer' | 'Note' | 'Ping' | 'Paused'
  >()
  expectTypeOf<ContractEventName>().toEqualTypeOf<string>()
  expectTypeOf<ContractEventName<readonly unknown[]>>().toEqualTypeOf<string>()

  type TransferArgs = ContractEventArgs<typeof vaultAbi, 'Transfer'>
  expectTypeOf<TransferArgs>().toEqualTypeOf<
    | readonly [AddressFilter?, AddressFilter?]
    | { from?: AddressFilter; to?: AddressFilter }
  >()
  // the same type `getLogs` takes
  expectTypeOf<TransferArgs>().toEqualTypeOf<
    EventFilterArgs<ExtractAbiEvent<typeof vaultAbi, 'Transfer'>>
  >()

  // any address form, a list of alternatives, a wildcard
  expectTypeOf<{ from: typeof base58Address }>().toExtend<TransferArgs>()
  expectTypeOf<{
    to: readonly [typeof hexAddress, typeof evmAddress]
  }>().toExtend<TransferArgs>()
  expectTypeOf<readonly [null, typeof evmAddress]>().toExtend<TransferArgs>()
  // the non-indexed input is not part of the filter
  expectTypeOf<{ value: bigint }>().not.toExtend<TransferArgs>()

  // an indexed `string` takes the raw value, an integer `bigint | number`
  expectTypeOf<ContractEventArgs<typeof vaultAbi, 'Note'>>().toEqualTypeOf<
    | readonly [
        (string | readonly string[] | null | undefined)?,
        (bigint | number | readonly (bigint | number)[] | null | undefined)?,
      ]
    | {
        tag?: string | readonly string[] | null | undefined
        id?: bigint | number | readonly (bigint | number)[] | null | undefined
      }
  >()

  // unnamed inputs: positional only
  expectTypeOf<ContractEventArgs<typeof vaultAbi, 'Ping'>>().toEqualTypeOf<
    readonly [AddressFilter?]
  >()

  // an abi without events
  expectTypeOf<ContractEventArgs<typeof noConstructorAbi>>().toEqualTypeOf<
    readonly unknown[] | Record<string, unknown>
  >()
  expectTypeOf<
    ContractEventArgs<typeof noConstructorAbi, 'Anything'>
  >().toEqualTypeOf<readonly unknown[] | Record<string, unknown>>()

  // wide abi and unparameterised
  expectTypeOf<ContractEventArgs>().toEqualTypeOf<
    readonly unknown[] | Record<string, unknown>
  >()
  expectTypeOf<ContractEventArgs<Abi>>().toEqualTypeOf<
    readonly unknown[] | Record<string, unknown>
  >()
  expectTypeOf<ContractEventArgs<readonly unknown[]>>().toEqualTypeOf<
    readonly unknown[] | Record<string, unknown>
  >()
})

test('ContractEventArgsFromTopics: the decoded args', () => {
  type TransferArgs = ContractEventArgsFromTopics<typeof vaultAbi, 'Transfer'>
  expectTypeOf<TransferArgs>().toEqualTypeOf<{
    from: Address
    to: Address
    value: bigint
  }>()
  // the same type `decodeEventLog` returns
  expectTypeOf<TransferArgs>().toEqualTypeOf<
    DecodedEventArgs<ExtractAbiEvent<typeof vaultAbi, 'Transfer'>>
  >()

  // an indexed `string` decodes to its topic
  expectTypeOf<
    ContractEventArgsFromTopics<typeof vaultAbi, 'Note'>
  >().toEqualTypeOf<{ tag: Hex; id: bigint; data: Hex }>()

  // unnamed inputs: positional over all inputs
  expectTypeOf<
    ContractEventArgsFromTopics<typeof vaultAbi, 'Ping'>
  >().toEqualTypeOf<readonly [Address, bigint]>()

  // an event without inputs has no args
  expectTypeOf<
    ContractEventArgsFromTopics<typeof vaultAbi, 'Paused'>
  >().toEqualTypeOf<undefined>()

  // non-strict: every input optional, or no args at all
  expectTypeOf<
    ContractEventArgsFromTopics<typeof vaultAbi, 'Transfer', false>
  >().toEqualTypeOf<
    | {
        from?: Address
        to?: Address
        value?: bigint
      }
    | undefined
  >()

  // an abi without events
  expectTypeOf<
    ContractEventArgsFromTopics<typeof noConstructorAbi>
  >().toEqualTypeOf<readonly unknown[] | Record<string, unknown> | undefined>()
  expectTypeOf<
    ContractEventArgsFromTopics<typeof noConstructorAbi, 'Anything', false>
  >().toEqualTypeOf<readonly unknown[] | Record<string, unknown> | undefined>()

  // wide abi and unparameterised
  expectTypeOf<ContractEventArgsFromTopics>().toEqualTypeOf<
    readonly unknown[] | Record<string, unknown> | undefined
  >()
  expectTypeOf<ContractEventArgsFromTopics<Abi>>().toEqualTypeOf<
    readonly unknown[] | Record<string, unknown> | undefined
  >()
  expectTypeOf<ContractEventArgsFromTopics<readonly unknown[]>>().toEqualTypeOf<
    readonly unknown[] | Record<string, unknown> | undefined
  >()
})

test('AbiItemName / AbiItemArgs', () => {
  expectTypeOf<AbiItemName<typeof nonpayableConstructorAbi>>().toBeNever()
  expectTypeOf<AbiItemName<typeof noConstructorAbi>>().toEqualTypeOf<'ping'>()
  expectTypeOf<AbiItemName>().toEqualTypeOf<string>()
  expectTypeOf<AbiItemName<readonly unknown[]>>().toEqualTypeOf<string>()
  expectTypeOf<'transfer' | 'Transfer' | 'InsufficientBalance'>().toExtend<
    AbiItemName<typeof vaultAbi>
  >()

  // function, event and error items all map through the TRON inputs
  expectTypeOf<AbiItemArgs<typeof vaultAbi, 'transfer'>>().toEqualTypeOf<
    readonly [AddressInput, bigint | number]
  >()
  expectTypeOf<AbiItemArgs<typeof vaultAbi, 'Transfer'>>().toEqualTypeOf<
    readonly [AddressInput, AddressInput, bigint | number]
  >()
  expectTypeOf<
    AbiItemArgs<typeof vaultAbi, 'InsufficientBalance'>
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf<AbiItemArgs<typeof vaultAbi, 'burn'>>().toEqualTypeOf<
    readonly []
  >()

  // an overloaded name gives one tuple per overload
  expectTypeOf<AbiItemArgs<typeof vaultAbi, 'send'>>().toEqualTypeOf<
    readonly [AddressInput, bigint | number] | readonly [AddressInput]
  >()

  // the same tuple as the function-specific helper
  expectTypeOf<AbiItemArgs<typeof vaultAbi, 'batch'>>().toEqualTypeOf<
    ContractFunctionArgs<typeof vaultAbi, 'nonpayable', 'batch'>
  >()

  // an abi without named items
  expectTypeOf<AbiItemArgs<typeof nonpayableConstructorAbi>>().toEqualTypeOf<
    readonly unknown[]
  >()
  expectTypeOf<AbiItemArgs<readonly []>>().toEqualTypeOf<readonly unknown[]>()

  expectTypeOf<AbiItemArgs>().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<AbiItemArgs<Abi>>().toEqualTypeOf<readonly unknown[]>()
  expectTypeOf<AbiItemArgs<readonly unknown[]>>().toEqualTypeOf<
    readonly unknown[]
  >()
})

test('ExtractAbiItemNames / ExtractAbiItem', () => {
  expectTypeOf<
    ExtractAbiItemNames<typeof noConstructorAbi>
  >().toEqualTypeOf<'ping'>()
  expectTypeOf<ExtractAbiItem<typeof vaultAbi, 'Transfer'>>().toEqualTypeOf<
    ExtractAbiEvent<typeof vaultAbi, 'Transfer'>
  >()
  expectTypeOf<
    ExtractAbiItem<typeof vaultAbi, 'transfer'>['stateMutability']
  >().toEqualTypeOf<'nonpayable'>()
})

test('ExtractAbiFunctionForArgs: any address form selects the address overload', () => {
  type Selected<
    args extends ContractFunctionArgs<typeof vaultAbi, 'view', 'lookup'>,
  > = ExtractAbiFunctionForArgs<
    typeof vaultAbi,
    'view',
    'lookup',
    args
  >['outputs']

  type None = readonly [{ readonly name: ''; readonly type: 'uint8' }]
  type One = readonly [{ readonly name: ''; readonly type: 'address' }]
  type Two = readonly [
    { readonly name: ''; readonly type: 'address' },
    { readonly name: ''; readonly type: 'bool' },
  ]

  expectTypeOf<Selected<readonly []>>().toEqualTypeOf<None>()
  expectTypeOf<Selected<readonly [typeof base58Address]>>().toEqualTypeOf<One>()
  expectTypeOf<Selected<readonly [typeof hexAddress]>>().toEqualTypeOf<One>()
  expectTypeOf<Selected<readonly [typeof evmAddress]>>().toEqualTypeOf<One>()
  expectTypeOf<
    Selected<readonly [typeof base58Address, 1n]>
  >().toEqualTypeOf<Two>()
  expectTypeOf<Selected<readonly [typeof hexAddress, 1]>>().toEqualTypeOf<Two>()
  expectTypeOf<
    Selected<readonly [typeof evmAddress, bigint]>
  >().toEqualTypeOf<Two>()

  // args that are not given select the overload without inputs
  expectTypeOf<
    Selected<ContractFunctionArgs<typeof vaultAbi, 'view', 'lookup'>>
  >().toEqualTypeOf<None>()
  // no overload accepts the args: `never`
  expectTypeOf<
    ExtractAbiFunctionForArgs<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send',
      ContractFunctionArgs<typeof vaultAbi, 'nonpayable' | 'payable', 'send'>
    >
  >().toBeNever()

  // a function that is not overloaded is returned whatever the args
  expectTypeOf<
    ExtractAbiFunctionForArgs<
      typeof vaultAbi,
      'nonpayable',
      'transfer',
      readonly [typeof hexAddress, 1n]
    >['name']
  >().toEqualTypeOf<'transfer'>()

  // mixed-mutability overloads
  expectTypeOf<
    ExtractAbiFunctionForArgs<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send',
      readonly [typeof hexAddress]
    >['stateMutability']
  >().toEqualTypeOf<'payable'>()
  expectTypeOf<
    ExtractAbiFunctionForArgs<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send',
      readonly [typeof base58Address, 1]
    >['stateMutability']
  >().toEqualTypeOf<'nonpayable'>()
})

test('ExtractAbiItemForArgs: any address form selects the address overload', () => {
  type Selected<args extends AbiItemArgs<typeof vaultAbi, 'send'>> =
    ExtractAbiItemForArgs<typeof vaultAbi, 'send', args>['stateMutability']

  expectTypeOf<
    Selected<readonly [typeof base58Address]>
  >().toEqualTypeOf<'payable'>()
  expectTypeOf<
    Selected<readonly [typeof hexAddress]>
  >().toEqualTypeOf<'payable'>()
  expectTypeOf<
    Selected<readonly [typeof evmAddress]>
  >().toEqualTypeOf<'payable'>()
  expectTypeOf<
    Selected<readonly [typeof base58Address, 1n]>
  >().toEqualTypeOf<'nonpayable'>()
  expectTypeOf<
    Selected<readonly [typeof hexAddress, 1]>
  >().toEqualTypeOf<'nonpayable'>()
  expectTypeOf<
    Selected<readonly [typeof evmAddress, number]>
  >().toEqualTypeOf<'nonpayable'>()

  // events and errors are items too
  expectTypeOf<
    ExtractAbiItemForArgs<
      typeof vaultAbi,
      'Transfer',
      readonly [typeof base58Address, typeof hexAddress, 1n]
    >['type']
  >().toEqualTypeOf<'event'>()
  expectTypeOf<
    ExtractAbiItemForArgs<
      typeof vaultAbi,
      'InsufficientBalance',
      readonly [typeof evmAddress, 1]
    >['type']
  >().toEqualTypeOf<'error'>()
})

//////////////////////////////////////////////////////////////////////
// Call value

test('IsPayable', () => {
  expectTypeOf<
    IsPayable<{ stateMutability: 'payable' }>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsPayable<{ stateMutability: 'nonpayable' }>
  >().toEqualTypeOf<false>()
  expectTypeOf<IsPayable<{ stateMutability: 'view' }>>().toEqualTypeOf<false>()
  // the legacy flag
  expectTypeOf<
    IsPayable<{ stateMutability: 'nonpayable'; payable: true }>
  >().toEqualTypeOf<true>()
  // a union: any payable member
  expectTypeOf<
    IsPayable<
      { stateMutability: 'nonpayable' } | { stateMutability: 'payable' }
    >
  >().toEqualTypeOf<true>()
  expectTypeOf<IsPayable<never>>().toEqualTypeOf<false>()
})

test('IsContractFunctionPayable', () => {
  type Write = 'nonpayable' | 'payable'
  type Payable<
    functionName extends ContractFunctionName<typeof vaultAbi, Write>,
    args extends ContractFunctionArgs<
      typeof vaultAbi,
      Write,
      functionName
    > = ContractFunctionArgs<typeof vaultAbi, Write, functionName>,
  > = IsContractFunctionPayable<typeof vaultAbi, Write, functionName, args>

  expectTypeOf<Payable<'transfer'>>().toEqualTypeOf<false>()
  expectTypeOf<Payable<'burn'>>().toEqualTypeOf<false>()
  expectTypeOf<Payable<'deposit'>>().toEqualTypeOf<true>()
  expectTypeOf<Payable<'depositFor'>>().toEqualTypeOf<true>()

  // overloads: the one selected by args decides
  expectTypeOf<
    Payable<'send', readonly [typeof base58Address]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    Payable<'send', readonly [typeof hexAddress]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    Payable<'send', readonly [typeof evmAddress, 1n]>
  >().toEqualTypeOf<false>()
  expectTypeOf<Payable<'stake', readonly []>>().toEqualTypeOf<false>()
  expectTypeOf<
    Payable<'stake', readonly [typeof hexAddress]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    Payable<'move', readonly [typeof base58Address, typeof hexAddress]>
  >().toEqualTypeOf<false>()

  // a function name that is not a single literal
  expectTypeOf<Payable<'transfer' | 'burn'>>().toEqualTypeOf<true>()

  // wide abi and unparameterised
  expectTypeOf<IsContractFunctionPayable>().toEqualTypeOf<true>()
  expectTypeOf<IsContractFunctionPayable<Abi>>().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<readonly unknown[]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<Abi, Write, 'transfer'>
  >().toEqualTypeOf<true>()
})

test('IsContractFunctionPayable: args that are a union of tuples', () => {
  type Write = 'nonpayable' | 'payable'
  type Payable<
    functionName extends ContractFunctionName<typeof vaultAbi, Write>,
    args extends ContractFunctionArgs<
      typeof vaultAbi,
      Write,
      functionName
    > = ContractFunctionArgs<typeof vaultAbi, Write, functionName>,
  > = IsContractFunctionPayable<typeof vaultAbi, Write, functionName, args>

  // the default args are every overload's tuple: any payable overload
  expectTypeOf<Payable<'send'>>().toEqualTypeOf<true>()
  expectTypeOf<Payable<'stake'>>().toEqualTypeOf<true>()
  expectTypeOf<Payable<'move'>>().toEqualTypeOf<false>()
  expectTypeOf<
    Payable<'stake', readonly [] | readonly [typeof base58Address]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    Payable<'stake', readonly [] | readonly [AddressInput]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    Payable<'send', readonly [Address] | readonly [Address, bigint]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    Payable<'move', readonly [Address] | readonly [Address, Address]>
  >().toEqualTypeOf<false>()

  // each tuple of the union selects its overload: the others do not count
  const runAbi = parseAbi([
    'function run()',
    'function run(address to)',
    'function run(address to, uint256 amount) payable',
  ])
  type Run<
    args extends ContractFunctionArgs<
      typeof runAbi,
      Write,
      'run'
    > = ContractFunctionArgs<typeof runAbi, Write, 'run'>,
  > = IsContractFunctionPayable<typeof runAbi, Write, 'run', args>
  expectTypeOf<Run>().toEqualTypeOf<true>()
  expectTypeOf<Run<readonly [] | readonly [Address]>>().toEqualTypeOf<false>()
  expectTypeOf<
    Run<readonly [] | readonly [Address, 1n]>
  >().toEqualTypeOf<true>()
  expectTypeOf<Run<readonly [Address, bigint]>>().toEqualTypeOf<true>()
  expectTypeOf<Run<readonly [Address]>>().toEqualTypeOf<false>()
  expectTypeOf<Run<readonly []>>().toEqualTypeOf<false>()

  // `any` selects no overload: any payable overload
  expectTypeOf<Run<any>>().toEqualTypeOf<true>()
  expectTypeOf<Payable<'stake', any>>().toEqualTypeOf<true>()
  expectTypeOf<Payable<'move', any>>().toEqualTypeOf<false>()
})

test('IsContractFunctionPayable: the mutability filters the overloads', () => {
  expectTypeOf<
    IsContractFunctionPayable<typeof vaultAbi, 'nonpayable', 'send'>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractFunctionPayable<typeof vaultAbi, 'payable', 'send'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<typeof vaultAbi, 'nonpayable', 'stake'>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractFunctionPayable<typeof vaultAbi, 'payable', 'stake'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<typeof vaultAbi, 'view', 'lookup'>
  >().toEqualTypeOf<false>()

  // two `nonpayable` overloads and a `payable` one
  const runAbi = parseAbi([
    'function run()',
    'function run(address to)',
    'function run(address to, uint256 amount) payable',
  ])
  expectTypeOf<
    IsContractFunctionPayable<typeof runAbi, 'nonpayable', 'run'>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractFunctionPayable<typeof runAbi, 'nonpayable' | 'payable', 'run'>
  >().toEqualTypeOf<true>()
  expectTypeOf<IsContractFunctionPayable<typeof runAbi>>().toEqualTypeOf<true>()

  // args that select no overload: the overloads of the mutability count
  expectTypeOf<
    IsContractFunctionPayable<typeof vaultAbi, 'nonpayable', 'send', any>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractFunctionPayable<typeof vaultAbi, 'payable', 'send', any>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<
      typeof vaultAbi,
      'nonpayable' | 'payable',
      'send',
      any
    >
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<typeof runAbi, 'nonpayable', 'run', any>
  >().toEqualTypeOf<false>()
})

test('IsContractFunctionPayable: a function the abi type does not list', () => {
  type Write = 'nonpayable' | 'payable'

  // abi types that are not a tuple of literal items
  expectTypeOf<
    IsContractFunctionPayable<AbiFunction[], Write, 'deposit'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<readonly AbiFunction[], Write, 'deposit'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<readonly [AbiFunction], Write, 'deposit'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<AbiItem[], Write, 'deposit'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<AbiItem[], Write, 'deposit', readonly [1n]>
  >().toEqualTypeOf<true>()

  // literal abis without a `nonpayable` / `payable` function
  expectTypeOf<
    IsContractFunctionPayable<readonly [], Write, 'deposit'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<typeof noConstructorAbi, Write, 'deposit'>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<typeof payableConstructorAbi, Write, 'deposit'>
  >().toEqualTypeOf<true>()
  // … and a name typed `string`
  expectTypeOf<
    IsContractFunctionPayable<typeof noConstructorAbi, Write, string>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<typeof noConstructorAbi, Write>
  >().toEqualTypeOf<true>()

  // a function the abi lists under another mutability is known
  expectTypeOf<
    IsContractFunctionPayable<typeof noConstructorAbi, 'view', 'ping'>
  >().toEqualTypeOf<false>()
})

test('IsAbiFunctionPayable', () => {
  type Stake = ExtractAbiFunction<typeof vaultAbi, 'stake'>
  type Move = ExtractAbiFunction<typeof vaultAbi, 'move'>
  type Deposit = ExtractAbiFunction<typeof vaultAbi, 'deposit'>
  type Transfer = ExtractAbiFunction<typeof vaultAbi, 'transfer'>

  // the overload the args select
  expectTypeOf<
    IsAbiFunctionPayable<Stake, readonly []>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsAbiFunctionPayable<Stake, readonly [typeof hexAddress]>
  >().toEqualTypeOf<true>()
  // a union of tuples: the overloads of every member
  expectTypeOf<
    IsAbiFunctionPayable<Stake, readonly [] | readonly [AddressInput]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsAbiFunctionPayable<Move, readonly [Address] | readonly [Address, Address]>
  >().toEqualTypeOf<false>()
  // args no overload accepts, `any` and `never`: every overload counts
  expectTypeOf<
    IsAbiFunctionPayable<Stake, readonly [1n]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsAbiFunctionPayable<Move, readonly [1n]>
  >().toEqualTypeOf<false>()
  expectTypeOf<IsAbiFunctionPayable<Stake, any>>().toEqualTypeOf<true>()
  expectTypeOf<IsAbiFunctionPayable<Move, any>>().toEqualTypeOf<false>()
  expectTypeOf<IsAbiFunctionPayable<Stake, never>>().toEqualTypeOf<true>()

  // a function that is not overloaded decides whatever the args
  expectTypeOf<
    IsAbiFunctionPayable<Deposit, readonly []>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsAbiFunctionPayable<Deposit, readonly [1n]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsAbiFunctionPayable<Transfer, readonly [Address, bigint]>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsAbiFunctionPayable<Transfer, readonly []>
  >().toEqualTypeOf<false>()
  // the wide function
  expectTypeOf<
    IsAbiFunctionPayable<AbiFunction, readonly []>
  >().toEqualTypeOf<true>()
})

test('IsContractConstructorPayable', () => {
  expectTypeOf<
    IsContractConstructorPayable<typeof nonpayableConstructorAbi>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractConstructorPayable<typeof payableConstructorAbi>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractConstructorPayable<typeof payableNoArgsConstructorAbi>
  >().toEqualTypeOf<true>()
  // an abi without a constructor
  expectTypeOf<
    IsContractConstructorPayable<typeof noConstructorAbi>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractConstructorPayable<readonly []>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractConstructorPayable<readonly [AbiFunction]>
  >().toEqualTypeOf<false>()
  // an abi type that is not a tuple and lists no constructor
  expectTypeOf<
    IsContractConstructorPayable<AbiFunction[]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractConstructorPayable<readonly AbiFunction[]>
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractConstructorPayable<(typeof noConstructorAbi)[number][]>
  >().toEqualTypeOf<true>()
  // … one that lists a constructor follows it
  expectTypeOf<IsContractConstructorPayable<AbiItem[]>>().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractConstructorPayable<(typeof nonpayableConstructorAbi)[number][]>
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractConstructorPayable<(typeof payableConstructorAbi)[number][]>
  >().toEqualTypeOf<true>()
  // wide abi and unparameterised
  expectTypeOf<IsContractConstructorPayable>().toEqualTypeOf<true>()
  expectTypeOf<IsContractConstructorPayable<Abi>>().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractConstructorPayable<readonly unknown[]>
  >().toEqualTypeOf<true>()
})

test('CallValue', () => {
  expectTypeOf<CallValue<true>>().toEqualTypeOf<bigint>()
  expectTypeOf<CallValue<false>>().toEqualTypeOf<undefined>()
  expectTypeOf<CallValue<boolean>>().toEqualTypeOf<bigint>()
  expectTypeOf<CallValue>().toEqualTypeOf<bigint>()
})

test('CallValueOptions', () => {
  expectTypeOf<CallValueOptions<true>>().toEqualTypeOf<{
    callValue?: bigint | undefined
    callTokenValue?: bigint | undefined
    tokenId?: bigint | undefined
  }>()
  expectTypeOf<CallValueOptions<false>>().toEqualTypeOf<{
    callValue?: undefined
    callTokenValue?: undefined
    tokenId?: undefined
  }>()
  expectTypeOf<CallValueOptions['callValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<CallValueOptions['callTokenValue']>().toEqualTypeOf<
    bigint | undefined
  >()
  expectTypeOf<CallValueOptions['tokenId']>().toEqualTypeOf<
    bigint | undefined
  >()
})

//////////////////////////////////////////////////////////////////////
// A production-sized abi

test('the helpers resolve on a thirty-function abi', () => {
  expectTypeOf<
    ContractFunctionArgs<typeof largeAbi, 'nonpayable', 'permit'>
  >().toEqualTypeOf<
    readonly [
      AddressInput,
      AddressInput,
      bigint | number,
      bigint | number,
      bigint | number,
      Hex,
      Hex,
    ]
  >()
  expectTypeOf<
    ContractFunctionReturnType<typeof largeAbi, 'view', 'getReserves'>
  >().toEqualTypeOf<readonly [bigint, bigint, bigint]>()
  expectTypeOf<
    ContractFunctionReturnType<typeof largeAbi, 'view', 'holdersOf'>
  >().toEqualTypeOf<readonly [readonly Address[], bigint]>()
  expectTypeOf<
    ContractFunctionReturnType<typeof largeAbi, 'view', 'owner'>
  >().toEqualTypeOf<Address>()
  expectTypeOf<
    ContractFunctionArgs<
      typeof largeAbi,
      'nonpayable' | 'payable',
      'safeTransfer'
    >
  >().toEqualTypeOf<
    | readonly [AddressInput, bigint | number]
    | readonly [AddressInput, bigint | number, Hex]
  >()
  expectTypeOf<
    IsContractFunctionPayable<
      typeof largeAbi,
      'nonpayable' | 'payable',
      'safeTransfer',
      readonly [typeof base58Address, 1n, '0x']
    >
  >().toEqualTypeOf<true>()
  expectTypeOf<
    IsContractFunctionPayable<
      typeof largeAbi,
      'nonpayable' | 'payable',
      'safeTransfer',
      readonly [typeof base58Address, 1n]
    >
  >().toEqualTypeOf<false>()
  expectTypeOf<
    IsContractConstructorPayable<typeof largeAbi>
  >().toEqualTypeOf<true>()
  expectTypeOf<ContractConstructorArgs<typeof largeAbi>>().toEqualTypeOf<
    readonly [AddressInput, bigint | number]
  >()
  expectTypeOf<
    ContractErrorArgs<typeof largeAbi, 'Unauthorized'>
  >().toEqualTypeOf<readonly [AddressInput]>()
  expectTypeOf<
    ContractEventArgsFromTopics<typeof largeAbi, 'OwnershipTransferred'>
  >().toEqualTypeOf<{ previousOwner: Address; newOwner: Address }>()
})

//////////////////////////////////////////////////////////////////////
// trcToken

test('trcToken maps like uint256', () => {
  const tokenAbi = [
    {
      type: 'function',
      name: 'transferToken',
      stateMutability: 'payable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'id', type: 'trcToken' },
      ],
      outputs: [{ name: '', type: 'trcToken' }],
    },
  ] as const

  expectTypeOf<
    ContractFunctionArgs<typeof tokenAbi, 'payable', 'transferToken'>
  >().toEqualTypeOf<readonly [AddressInput, bigint | number]>()
  expectTypeOf<
    ContractFunctionReturnType<typeof tokenAbi, 'payable', 'transferToken'>
  >().toEqualTypeOf<bigint>()
  expectTypeOf<
    IsContractFunctionPayable<typeof tokenAbi, 'payable', 'transferToken'>
  >().toEqualTypeOf<true>()
})
