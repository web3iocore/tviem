import { describe, expect, test } from 'vitest'

import { formatAbiItemWithArgs } from '../../../src/utils/abi/formatAbiItemWithArgs.js'

const transfer = {
  type: 'function',
  name: 'transfer',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [],
} as const
const args = ['TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC', 100n] as const

describe('formatAbiItemWithArgs', () => {
  test('default: function name and values', () => {
    expect(formatAbiItemWithArgs({ abiItem: transfer, args })).toBe(
      'transfer(TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC, 100)',
    )
  })

  test('includeName labels each value with its input name', () => {
    expect(
      formatAbiItemWithArgs({ abiItem: transfer, args, includeName: true }),
    ).toBe('transfer(to: TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC, amount: 100)')
  })

  test('includeFunctionName: false leaves only the argument list', () => {
    expect(
      formatAbiItemWithArgs({
        abiItem: transfer,
        args,
        includeFunctionName: false,
      }),
    ).toBe('(TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC, 100)')
  })

  test('object values (tuples, arrays) are rendered as JSON with bigints as decimals', () => {
    expect(
      formatAbiItemWithArgs({
        abiItem: {
          type: 'error',
          name: 'Bad',
          inputs: [
            {
              name: 'order',
              type: 'tuple',
              components: [{ name: 'id', type: 'uint256' }],
            },
            { name: 'ids', type: 'uint256[]' },
          ],
        },
        args: [{ id: 1n }, [2n, 3n]],
      }),
    ).toBe('Bad({"id":"1"}, ["2","3"])')
  })

  test('an item without inputs formats as an empty list', () => {
    expect(
      formatAbiItemWithArgs({
        abiItem: { type: 'error', name: 'Paused', inputs: [] },
        args: [],
      }),
    ).toBe('Paused()')
  })

  test('returns undefined for an item without a name or inputs', () => {
    expect(
      formatAbiItemWithArgs({
        abiItem: { type: 'fallback', stateMutability: 'payable' },
        args: [],
      }),
    ).toBeUndefined()
    expect(
      formatAbiItemWithArgs({
        // @ts-expect-error an error item without `inputs`
        abiItem: { type: 'error', name: 'Paused' },
        args: [],
      }),
    ).toBeUndefined()
  })
})
