import { describe, expect, test } from 'vitest'
import {
  decodeNodeMessage,
  decodeRevert,
  decodeRevertReason,
} from '../../../src/actions/utils/decodeRevert.js'
import { encodeAbiParameters } from '../../../src/utils/abi/encodeAbiParameters.js'

const errorString = (reason: string) =>
  `08c379a0${encodeAbiParameters([{ type: 'string' }], [reason]).slice(2)}`
const panic = (code: bigint) =>
  `4e487b71${encodeAbiParameters([{ type: 'uint256' }], [code]).slice(2)}`

describe('decodeRevertReason', () => {
  test('decodes Error(string), with or without a 0x prefix, in either case', () => {
    const payload = errorString('ERC20: insufficient balance')
    expect(decodeRevertReason(payload)).toBe('ERC20: insufficient balance')
    for (const variant of [
      `0x${payload}`,
      `0X${payload.toUpperCase()}`,
      payload.toUpperCase(),
    ])
      expect(decodeRevertReason(variant)).toBe('ERC20: insufficient balance')
  })

  test.each([
    ['undefined', undefined],
    ['empty', ''],
    ['a bare selector', '08c379a0'],
    ['Panic(uint256)', panic(0x11n)],
    ['a custom error', `deadbeef${'00'.repeat(32)}`],
    ['a truncated Error(string)', errorString('x').slice(0, 20)],
  ])('returns undefined for %s', (_, payload) => {
    expect(decodeRevertReason(payload)).toBeUndefined()
  })
})

describe('decodeRevert', () => {
  const options = { abi: [], functionName: 'transfer' } as const

  test('decodes a bare, 0x-prefixed or upper-case payload to the same error', () => {
    const payload = errorString('boom')
    for (const variant of [
      payload,
      `0x${payload}`,
      `0X${payload.toUpperCase()}`,
      payload.toUpperCase(),
    ]) {
      const err = decodeRevert(variant, 'ignored', options)
      expect(err.raw).toBe(`0x${payload}`)
      expect(err.reason).toBe('boom')
      expect(err.data?.errorName).toBe('Error')
    }
  })

  test.each([
    ['undefined', undefined],
    ['empty', ''],
  ])('uses the decoded node message when the payload is %s', (_, payload) => {
    // "REVERT opcode executed", hex-encoded as java-tron sends it.
    const err = decodeRevert(
      payload,
      '524556455254206f70636f6465206578656375746564',
      options,
    )
    expect(err.reason).toBe('REVERT opcode executed')
    expect(err.raw).toBeUndefined()
    expect(err.data).toBeUndefined()
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
