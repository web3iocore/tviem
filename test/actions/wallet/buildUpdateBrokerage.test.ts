import { expect, test } from 'vitest'
import { buildUpdateBrokerage } from '../../../src/actions/wallet/updateBrokerage.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import { InvalidParameterError } from '../../../src/errors/parameter.js'
import { AccountNotFoundError } from '../../../src/errors/rpc.js'
import { createMockTransport } from '../../mock/createMockTransport.js'
import { makeTviemClient, tviemHeader } from './_buildTestHelpers.js'

test('builds UpdateBrokerageContract offline', async () => {
  const client = makeTviemClient()

  const tviemTx = await client.buildUpdateBrokerage({
    brokerage: 20,
    blockHeader: tviemHeader,
  })

  expect(tviemTx.visible).toBe(false)
  expect(tviemTx.signature).toBeUndefined()
})

test('permissionId is baked in as Permission_id', async () => {
  const client = makeTviemClient()

  const tviemTx = await client.buildUpdateBrokerage({
    brokerage: 20,
    permissionId: 2,
    blockHeader: tviemHeader,
  })

  const contract = (
    tviemTx.raw_data.contract as Record<string, unknown>[]
  )[0] as {
    Permission_id?: number
  }
  expect(contract.Permission_id).toBe(2)
})

test('bounds brokerage to the integer percentage java-tron accepts', async () => {
  const client = makeTviemClient()
  const build = (brokerage: number) =>
    client.buildUpdateBrokerage({ brokerage, blockHeader: tviemHeader })

  // `UpdateBrokerageActuator.validate()` accepts [0, 100] inclusive.
  await expect(build(0)).resolves.toBeDefined()
  await expect(build(100)).resolves.toBeDefined()

  await expect(build(-1)).rejects.toThrow(
    'Invalid brokerage: -1. Expected an integer percentage in [0, 100]',
  )
  await expect(build(101)).rejects.toThrow('Invalid brokerage: 101')
  // The field is int32: a fraction has no wire representation, and would
  // otherwise surface as a raw RangeError from the protobuf writer.
  await expect(build(20.5)).rejects.toThrow('Invalid brokerage: 20.5')
})

test('throws AccountNotFoundError when no account is available', async () => {
  const { transport } = createMockTransport({ responses: {} })
  const client = createPublicClient({ transport })
  await expect(
    buildUpdateBrokerage(client, { brokerage: 20, blockHeader: tviemHeader }),
  ).rejects.toBeInstanceOf(AccountNotFoundError)
})

test('an out-of-range brokerage is an InvalidParameterError', async () => {
  const client = makeTviemClient()

  for (const brokerage of [-1, 101, 20.5]) {
    const err = await client
      .buildUpdateBrokerage({ brokerage, blockHeader: tviemHeader })
      .catch((e) => e)
    expect(err).toBeInstanceOf(InvalidParameterError)
    expect(err).toMatchObject({
      name: 'InvalidParameterError',
      param: 'brokerage',
      reason: 'range',
    })
  }
})
