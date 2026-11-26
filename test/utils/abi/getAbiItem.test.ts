import type { Abi, AbiFunction, AbiParameter } from 'abitype'
import { describe, expect, test } from 'vitest'

import {
  AbiFunctionNotFoundError,
  AbiItemAmbiguityError,
} from '../../../src/errors/abi.js'
import { decodeFunctionResult } from '../../../src/utils/abi/decodeFunctionResult.js'
import { encodeFunctionData } from '../../../src/utils/abi/encodeFunctionData.js'
import { formatAbiItem } from '../../../src/utils/abi/formatAbiItem.js'
import {
  getAbiItem,
  getAmbiguousTypes,
  isArgOfType,
} from '../../../src/utils/abi/getAbiItem.js'
import { prepareEncodeFunctionData } from '../../../src/utils/abi/prepareEncodeFunctionData.js'
import { toFunctionSelector } from '../../../src/utils/hash/toFunctionSelector.js'

const abi = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const satisfies Abi

test('finds a function by name', () => {
  const item = getAbiItem({ abi, name: 'balanceOf' })
  expect(item?.type).toBe('function')
  expect((item as unknown as { name: string }).name).toBe('balanceOf')
})

test('returns undefined for an unknown name', () => {
  expect(getAbiItem({ abi, name: 'missing' as never })).toBeUndefined()
})

test('finds a function by 4-byte selector', () => {
  // transfer(address,uint256) -> 0xa9059cbb
  const item = getAbiItem({ abi, name: '0xa9059cbb' })
  expect((item as unknown as { name: string }).name).toBe('transfer')
})

test('finds an event by 32-byte selector', () => {
  // Transfer(address,address,uint256)
  const item = getAbiItem({
    abi,
    name: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  })
  expect((item as unknown as { name: string; type: string }).type).toBe('event')
  expect((item as unknown as { name: string }).name).toBe('Transfer')
})

const overloaded = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi

test('disambiguates overloads: Base58 address selects the address overload', () => {
  const item = getAbiItem({
    abi: overloaded,
    name: 'foo',
    args: ['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'],
  })
  expect(
    (item as unknown as { inputs: readonly { type: string }[] }).inputs[0]!
      .type,
  ).toBe('address')
})

test('disambiguates overloads: bigint selects the uint256 overload', () => {
  const item = getAbiItem({ abi: overloaded, name: 'foo', args: [123n] })
  expect(
    (item as unknown as { inputs: readonly { type: string }[] }).inputs[0]!
      .type,
  ).toBe('uint256')
})

test('rejects a named overload when no candidate matches the arguments', () => {
  for (const abi of [overloaded, [...overloaded].reverse()]) {
    const args = [true]
    const parameters = { abi, functionName: 'foo', args } as const
    expect(getAbiItem({ abi, name: 'foo' })).toBeUndefined()
    expect(getAbiItem({ abi, name: 'foo', args })).toBeUndefined()
    expect(() => prepareEncodeFunctionData(parameters)).toThrowError(
      AbiFunctionNotFoundError,
    )
    expect(() => encodeFunctionData(parameters)).toThrowError(
      AbiFunctionNotFoundError,
    )
    expect(() =>
      decodeFunctionResult({ ...parameters, data: '0x' }),
    ).toThrowError(AbiFunctionNotFoundError)
  }
})

test('disambiguates arity-only overloads by argument count', () => {
  const nft = [
    {
      type: 'function',
      name: 'safeTransferFrom',
      inputs: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'safeTransferFrom',
      inputs: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ] as const satisfies Abi
  const item = getAbiItem({
    abi: nft,
    name: 'safeTransferFrom',
    args: [
      'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC',
      'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K',
      1n,
      '0x0102',
    ],
  })
  expect(
    (item as unknown as { inputs: readonly unknown[] }).inputs.length,
  ).toBe(4)
})

test('throws on an ambiguous address/string overload', () => {
  const ambiguous = [
    {
      type: 'function',
      name: 'bar',
      inputs: [{ name: 'x', type: 'address' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      type: 'function',
      name: 'bar',
      inputs: [{ name: 'x', type: 'string' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ] as const satisfies Abi
  expect(() =>
    getAbiItem({
      abi: ambiguous,
      name: 'bar',
      args: ['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'],
    }),
  ).toThrowError(AbiItemAmbiguityError)
})

test('isArgOfType matches TRON address forms and trcToken', () => {
  expect(
    isArgOfType('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC', { type: 'address' }),
  ).toBe(true)
  expect(
    isArgOfType('0x2b5ad5c4795c026514f8317c7a215e218dccd6cf', {
      type: 'address',
    }),
  ).toBe(true)
  expect(isArgOfType(9n, { type: 'trcToken' })).toBe(true)
  expect(isArgOfType('nope', { type: 'trcToken' })).toBe(false)
  expect(isArgOfType([1n, 2n], { type: 'uint256[]' })).toBe(true)
})

test('getAmbiguousTypes reports address/string only for address args', () => {
  const source = [{ name: 'x', type: 'address' }]
  const target = [{ name: 'x', type: 'string' }]
  expect(
    getAmbiguousTypes(source, target, ['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC']),
  ).toEqual(['address', 'string'])
  expect(getAmbiguousTypes(source, target, ['just a string'])).toBeUndefined()
})

describe('empty arrays cannot disambiguate overloads', () => {
  const fn = (input: AbiParameter): AbiFunction => ({
    type: 'function',
    name: 'f',
    inputs: [input],
    outputs: [],
    stateMutability: 'nonpayable',
  })
  const numeric = fn({ type: 'uint256[2][]' })
  const textual = fn({ type: 'string[3][]' })
  const args = [[]]

  test('the reported call has two encodable selectors and throws in either ABI order', () => {
    const numericData = encodeFunctionData({
      abi: [numeric],
      functionName: 'f',
      args,
    })
    const textualData = encodeFunctionData({
      abi: [textual],
      functionName: 'f',
      args,
    })
    expect(numericData.slice(0, 10)).toBe('0x047d9e3a')
    expect(textualData.slice(0, 10)).toBe('0x5bd0c532')
    expect(numericData.slice(10)).toBe(textualData.slice(10))

    for (const abi of [
      [numeric, textual],
      [textual, numeric],
    ]) {
      expect(() => getAbiItem({ abi, name: 'f', args })).toThrowError(
        AbiItemAmbiguityError,
      )
      expect(() =>
        encodeFunctionData({ abi, functionName: 'f', args }),
      ).toThrowError(AbiItemAmbiguityError)
      expect(() =>
        prepareEncodeFunctionData({ abi, functionName: 'f', args }),
      ).toThrowError(AbiItemAmbiguityError)
      expect(() =>
        decodeFunctionResult({ abi, functionName: 'f', args, data: '0x' }),
      ).toThrowError(AbiItemAmbiguityError)

      for (const [item, data] of [
        [numeric, numericData],
        [textual, textualData],
      ] as const) {
        const selector = toFunctionSelector(item)
        expect(getAbiItem({ abi, name: selector, args })).toBe(item)
        expect(encodeFunctionData({ abi, functionName: selector, args })).toBe(
          data,
        )
      }
    }
  })

  test.each<{
    source: AbiParameter
    target: AbiParameter
    arg: unknown
  }>([
    { source: { type: 'uint256[]' }, target: { type: 'string[]' }, arg: [] },
    { source: { type: 'address[]' }, target: { type: 'string[]' }, arg: [] },
    { source: { type: 'bytes[]' }, target: { type: 'bytes32[]' }, arg: [] },
    {
      source: { type: 'uint256[2][]' },
      target: { type: 'string[3][]' },
      arg: [],
    },
    {
      source: { type: 'uint256[2][]' },
      target: { type: 'string[2][]' },
      arg: [],
    },
    {
      source: { type: 'uint256[][]' },
      target: { type: 'bool[][]' },
      arg: [[]],
    },
    {
      source: { type: 'uint256[][][]' },
      target: { type: 'bool[][][]' },
      arg: [[[]]],
    },
    {
      source: { type: 'uint256[][2]' },
      target: { type: 'bool[][2]' },
      arg: [[], []],
    },
    {
      source: { type: 'tuple[]', components: [{ type: 'uint256' }] },
      target: {
        type: 'tuple[]',
        components: [{ type: 'string' }, { type: 'bool' }],
      },
      arg: [],
    },
    {
      source: { type: 'tuple[]', components: [{ type: 'uint256' }] },
      target: { type: 'string[3][]' },
      arg: [],
    },
    {
      source: {
        type: 'tuple',
        components: [{ name: 'xs', type: 'uint256[]' }],
      },
      target: { type: 'tuple', components: [{ name: 'xs', type: 'string[]' }] },
      arg: { xs: [] },
    },
  ])('$source.type / $target.type with $arg', ({ source, target, arg }) => {
    const items = [fn(source), fn(target)]
    const args = [arg]
    // Both candidates really encode the argument; ambiguity cannot depend
    // on whether any scalar element exists to compare.
    for (const item of items)
      expect(() =>
        encodeFunctionData({ abi: [item], functionName: 'f', args }),
      ).not.toThrow()
    for (const abi of [items, [...items].reverse()]) {
      expect(() => getAbiItem({ abi, name: 'f', args })).toThrowError(
        AbiItemAmbiguityError,
      )
      expect(
        getAmbiguousTypes(abi[0]!.inputs, abi[1]!.inputs, args),
      ).toBeDefined()
    }
  })

  test('duplicate and canonically equivalent signatures remain selectable', () => {
    for (const type of ['uint', 'int']) {
      const alias = fn({ type: `${type}[][2][]` })
      const explicit = fn({ type: `${type}256[][2][]` })
      const expected = encodeFunctionData({
        abi: [explicit],
        functionName: 'f',
        args,
      })
      for (const abi of [
        [alias, explicit, explicit],
        [explicit, alias, alias],
      ]) {
        expect(encodeFunctionData({ abi, functionName: 'f', args })).toBe(
          expected,
        )
        expect(
          getAmbiguousTypes(alias.inputs, explicit.inputs, args),
        ).toBeUndefined()
      }
    }
  })

  test('nonempty elements and other arguments still select a unique overload', () => {
    for (const abi of [
      [numeric, textual],
      [textual, numeric],
    ]) {
      expect(getAbiItem({ abi, name: 'f', args: [[[1n, 2n]]] })).toBe(numeric)
      expect(getAbiItem({ abi, name: 'f', args: [[['a', 'b', 'c']]] })).toBe(
        textual,
      )
    }
    const one = { ...numeric, inputs: [...numeric.inputs, { type: 'bool' }] }
    const two = { ...textual, inputs: [...textual.inputs, { type: 'uint256' }] }
    for (const abi of [
      [one, two],
      [two, one],
    ]) {
      expect(getAbiItem({ abi, name: 'f', args: [[], true] })).toBe(one)
      expect(getAbiItem({ abi, name: 'f', args: [[], 1n] })).toBe(two)
    }
  })
})

describe('object tuples with reordered components', () => {
  const numericFirst = {
    type: 'function',
    name: 'f',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        components: [
          { name: 'a', type: 'uint256' },
          { name: 'b', type: 'bool' },
        ],
      },
    ],
    outputs: [{ type: 'uint256' }],
  } as const satisfies AbiFunction
  const booleanFirst = {
    ...numericFirst,
    inputs: [
      {
        type: 'tuple',
        components: [
          { name: 'b', type: 'bool' },
          { name: 'a', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ type: 'bool' }],
  } as const satisfies AbiFunction
  const args = [{ a: 2n, b: true }]
  const resultData = `0x${'0'.repeat(63)}1` as const
  const orders: readonly Abi[] = [
    [numericFirst, booleanFirst],
    [booleanFirst, numericFirst],
  ]

  test('rejects both matching selectors throughout the call pipeline in either ABI order', () => {
    // Object values are matched by name, so both layouts encode this value.
    // Reading it positionally during ambiguity detection used to miss that
    // they select different functions and encode the fields in reverse order.
    const numericData = encodeFunctionData({
      abi: [numericFirst],
      functionName: 'f',
      args,
    })
    const booleanData = encodeFunctionData({
      abi: [booleanFirst],
      functionName: 'f',
      args,
    })
    expect(numericData.slice(0, 10)).toBe('0xc5cba275')
    expect(booleanData.slice(0, 10)).toBe('0xdcab2784')
    expect(numericData.slice(10)).not.toBe(booleanData.slice(10))

    for (const abi of orders) {
      expect(() => getAbiItem({ abi, name: 'f', args })).toThrowError(
        AbiItemAmbiguityError,
      )
      expect(() =>
        encodeFunctionData({ abi, functionName: 'f', args }),
      ).toThrowError(AbiItemAmbiguityError)
      expect(() =>
        prepareEncodeFunctionData({ abi, functionName: 'f', args }),
      ).toThrowError(AbiItemAmbiguityError)
      expect(() =>
        decodeFunctionResult({
          abi,
          functionName: 'f',
          args,
          data: resultData,
        }),
      ).toThrowError(AbiItemAmbiguityError)
    }
  })

  test('an explicit selector preserves the chosen argument layout and return type', () => {
    for (const abi of orders)
      for (const [item, expectedResult] of [
        [numericFirst, 1n],
        [booleanFirst, true],
      ] as const) {
        const selector = toFunctionSelector(item)
        expect(getAbiItem({ abi, name: selector, args })).toBe(item)
        expect(encodeFunctionData({ abi, functionName: selector, args })).toBe(
          encodeFunctionData({ abi: [item], functionName: 'f', args }),
        )
        expect(
          prepareEncodeFunctionData({ abi, functionName: selector, args })
            .functionName,
        ).toBe(selector)
        expect(
          decodeFunctionResult({
            abi,
            functionName: selector,
            args,
            data: resultData,
          }),
        ).toBe(expectedResult)
      }
  })

  test('positional tuples still select the unique matching layout', () => {
    for (const abi of orders) {
      expect(getAbiItem({ abi, name: 'f', args: [[2n, true]] })).toBe(
        numericFirst,
      )
      expect(getAbiItem({ abi, name: 'f', args: [[true, 2n]] })).toBe(
        booleanFirst,
      )
    }
  })
})

// A primitive string must never "match" a tuple parameter: without the
// argType === 'object' guard, Object.values('ab') is ['a','b'] and each
// one-char string satisfies string components — stealing the overload from
// foo(string) and corrupting every downstream selector/decode.
const stringVsTupleAbi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 's', type: 'string' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'a', type: 'string' },
          { name: 'b', type: 'string' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'int256' }],
  },
]

test('a primitive string resolves the string overload, not the tuple', () => {
  const item = getAbiItem({
    abi: stringVsTupleAbi as unknown as Abi,
    name: 'foo',
    args: ['ab'],
  }) as unknown as { inputs: { type: string }[] }
  expect(item.inputs[0]!.type).toBe('string')

  expect(isArgOfType('ab', stringVsTupleAbi[1]!.inputs[0] as never)).toBe(false)
})

test('overload resolution flows through to the selector and result decode', () => {
  const prepared = prepareEncodeFunctionData({
    abi: stringVsTupleAbi as unknown as Abi,
    functionName: 'foo',
    args: ['ab'],
  } as never) as { functionName: string }
  // foo(string), not foo((string,string)) (0xdd0b43b6).
  expect(prepared.functionName).toBe('0xf31a6969')

  // uint256 outputs (string overload): the value stays a huge POSITIVE
  // number — the tuple overload's int256 would reinterpret it as negative.
  const data =
    '0x8000000000000000000000000000000000000000000000000000000000000005'
  const value = decodeFunctionResult({
    abi: stringVsTupleAbi as unknown as Abi,
    functionName: 'foo',
    args: ['ab'],
    data,
  } as never)
  expect(value).toBe(BigInt(data))
})

// F-7D2: `typeof null === 'object'`, so the tuple-branch guard must reject
// null explicitly — otherwise Object.values(null) throws a raw TypeError
// instead of the arg cleanly failing to match the tuple overload.
const nullVsTupleAbi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'a', type: 'uint256' },
          { name: 'b', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
]

test('a null arg does not crash the tuple overload branch', () => {
  expect(isArgOfType(null, nullVsTupleAbi[1]!.inputs[0] as never)).toBe(false)
  expect(
    getAbiItem({
      abi: nullVsTupleAbi as unknown as Abi,
      name: 'foo',
      args: [null],
    }),
  ).toBeUndefined()
})

// F-7D3: `trcToken` encodes to the same 32-byte word as `uint256`, so a
// number/bigint arg cannot pick between foo(uint256) and foo(trcToken) — the
// combination must throw AbiItemAmbiguityError, not silently resolve to the
// last structural match.
const intVsTrcTokenAbi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'trcToken' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
]

test('throws on an ambiguous uint256/trcToken overload', () => {
  expect(() =>
    getAbiItem({
      abi: intVsTrcTokenAbi as unknown as Abi,
      name: 'foo',
      args: [5n],
    }),
  ).toThrowError(AbiItemAmbiguityError)
  // unit level: the (integer, trcToken) pair is reported for a numeric arg…
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'uint256' }],
      [{ name: 'x', type: 'trcToken' }] as never,
      [5n],
    ),
  ).toEqual(['uint256', 'trcToken'])
  // …and so is any pair of differing integer widths (same word, different
  // selector — see the dedicated test below).
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'uint256' }],
      [{ name: 'x', type: 'uint64' }],
      [5n],
    ),
  ).toEqual(['uint256', 'uint64'])
})

// Every `(u)intN` encodes a number/bigint into the same left-padded 32-byte
// word, while the widths still produce DIFFERENT selectors — so a numeric arg
// cannot pick between foo(uint8) and foo(uint256), and letting the last
// structural match win silently calls a different function.
const intWidthAbi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'uint8' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi

test('throws on an ambiguous integer-width overload', () => {
  expect(() =>
    getAbiItem({ abi: intWidthAbi, name: 'foo', args: [1n] }),
  ).toThrowError(AbiItemAmbiguityError)
  // Signedness is a width difference too.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'int256' }],
      [{ name: 'x', type: 'uint256' }],
      [5],
    ),
  ).toEqual(['int256', 'uint256'])
  // A bare `uint` is canonically uint256 (normalizeSignature widens it for
  // the selector), so the overloads are the same function — not ambiguous.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'uint' }],
      [{ name: 'x', type: 'uint256' }],
      [5n],
    ),
  ).toBeUndefined()
  // Identical widths settle nothing at this position; other positions decide.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'uint256' }],
      [{ name: 'x', type: 'uint256' }],
      [5n],
    ),
  ).toBeUndefined()
  // A non-numeric arg never hits the integer rule.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'uint8' }],
      [{ name: 'x', type: 'uint256' }],
      ['5'],
    ),
  ).toBeUndefined()
})

// Every `bytes`/`bytesN` accepts the same string / Uint8Array arguments while
// differing widths still produce DIFFERENT selectors — so such an arg cannot
// pick between foo(bytes20) and foo(bytes32), and letting the last structural
// match win silently calls a different function.
const bytesWidthAbi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'bytes20' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi

test('throws on an ambiguous bytes-width overload', () => {
  expect(() =>
    getAbiItem({ abi: bytesWidthAbi, name: 'foo', args: ['0xdead'] }),
  ).toThrowError(AbiItemAmbiguityError)
  // A Uint8Array arg matches every bytes width just the same.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'bytes20' }],
      [{ name: 'x', type: 'bytes32' }],
      [new Uint8Array([1, 2, 3])],
    ),
  ).toEqual(['bytes20', 'bytes32'])
  // Dynamic `bytes` versus a fixed width is a differing pair too.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'bytes' }],
      [{ name: 'x', type: 'bytes32' }],
      ['0xdead'],
    ),
  ).toEqual(['bytes', 'bytes32'])
  // Identical widths settle nothing at this position.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'bytes32' }],
      [{ name: 'x', type: 'bytes32' }],
      ['0xdead'],
    ),
  ).toBeUndefined()
  // An undefined scalar argument matches neither type. Empty arrays are
  // handled as actual array values rather than probing an undefined scalar.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'bytes20' }],
      [{ name: 'x', type: 'bytes32' }],
      [undefined],
    ),
  ).toBeUndefined()
})

// `string` overlaps the bytes family the same way: a string arg matches
// foo(string) and foo(bytes) alike, and the selectors differ.
const stringVsBytesAbi = [
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'foo',
    inputs: [{ name: 'x', type: 'bytes' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi

test('throws on an ambiguous string/bytes overload', () => {
  expect(() =>
    getAbiItem({ abi: stringVsBytesAbi, name: 'foo', args: ['hello'] }),
  ).toThrowError(AbiItemAmbiguityError)
  // Fixed widths overlap with string the same way.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'string' }],
      [{ name: 'x', type: 'bytes32' }],
      ['hello'],
    ),
  ).toEqual(['string', 'bytes32'])
  // A Uint8Array can only be bytes, never a string — not ambiguous.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'string' }],
      [{ name: 'x', type: 'bytes' }],
      [new Uint8Array([1])],
    ),
  ).toBeUndefined()
})

// Two overloads whose tuples differ only in component count. `isArgOfType`'s
// tuple branch checked that every declared component had a value but never
// that the counts matched, so a 2-value arg "matched" the 1-component overload
// too. Both then reached `getAmbiguousTypes`, whose tuple recursion compares
// component lists of unequal length.
const tupleArityAbi = [
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [{ name: 'x', type: 'uint256' }],
      },
    ],
  },
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'y', type: 'uint256' },
        ],
      },
    ],
  },
]
const [tupleArity1, tupleArity2] = tupleArityAbi

/** `foo((uint256,uint256))` / `foo((uint256))` calldata for the args below. */
const twoComponentCalldata = `0xe8f26a69${'0'.repeat(63)}1${'0'.repeat(63)}2`

test('an arg with more values than a tuple has components does not match it', () => {
  expect(isArgOfType([1n, 2n], tupleArity1!.inputs[0] as never)).toBe(false)
  expect(isArgOfType([1n, 2n], tupleArity2!.inputs[0] as never)).toBe(true)
  expect(isArgOfType([1n], tupleArity1!.inputs[0] as never)).toBe(true)
})

test('tuple overloads of different arity resolve by arity, in either ABI order', () => {
  for (const abi of [
    [tupleArity1, tupleArity2],
    [tupleArity2, tupleArity1],
  ]) {
    // Previously: the first order threw a raw TypeError from getAmbiguousTypes,
    // and the second silently encoded foo((uint256)), dropping `2n`.
    expect(
      encodeFunctionData({
        abi: abi as unknown as Abi,
        functionName: 'foo',
        args: [[1n, 2n]],
      } as never),
    ).toBe(twoComponentCalldata)
  }
})

describe('array-form tuples with metadata', () => {
  const fn = (...inputs: AbiParameter[]): AbiFunction => ({
    type: 'function',
    name: 'f',
    inputs,
    outputs: [],
    stateMutability: 'nonpayable',
  })
  const numericTuple: AbiParameter = {
    type: 'tuple',
    components: [{ type: 'uint256' }],
  }

  test('metadata does not count as a component or satisfy a longer tuple', () => {
    const arg = Object.assign([1n], { metadata: 2n })
    expect(isArgOfType(arg, tupleArity1!.inputs[0] as never)).toBe(true)
    expect(isArgOfType(arg, tupleArity2!.inputs[0] as never)).toBe(false)
    expect(
      isArgOfType(Object.assign([1n, 2n], { metadata: true }), numericTuple),
    ).toBe(false)
  })

  test('both ABI orders reject an ambiguous call with metadata', () => {
    const narrow = fn(numericTuple, { type: 'uint8' })
    const wide = fn(numericTuple, { type: 'uint256' })
    const args = [Object.assign([1n], { metadata: true }), 1n]
    for (const item of [narrow, wide])
      expect(encodeFunctionData({ abi: [item], functionName: 'f', args })).toBe(
        encodeFunctionData({
          abi: [item],
          functionName: 'f',
          args: [[1n], 1n],
        }),
      )
    for (const abi of [
      [narrow, wide],
      [wide, narrow],
    ]) {
      expect(() => getAbiItem({ abi, name: 'f', args })).toThrowError(
        AbiItemAmbiguityError,
      )
      expect(() =>
        encodeFunctionData({ abi, functionName: 'f', args }),
      ).toThrowError(AbiItemAmbiguityError)
    }
  })

  test.each([
    'tuple',
    'tuple[]',
    'nested tuple',
  ])('metadata preserves unique overload resolution in a %s', (shape) => {
    const wrap = (type: string): AbiParameter => {
      const tuple: AbiParameter = { type: 'tuple', components: [{ type }] }
      if (shape === 'tuple[]') return { ...tuple, type: 'tuple[]' }
      if (shape === 'nested tuple')
        return { type: 'tuple', components: [tuple] }
      return tuple
    }
    const numeric = fn(wrap('uint256'))
    const textual = fn(wrap('string'))
    const tuple = Object.assign([1n], { metadata: true })
    const arg = shape === 'tuple' ? tuple : [tuple]
    const expected = encodeFunctionData({
      abi: [numeric],
      functionName: 'f',
      args: [arg],
    })
    for (const abi of [
      [numeric, textual],
      [textual, numeric],
    ]) {
      expect(getAbiItem({ abi, name: 'f', args: [arg] })).toBe(numeric)
      expect(encodeFunctionData({ abi, functionName: 'f', args: [arg] })).toBe(
        expected,
      )
    }
  })
})

test('getAmbiguousTypes treats component lists of different length as unambiguous', () => {
  expect(
    getAmbiguousTypes(
      tupleArity2!.inputs as never,
      tupleArity1!.inputs as never,
      [[1n, 2n]],
    ),
  ).toBeUndefined()
})

// An unambiguous tuple parameter must not mask ambiguity in the parameters
// after it. The tuple branch in `getAmbiguousTypes` returned the recursion's
// result unconditionally, so an identical tuple in first position made the
// whole comparison "unambiguous" — foo((uint256),address) vs
// foo((uint256),string) silently resolved instead of throwing.
const tupleThenAmbiguousAbi = [
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [{ name: 'x', type: 'uint256' }],
      },
      { name: 'to', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [{ name: 'x', type: 'uint256' }],
      },
      { name: 'to', type: 'string' },
    ],
  },
]

test('an unambiguous tuple does not mask ambiguity in later parameters', () => {
  expect(
    getAmbiguousTypes(
      tupleThenAmbiguousAbi[0]!.inputs as never,
      tupleThenAmbiguousAbi[1]!.inputs as never,
      [[1n], 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'],
    ),
  ).toEqual(['address', 'string'])
  expect(() =>
    getAbiItem({
      abi: tupleThenAmbiguousAbi as unknown as Abi,
      name: 'foo',
      args: [[1n], 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'],
    }),
  ).toThrowError(AbiItemAmbiguityError)
})

// getAmbiguousTypes compared array types as opaque strings: `['address[]',
// 'string[]']` matches no pair rule, so foo(address[]) vs foo(string[]) with
// address-like elements silently resolved instead of throwing — the rules
// never saw the element types. Arrays must recurse element-wise, like tuples
// recurse component-wise.
const arrayAmbiguityAbi = [
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [{ name: 'xs', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [{ name: 'xs', type: 'string[]' }],
  },
]

test('throws on an ambiguous address[]/string[] overload for address-like elements', () => {
  expect(() =>
    getAbiItem({
      abi: arrayAmbiguityAbi as unknown as Abi,
      name: 'foo',
      args: [['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC']],
    }),
  ).toThrowError(AbiItemAmbiguityError)
  // A non-address string only matches string[], so the set stays resolvable.
  expect(() =>
    getAbiItem({
      abi: arrayAmbiguityAbi as unknown as Abi,
      name: 'foo',
      args: [['just a string']],
    }),
  ).not.toThrow()
})

test('getAmbiguousTypes recurses into array element types', () => {
  const addr = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'address[]' }],
      [{ name: 'xs', type: 'string[]' }],
      [[addr]],
    ),
  ).toEqual(['address', 'string'])
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'address[]' }],
      [{ name: 'xs', type: 'string[]' }],
      [['just a string']],
    ),
  ).toBeUndefined()
  // TRON: trcToken[] elements encode identically to uint256[] ones.
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'uint256[]' }],
      [{ name: 'xs', type: 'trcToken[]' }] as never,
      [[5n]],
    ),
  ).toEqual(['uint256', 'trcToken'])
  // Fixed-size arrays recurse the same way.
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'address[2]' }],
      [{ name: 'xs', type: 'bytes20[2]' }] as never,
      [[addr, addr]],
    ),
  ).toEqual(['address', 'bytes20'])
  // Nested arrays strip one level per recursion, so T[][] reaches T — an
  // implementation stripping a single level would stop at 'address[]' vs
  // 'string[]' and miss this.
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'address[][]' }],
      [{ name: 'xs', type: 'string[][]' }],
      [[[addr]]],
    ),
  ).toEqual(['address', 'string'])
  // An unambiguous array must not mask ambiguity in later parameters.
  expect(
    getAmbiguousTypes(
      [
        { name: 'xs', type: 'uint256[]' },
        { name: 'to', type: 'address' },
      ],
      [
        { name: 'xs', type: 'uint256[]' },
        { name: 'to', type: 'bytes20' },
      ] as never,
      [[1n], addr],
    ),
  ).toEqual(['address', 'bytes20'])
})

test('an empty array reports differing declared array types as ambiguous', () => {
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'address[]' }],
      [{ name: 'xs', type: 'bytes20[]' }] as never,
      [[]],
    ),
  ).toEqual(['address[]', 'bytes20[]'])
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'address[]' }],
      [{ name: 'xs', type: 'string[]' }],
      [[]],
    ),
  ).toEqual(['address[]', 'string[]'])
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'uint256[]' }],
      [{ name: 'xs', type: 'trcToken[]' }] as never,
      [[]],
    ),
  ).toEqual(['uint256[]', 'trcToken[]'])
})

test('tuple arrays recurse into components per element', () => {
  const sourceInputs = [
    {
      name: 'ts',
      type: 'tuple[]',
      components: [{ name: 'a', type: 'address' }],
    },
  ]
  const targetInputs = [
    {
      name: 'ts',
      type: 'tuple[]',
      components: [{ name: 'a', type: 'string' }],
    },
  ]
  expect(
    getAmbiguousTypes(sourceInputs as never, targetInputs as never, [
      [['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC']],
    ]),
  ).toEqual(['address', 'string'])
  // An empty tuple[] cannot distinguish different component types.
  expect(
    getAmbiguousTypes(sourceInputs as never, targetInputs as never, [[]]),
  ).toEqual(['(address)[]', '(string)[]'])
})

// isArgOfType's array detection regex ([a-z]+[1-9]{0,3}) rejected element
// widths containing a 0 digit — uint160[], bytes20[] — so such args never
// structurally matched and getAbiItem fell back to the first overload. And a
// fixed-size array never checked its length, so two values "matched"
// address[3].
test('isArgOfType accepts widths containing 0 and enforces fixed array length', () => {
  expect(isArgOfType([1n], { type: 'uint160[]' })).toBe(true)
  expect(
    isArgOfType(['0x2b5ad5c4795c026514f8317c7a215e218dccd6cf'], {
      type: 'bytes20[]',
    }),
  ).toBe(true)
  expect(isArgOfType([1n, 2n], { type: 'uint256[3]' })).toBe(false)
  expect(isArgOfType([1n, 2n, 3n], { type: 'uint256[3]' })).toBe(true)
  // Multi-dimensional: every level enforces its own length.
  expect(
    isArgOfType(
      [
        [1n, 2n],
        [3n, 4n],
        [5n, 6n],
      ],
      { type: 'uint256[2][3]' },
    ),
  ).toBe(true)
  expect(
    isArgOfType([[1n], [3n, 4n], [5n, 6n]], { type: 'uint256[2][3]' }),
  ).toBe(false)
})

test('a uint160[] arg resolves its overload instead of falling back', () => {
  const abi = [
    {
      type: 'function',
      name: 'foo',
      stateMutability: 'nonpayable',
      outputs: [],
      inputs: [{ name: 'x', type: 'bool' }],
    },
    {
      type: 'function',
      name: 'foo',
      stateMutability: 'nonpayable',
      outputs: [],
      inputs: [{ name: 'xs', type: 'uint160[]' }],
    },
  ]
  const item = getAbiItem({
    abi: abi as unknown as Abi,
    name: 'foo',
    args: [[1n]],
  })
  expect(
    (item as unknown as { inputs: readonly { type: string }[] }).inputs[0]!
      .type,
  ).toBe('uint160[]')
})

test('fixed-size array overloads resolve by length, in either ABI order', () => {
  const two = {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [{ name: 'xs', type: 'address[2]' }],
  }
  const three = {
    ...two,
    inputs: [{ name: 'xs', type: 'address[3]' }],
  }
  const addr = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  for (const abi of [
    [two, three],
    [three, two],
  ]) {
    const item = getAbiItem({
      abi: abi as unknown as Abi,
      name: 'foo',
      args: [[addr, addr, addr]],
    })
    expect(
      (item as unknown as { inputs: readonly { type: string }[] }).inputs[0]!
        .type,
    ).toBe('address[3]')
  }
})

// isArgOfType matched object tuple args positionally via Object.values (key
// insertion order), but encodeTuple consumes them by component name — so a
// swapped-key object failed to match its overload even though it encodes
// fine, while an object with the right value order under wrong key names
// "matched" and only blew up at encode time.
const namedTupleParam = {
  name: 't',
  type: 'tuple',
  components: [
    { name: 'x', type: 'uint256' },
    { name: 'to', type: 'address' },
  ],
}

test('object tuple args match by component name, not key order', () => {
  const addr = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  expect(isArgOfType({ to: addr, x: 1n }, namedTupleParam as never)).toBe(true)
  expect(isArgOfType({ x: 1n, to: addr }, namedTupleParam as never)).toBe(true)
  // The right value order under wrong names is NOT a match — encoding would
  // look the names up and fail.
  expect(isArgOfType({ foo: 1n, bar: addr }, namedTupleParam as never)).toBe(
    false,
  )
  // Arity applies to objects too: extra keys must not match, or encodeTuple
  // throws AbiEncodingLengthMismatchError after resolution "succeeded".
  expect(
    isArgOfType({ x: 1n, to: addr, junk: 1 }, namedTupleParam as never),
  ).toBe(false)
  // Positional arrays keep working.
  expect(isArgOfType([1n, addr], namedTupleParam as never)).toBe(true)
})

test('a swapped-key object still resolves the tuple overload', () => {
  const abi = [
    {
      type: 'function',
      name: 'foo',
      stateMutability: 'nonpayable',
      outputs: [],
      inputs: [{ name: 's', type: 'string' }],
    },
    {
      type: 'function',
      name: 'foo',
      stateMutability: 'nonpayable',
      outputs: [],
      inputs: [namedTupleParam],
    },
  ]
  const addr = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  const item = getAbiItem({
    abi: abi as unknown as Abi,
    name: 'foo',
    args: [{ to: addr, x: 1n }],
  })
  expect(
    (item as unknown as { inputs: readonly { type: string }[] }).inputs[0]!
      .type,
  ).toBe('tuple')
  // Both key orders produce identical calldata end-to-end.
  const swapped = encodeFunctionData({
    abi: abi as unknown as Abi,
    functionName: 'foo',
    args: [{ to: addr, x: 1n }],
  } as never)
  const ordered = encodeFunctionData({
    abi: abi as unknown as Abi,
    functionName: 'foo',
    args: [{ x: 1n, to: addr }],
  } as never)
  expect(swapped).toBe(ordered)
})

// With bytes20[] matchable, the address[]/bytes20[] pair is reachable
// end-to-end — and like its scalar counterpart it must throw.
test('throws on an ambiguous address[]/bytes20[] overload', () => {
  const abi = [
    {
      type: 'function',
      name: 'foo',
      stateMutability: 'nonpayable',
      outputs: [],
      inputs: [{ name: 'xs', type: 'address[]' }],
    },
    {
      type: 'function',
      name: 'foo',
      stateMutability: 'nonpayable',
      outputs: [],
      inputs: [{ name: 'xs', type: 'bytes20[]' }],
    },
  ]
  expect(() =>
    getAbiItem({
      abi: abi as unknown as Abi,
      name: 'foo',
      args: [['0x2b5ad5c4795c026514f8317c7a215e218dccd6cf']],
    }),
  ).toThrowError(AbiItemAmbiguityError)
})

// `address` is TRON-aware: it accepts the 21-byte `41…` form as well as the
// 20-byte EVM one, while every `bytesN` accepts any hex string. So `bytes21`
// overlaps `address` here exactly the way `bytes20` does on the EVM — a
// `0x41…` arg encodes under either overload, to a different selector AND a
// different word layout (right-padded bytes vs a left-padded address), and
// letting the last structural match win picks between them by ABI order.
const addressVsBytes21Abi = [
  {
    type: 'function',
    name: 'set',
    inputs: [{ name: 'x', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'set',
    inputs: [{ name: 'x', type: 'bytes21' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi

test('throws on an ambiguous address/bytes21 overload, in either ABI order', () => {
  const tronHex = '0x41e1ab8145f7e55dc933d51a18c793f901a3a0b276'
  for (const abi of [
    addressVsBytes21Abi,
    [...addressVsBytes21Abi].reverse(),
  ] as Abi[])
    expect(() =>
      encodeFunctionData({ abi, functionName: 'set', args: [tronHex] }),
    ).toThrowError(AbiItemAmbiguityError)

  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'address' }],
      [{ name: 'x', type: 'bytes21' }] as never,
      [tronHex],
    ),
  ).toEqual(['address', 'bytes21'])
  // Like address/bytes20: an empty array matches both
  // overloads and encodes identically under each — only the selector differs.
  expect(
    getAmbiguousTypes(
      [{ name: 'xs', type: 'address[]' }],
      [{ name: 'xs', type: 'bytes21[]' }] as never,
      [[]],
    ),
  ).toEqual(['address[]', 'bytes21[]'])
  // Structural matching accepts strings for every bytes width. A width
  // check at encoding time must not make ABI order select a different call.
  expect(
    getAmbiguousTypes(
      [{ name: 'x', type: 'address' }],
      [{ name: 'x', type: 'bytes32' }] as never,
      [tronHex],
    ),
  ).toEqual(['address', 'bytes32'])
})

test('a tuple whose own components are ambiguous still reports the inner pair', () => {
  expect(
    getAmbiguousTypes(
      [
        {
          name: 't',
          type: 'tuple',
          components: [{ name: 'a', type: 'address' }],
        },
      ] as never,
      [
        {
          name: 't',
          type: 'tuple',
          components: [{ name: 'a', type: 'string' }],
        },
      ] as never,
      [['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC']],
    ),
  ).toEqual(['address', 'string'])
})

// `isArgOfType` matches an object tuple arg by component name, but
// `getAmbiguousTypes` indexed the same arg positionally — and an object has no
// '0'/'1' keys, so every arg-dependent rule (address/string, address/bytes,
// trcToken/intN) saw `undefined` and no object-form tuple was ever flagged.
// The array form of the identical call already threw, so the two shapes
// disagreed on whether the very same overload set was ambiguous.
const objectTupleAbi = [
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'to', type: 'address' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'foo',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'x', type: 'uint256' },
          { name: 'to', type: 'string' },
        ],
      },
    ],
  },
]

test('an object-form tuple arg is read by component name when detecting ambiguity', () => {
  const addr = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  const source = objectTupleAbi[0]!.inputs as never
  const target = objectTupleAbi[1]!.inputs as never

  // Array form — the pre-existing baseline this must agree with.
  expect(getAmbiguousTypes(source, target, [[1n, addr]])).toEqual([
    'address',
    'string',
  ])
  // Object form, in declaration order and reversed: key order is irrelevant.
  expect(getAmbiguousTypes(source, target, [{ x: 1n, to: addr }])).toEqual([
    'address',
    'string',
  ])
  expect(getAmbiguousTypes(source, target, [{ to: addr, x: 1n }])).toEqual([
    'address',
    'string',
  ])
  // A non-address string leaves nothing for the arg-dependent rule to fire on.
  expect(
    getAmbiguousTypes(source, target, [{ x: 1n, to: 'just a string' }]),
  ).toBeUndefined()
})

test('getAbiItem throws on an ambiguous object-form tuple arg, like the array form', () => {
  const addr = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  for (const args of [
    [[1n, addr]],
    [{ x: 1n, to: addr }],
    [{ to: addr, x: 1n }],
  ]) {
    expect(() =>
      getAbiItem({ abi: objectTupleAbi as unknown as Abi, name: 'foo', args }),
    ).toThrowError(AbiItemAmbiguityError)
  }
})

test('object-form tuples are read by name when nested and inside arrays', () => {
  const addr = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  const nested = (inner: string) =>
    [
      {
        name: 'outer',
        type: 'tuple',
        components: [
          {
            name: 'inner',
            type: 'tuple',
            components: [{ name: 'a', type: inner }],
          },
        ],
      },
    ] as never
  // Nested object tuples recurse by name at every level.
  expect(
    getAmbiguousTypes(nested('address'), nested('string'), [
      { inner: { a: addr } },
    ]),
  ).toEqual(['address', 'string'])

  // tuple[] with object elements: the array branch hands each element to the
  // tuple branch, which must read it by name too.
  const tupleArray = (inner: string) =>
    [
      {
        name: 'ts',
        type: 'tuple[]',
        components: [{ name: 'a', type: inner }],
      },
    ] as never
  expect(
    getAmbiguousTypes(tupleArray('address'), tupleArray('string'), [
      [{ a: addr }],
    ]),
  ).toEqual(['address', 'string'])
})

// Overloads that differ only in array / tuple shape: `T[]` and `T[k]` both
// accept `k` elements, and a tuple and an array both accept an array-form
// value. Such a call names no single overload, in either ABI order.
describe('overloads differing in array / tuple shape', () => {
  const A = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
  const B = 'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K'

  type Input = { name?: string; type: string; components?: readonly Input[] }
  const fn = (...inputs: Input[]) => ({
    type: 'function',
    name: 'f',
    stateMutability: 'nonpayable',
    outputs: [],
    inputs,
  })
  type Fn = ReturnType<typeof fn>
  const tuple = (...components: Input[]): Input => ({
    name: 't',
    type: 'tuple',
    components,
  })
  const uintPairComponents: Input[] = [
    { name: 'a', type: 'uint256' },
    { name: 'b', type: 'uint256' },
  ]
  const uintPair = tuple(...uintPairComponents)

  /** Every order of `items`. */
  const permutations = (items: readonly Fn[]): Fn[][] =>
    items.length <= 1
      ? [[...items]]
      : items.flatMap((item, index) =>
          permutations(items.filter((_, i) => i !== index)).map((rest) => [
            item,
            ...rest,
          ]),
        )
  /** The signature `args` resolve to among `items`. */
  const resolve = (items: readonly Fn[], args: readonly unknown[]) =>
    formatAbiItem(
      getAbiItem({ abi: items as unknown as Abi, name: 'f', args }) as never,
    )
  /** The error `fn` throws, or `undefined` when it returns. */
  const thrown = (run: () => unknown): unknown => {
    try {
      run()
    } catch (error) {
      return error
    }
    return undefined
  }
  /** Asserts `args` are ambiguous among `items` in every ABI order. */
  const expectAmbiguous = (
    items: readonly Fn[],
    args: readonly unknown[],
    types?: readonly [string, string],
  ) => {
    for (const abi of permutations(items)) {
      const error = thrown(() => resolve(abi, args))
      expect(error).toBeInstanceOf(AbiItemAmbiguityError)
      for (const type of types ?? [])
        expect((error as AbiItemAmbiguityError).message).toContain(
          `\`${type}\` in \`f(`,
        )
    }
  }
  /** Asserts `args` resolve to `signature` among `items` in every ABI order. */
  const expectResolved = (
    items: readonly Fn[],
    args: readonly unknown[],
    signature: string,
  ) => {
    for (const abi of permutations(items))
      expect(resolve(abi, args)).toBe(signature)
  }

  describe('T[] and T[k]', () => {
    const dynamic = fn(
      { name: 'xs', type: 'address[]' },
      { name: 'n', type: 'uint256' },
    )
    const fixed = fn(
      { name: 'xs', type: 'address[2]' },
      { name: 'n', type: 'uint256' },
    )

    test('k elements are ambiguous, in either ABI order', () => {
      expectAmbiguous(
        [dynamic, fixed],
        [[A, B], 1n],
        ['address[]', 'address[2]'],
      )
    })

    test('the error names both overloads and both types', () => {
      const error = thrown(() => resolve([dynamic, fixed], [[A, B], 1n]))
      expect((error as Error).message).toContain(
        '`address[2]` in `f(address[2],uint256)`, and',
      )
      expect((error as Error).message).toContain(
        '`address[]` in `f(address[],uint256)`',
      )
    })

    test('another element count only fits T[]', () => {
      expectResolved([dynamic, fixed], [[A, B, A], 1n], 'f(address[],uint256)')
      expectResolved([dynamic, fixed], [[A], 1n], 'f(address[],uint256)')
      expectResolved([dynamic, fixed], [[], 1n], 'f(address[],uint256)')
    })

    test('getAmbiguousTypes reports the pair in the order given', () => {
      const args = [[A, B], 1n]
      expect(
        getAmbiguousTypes(dynamic.inputs as never, fixed.inputs as never, args),
      ).toEqual(['address[]', 'address[2]'])
      expect(
        getAmbiguousTypes(fixed.inputs as never, dynamic.inputs as never, args),
      ).toEqual(['address[2]', 'address[]'])
      // A value only one of the two accepts settles the position.
      expect(
        getAmbiguousTypes(dynamic.inputs as never, fixed.inputs as never, [
          [A, B, A],
          1n,
        ]),
      ).toBeUndefined()
    })

    test('in a later parameter position', () => {
      const items = [
        fn({ name: 'n', type: 'uint256' }, { name: 'xs', type: 'bool[]' }),
        fn({ name: 'n', type: 'uint256' }, { name: 'xs', type: 'bool[3]' }),
      ]
      expectAmbiguous(items, [1n, [true, false, true]], ['bool[]', 'bool[3]'])
      expectResolved(items, [1n, [true, false]], 'f(uint256,bool[])')
    })

    test('element types that cannot both accept the values are not ambiguous', () => {
      const items = [
        fn({ name: 'xs', type: 'address[]' }),
        fn({ name: 'xs', type: 'uint256[2]' }),
      ]
      expectResolved(items, [[1n, 2n]], 'f(uint256[2])')
      expectResolved(items, [[A, B]], 'f(address[])')
    })

    test('an element-type ambiguity is still reported as the element pair', () => {
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'uint8[]' }),
          fn({ name: 'xs', type: 'uint256[2]' }),
        ],
        [[1n, 2n]],
        ['uint8', 'uint256'],
      )
    })

    test('overloads with different parameter counts are not ambiguous', () => {
      const items = [fn({ name: 'xs', type: 'address[]' }), fixed]
      expectResolved(items, [[A, B]], 'f(address[])')
      expectResolved(items, [[A, B], 1n], 'f(address[2],uint256)')
    })
  })

  describe('a tuple and T[k]', () => {
    const tupleItem = fn(uintPair)
    const fixed = fn({ name: 'xs', type: 'uint256[2]' })

    test('an array-form value is ambiguous, in either ABI order', () => {
      expectAmbiguous(
        [tupleItem, fixed],
        [[1n, 2n]],
        ['(uint256,uint256)', 'uint256[2]'],
      )
    })

    test('an object-form value only fits the tuple', () => {
      expectResolved(
        [tupleItem, fixed],
        [{ a: 1n, b: 2n }],
        'f((uint256,uint256))',
      )
      expect(
        getAmbiguousTypes(tupleItem.inputs as never, fixed.inputs as never, [
          { a: 1n, b: 2n },
        ]),
      ).toBeUndefined()
    })

    test('components of different types are ambiguous when the elements fit both', () => {
      const mixed = fn(
        tuple({ name: 'a', type: 'uint256' }, { name: 'b', type: 'uint8' }),
      )
      expectAmbiguous(
        [mixed, fixed],
        [[1n, 2n]],
        ['(uint256,uint8)', 'uint256[2]'],
      )
    })

    test('components the elements cannot all fit are not ambiguous', () => {
      const mixed = fn(
        tuple({ name: 'a', type: 'uint256' }, { name: 'to', type: 'address' }),
      )
      expectResolved([mixed, fixed], [[1n, A]], 'f((uint256,address))')
      expectResolved([mixed, fixed], [[1n, 2n]], 'f(uint256[2])')
    })

    test('a different component count is not ambiguous', () => {
      const triple = fn(
        tuple(
          { name: 'a', type: 'uint256' },
          { name: 'b', type: 'uint256' },
          { name: 'c', type: 'uint256' },
        ),
      )
      expectResolved([triple, fixed], [[1n, 2n]], 'f(uint256[2])')
      expectResolved(
        [triple, fixed],
        [[1n, 2n, 3n]],
        'f((uint256,uint256,uint256))',
      )
    })
  })

  describe('a tuple and T[]', () => {
    const tupleItem = fn(uintPair)
    const dynamic = fn({ name: 'xs', type: 'uint256[]' })

    test('an array-form value is ambiguous, in either ABI order', () => {
      expectAmbiguous(
        [tupleItem, dynamic],
        [[1n, 2n]],
        ['(uint256,uint256)', 'uint256[]'],
      )
    })

    test('another element count only fits T[]', () => {
      expectResolved([tupleItem, dynamic], [[1n, 2n, 3n]], 'f(uint256[])')
      expectResolved([tupleItem, dynamic], [[]], 'f(uint256[])')
    })

    test('an object-form value only fits the tuple', () => {
      expectResolved(
        [tupleItem, dynamic],
        [{ b: 2n, a: 1n }],
        'f((uint256,uint256))',
      )
    })
  })

  describe('nested', () => {
    test('an inner array dimension', () => {
      const items = [
        fn({ name: 'xs', type: 'address[][]' }),
        fn({ name: 'xs', type: 'address[2][]' }),
      ]
      expectAmbiguous(items, [[[A, B]]], ['address[]', 'address[2]'])
      expectAmbiguous(items, [
        [
          [A, B],
          [B, A],
        ],
      ])
      // One inner array of another length only fits the dynamic dimension.
      expectResolved(items, [[[A, B], [A]]], 'f(address[][])')
      expectResolved(items, [[[A, B, A]]], 'f(address[][])')
    })

    test('an outer array dimension', () => {
      const items = [
        fn({ name: 'xs', type: 'address[][]' }),
        fn({ name: 'xs', type: 'address[][2]' }),
      ]
      expectAmbiguous(items, [[[A], [A, B]]], ['address[][]', 'address[][2]'])
      expectResolved(items, [[[A]]], 'f(address[][])')
    })

    test('inside a tuple component, for array-form and object-form tuples', () => {
      const items = [
        fn(
          tuple(
            { name: 'xs', type: 'address[]' },
            { name: 'n', type: 'uint256' },
          ),
        ),
        fn(
          tuple(
            { name: 'xs', type: 'address[2]' },
            { name: 'n', type: 'uint256' },
          ),
        ),
      ]
      expectAmbiguous(items, [[[A, B], 1n]], ['address[]', 'address[2]'])
      expectAmbiguous(
        items,
        [{ xs: [A, B], n: 1n }],
        ['address[]', 'address[2]'],
      )
      expectAmbiguous(items, [{ n: 1n, xs: [A, B] }])
      expectResolved(
        items,
        [{ xs: [A, B, A], n: 1n }],
        'f((address[],uint256))',
      )
    })

    test('a tuple component against an array component', () => {
      const items = [
        fn(tuple({ ...uintPair, name: 'p' }, { name: 'n', type: 'uint256' })),
        fn(
          tuple(
            { name: 'p', type: 'uint256[2]' },
            { name: 'n', type: 'uint256' },
          ),
        ),
      ]
      expectAmbiguous(
        items,
        [{ p: [1n, 2n], n: 3n }],
        ['(uint256,uint256)', 'uint256[2]'],
      )
      expectAmbiguous(items, [[[1n, 2n], 3n]])
      expectResolved(
        items,
        [{ p: { a: 1n, b: 2n }, n: 3n }],
        'f(((uint256,uint256),uint256))',
      )
    })

    test('tuple arrays of different length', () => {
      const element = [{ name: 'a', type: 'uint256' }]
      const items = [
        fn({ name: 'ts', type: 'tuple[]', components: element }),
        fn({ name: 'ts', type: 'tuple[2]', components: element }),
      ]
      expectAmbiguous(
        items,
        [[{ a: 1n }, { a: 2n }]],
        ['(uint256)[]', '(uint256)[2]'],
      )
      expectAmbiguous(items, [[[1n], [2n]]])
      expectResolved(items, [[{ a: 1n }]], 'f((uint256)[])')
    })

    test('an array of tuples against an array of arrays', () => {
      const items = [
        fn({
          name: 'ts',
          type: 'tuple[]',
          components: uintPairComponents,
        }),
        fn({ name: 'xs', type: 'uint256[2][]' }),
      ]
      expectAmbiguous(items, [[[1n, 2n]]], ['(uint256,uint256)', 'uint256[2]'])
      // Object-form elements only fit the tuple array.
      expectResolved(items, [[{ a: 1n, b: 2n }]], 'f((uint256,uint256)[])')
    })

    test('an empty outer array carries no element: differing inner shapes are ambiguous', () => {
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'address[][]' }),
          fn({ name: 'xs', type: 'address[2][]' }),
        ],
        [[]],
        ['address[][]', 'address[2][]'],
      )
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'address[2][]' }),
          fn({ name: 'xs', type: 'address[3][]' }),
        ],
        [[]],
        ['address[2][]', 'address[3][]'],
      )
      expectAmbiguous(
        [
          fn({
            name: 'ts',
            type: 'tuple[]',
            components: uintPairComponents,
          }),
          fn({ name: 'xs', type: 'uint256[2][]' }),
        ],
        [[]],
        ['(uint256,uint256)[]', 'uint256[2][]'],
      )
    })
  })

  describe('the scalar types under the two shapes', () => {
    const hexA = '0x1111111111111111111111111111111111111111'
    const addressPair = tuple(
      { name: 'a', type: 'address' },
      { name: 'b', type: 'address' },
    )
    test('all structural matches with different selectors are ambiguous', () => {
      const dynamic = fn({ name: 'xs', type: 'address[]' })
      const words = fn({ name: 'xs', type: 'bytes32[2]' })
      expectAmbiguous([dynamic, words], [[hexA, B]])
      expectAmbiguous([fn(addressPair), words], [[hexA, B]])
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'address[][]' }),
          fn({
            name: 'ts',
            type: 'tuple[]',
            components: [
              { name: 'a', type: 'bytes32' },
              { name: 'b', type: 'bytes32' },
            ],
          }),
        ],
        [[[hexA, B]]],
      )
      // As for the same pair of element types under one shape.
      expectAmbiguous(
        [fn({ name: 'xs', type: 'address[2]' }), words],
        [[hexA, B]],
      )

      // The caller can explicitly select the address overload.
      expect(
        encodeFunctionData({
          abi: [words, dynamic] as unknown as Abi,
          functionName: toFunctionSelector('f(address[])'),
          args: [[hexA, B]],
        }).slice(0, 10),
      ).toBe(toFunctionSelector('f(address[])'))
    })

    test('one scalar type under both shapes, whatever its spelling', () => {
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'uint[]' }),
          fn({ name: 'xs', type: 'uint256[2]' }),
        ],
        [[1n, 2n]],
        ['uint[]', 'uint256[2]'],
      )
    })

    test('a tuple and an array whose scalar types are ambiguous for the values', () => {
      expectAmbiguous(
        [fn(addressPair), fn({ name: 'xs', type: 'bytes20[2]' })],
        [[hexA, hexA]],
        ['(address,address)', 'bytes20[2]'],
      )
      expectAmbiguous(
        [fn(addressPair), fn({ name: 'xs', type: 'string[]' })],
        [[hexA, B]],
        ['(address,address)', 'string[]'],
      )
    })

    test('object-form tuples are read by name under an array-length pair', () => {
      const swapped = [uintPairComponents[1]!, uintPairComponents[0]!]
      const items = [
        fn({ name: 'ts', type: 'tuple[]', components: uintPairComponents }),
        fn({ name: 'ts', type: 'tuple[2]', components: swapped }),
      ]
      expectAmbiguous(
        items,
        [
          [
            { a: 1n, b: 2n },
            { b: 4n, a: 3n },
          ],
        ],
        ['(uint256,uint256)[]', '(uint256,uint256)[2]'],
      )
      expectResolved(items, [[{ a: 1n, b: 2n }]], 'f((uint256,uint256)[])')
    })

    test('an empty outer array cannot distinguish any inner types or shapes', () => {
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'uint256[2][]' }),
          fn({ name: 'xs', type: 'string[3][]' }),
        ],
        [[]],
      )
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'uint256[2][]' }),
          fn({ name: 'xs', type: 'string[2][]' }),
        ],
        [[]],
      )
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'uint8[][]' }),
          fn({ name: 'xs', type: 'uint256[2][]' }),
        ],
        [[]],
      )
      // With no elements, the declared array types are reported.
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'address[2][]' }),
          fn({ name: 'xs', type: 'bytes20[3][]' }),
        ],
        [[]],
        ['address[2][]', 'bytes20[3][]'],
      )
      // A tuple and an array of another length.
      expectAmbiguous(
        [
          fn({ name: 'ts', type: 'tuple[]', components: uintPairComponents }),
          fn({ name: 'xs', type: 'uint256[3][]' }),
        ],
        [[]],
        ['(uint256,uint256)[]', 'uint256[3][]'],
      )
      // Empty inner arrays under an outer array-length pair.
      expectAmbiguous(
        [
          fn({ name: 'xs', type: 'address[][]' }),
          fn({ name: 'xs', type: 'address[][2]' }),
        ],
        [[[], []]],
        ['address[][]', 'address[][2]'],
      )
    })
  })

  describe('three or more overloads', () => {
    test('every ABI order reports an ambiguity among shape overloads', () => {
      const items = [
        fn({ name: 'xs', type: 'address[]' }),
        fn({ name: 'xs', type: 'address[2]' }),
        fn(
          tuple({ name: 'a', type: 'address' }, { name: 'b', type: 'address' }),
        ),
      ]
      expectAmbiguous(items, [[A, B]])
      // Three elements only fit the dynamic array.
      expectResolved(items, [[A, B, A]], 'f(address[])')
    })

    test('an overload that does not match leaves the ambiguous pair reported', () => {
      const items = [
        fn({ name: 'xs', type: 'address[]' }),
        fn({ name: 'n', type: 'uint256' }),
        fn({ name: 'xs', type: 'address[2]' }),
        fn({ name: 'xs', type: 'address[3]' }),
      ]
      expectAmbiguous(items, [[A, B]], ['address[]', 'address[2]'])
      expectAmbiguous(items, [[A, B, A]], ['address[]', 'address[3]'])
      expectResolved(items, [[A]], 'f(address[])')
      expectResolved(items, [1n], 'f(uint256)')
    })

    test('every order rejects multiple matches without a type-pair whitelist', () => {
      // All three types structurally accept the same string; no matching
      // overload may hide ambiguity between the others.
      const items = [
        fn({ name: 'x', type: 'address' }),
        fn({ name: 'x', type: 'function' }),
        fn({ name: 'x', type: 'bytes20' }),
      ]
      expectAmbiguous(items, ['0x2b5ad5c4795c026514f8317c7a215e218dccd6cf'])
    })
  })

  describe('selecting one overload', () => {
    const dynamic = fn(
      { name: 'xs', type: 'address[]' },
      { name: 'n', type: 'uint256' },
    )
    const fixed = fn(
      { name: 'xs', type: 'address[2]' },
      { name: 'n', type: 'uint256' },
    )
    const args = [[A, B], 1n]
    const signatures = ['f(address[],uint256)', 'f(address[2],uint256)']

    test('getAbiItem: the 4-byte selector as the name', () => {
      for (const abi of permutations([dynamic, fixed]))
        for (const signature of signatures)
          expect(
            formatAbiItem(
              getAbiItem({
                abi: abi as unknown as Abi,
                name: toFunctionSelector(signature),
                args,
              }) as never,
            ),
          ).toBe(signature)
    })

    test('getAbiItem: an ABI holding the single overload', () => {
      expect(resolve([dynamic], args)).toBe(signatures[0])
      expect(resolve([fixed], args)).toBe(signatures[1])
    })

    test('encodeFunctionData: ambiguous by name, resolved by selector or single-overload ABI', () => {
      const single = [dynamic, fixed].map((item) =>
        encodeFunctionData({
          abi: [item] as unknown as Abi,
          functionName: 'f',
          args,
        }),
      )
      // Same arguments, two different calls.
      expect(single[0]).not.toBe(single[1])
      expect(single[0]!.slice(0, 10)).toBe(toFunctionSelector(signatures[0]!))
      expect(single[1]!.slice(0, 10)).toBe(toFunctionSelector(signatures[1]!))

      for (const abi of permutations([dynamic, fixed]) as unknown as Abi[]) {
        expect(() =>
          encodeFunctionData({ abi, functionName: 'f', args }),
        ).toThrowError(AbiItemAmbiguityError)
        signatures.forEach((signature, index) => {
          expect(
            encodeFunctionData({
              abi,
              functionName: toFunctionSelector(signature),
              args,
            }),
          ).toBe(single[index])
        })
      }
    })

    test('prepareEncodeFunctionData and decodeFunctionResult resolve the same way', () => {
      for (const abi of permutations([dynamic, fixed]) as unknown as Abi[]) {
        expect(() =>
          prepareEncodeFunctionData({ abi, functionName: 'f', args }),
        ).toThrowError(AbiItemAmbiguityError)
        expect(() =>
          decodeFunctionResult({ abi, functionName: 'f', args, data: '0x' }),
        ).toThrowError(AbiItemAmbiguityError)
        expect(
          prepareEncodeFunctionData({
            abi,
            functionName: toFunctionSelector(signatures[1]!),
            args,
          }).functionName,
        ).toBe(toFunctionSelector(signatures[1]!))
      }
    })
  })
})
