import { describe, expect, test } from 'vitest'
import {
  decodeNodeMessage,
  decodeRevertData,
} from '../../../src/actions/utils/decodeRevert.js'
import { encodeAbiParameters } from '../../../src/utils/abi/encodeAbiParameters.js'

const errorString = (reason: string) =>
  `08c379a0${encodeAbiParameters([{ type: 'string' }], [reason]).slice(2)}`
const panic = (code: bigint) =>
  `4e487b71${encodeAbiParameters([{ type: 'uint256' }], [code]).slice(2)}`

describe('decodeRevertData', () => {
  test('decodes Error(string), with or without a 0x prefix', () => {
    const payload = errorString('ERC20: insufficient balance')
    expect(decodeRevertData(payload)).toEqual({
      reason: 'ERC20: insufficient balance',
      signature: 'Error(string)',
    })
    expect(decodeRevertData(`0x${payload}`)).toEqual(decodeRevertData(payload))
    expect(decodeRevertData(payload.toUpperCase())).toEqual(
      decodeRevertData(payload),
    )
  })

  test('decodes Panic(uint256)', () => {
    expect(decodeRevertData(panic(0x11n))).toEqual({
      code: 0x11n,
      signature: 'Panic(uint256)',
    })
  })

  test.each([
    ['undefined', undefined],
    ['empty', ''],
    ['a bare selector', '08c379a0'],
    ['a custom error', `deadbeef${'00'.repeat(32)}`],
    ['a truncated Error(string)', errorString('x').slice(0, 20)],
  ])('returns {} for %s', (_, payload) => {
    expect(decodeRevertData(payload)).toEqual({})
  })
})

describe('decodeNodeMessage', () => {
  test('decodes even-length hex to UTF-8 and passes other text through', () => {
    expect(decodeNodeMessage('4552433230')).toBe('ERC20')
    expect(decodeNodeMessage('plain text')).toBe('plain text')
    expect(decodeNodeMessage('abc')).toBe('abc')
    expect(decodeNodeMessage(undefined)).toBeUndefined()
    expect(decodeNodeMessage('')).toBeUndefined()
  })
})
