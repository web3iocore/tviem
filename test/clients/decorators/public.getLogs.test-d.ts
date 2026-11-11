// Type-surface tests for `client.getLogs`: the inference of `getLogs` survives
// through the Public Client decorator.
import type { AbiEvent } from 'abitype'
import { expectTypeOf, test } from 'vitest'

import type {
  GetLogsParameters,
  GetLogsReturnType,
  Log,
} from '../../../src/actions/public/getLogs.js'
import { getLogs } from '../../../src/actions/public/getLogs.js'
import type { Client } from '../../../src/clients/createClient.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import type { PublicActions } from '../../../src/clients/decorators/public.js'
import { http } from '../../../src/clients/transports/http.js'
import type { Address } from '../../../src/types/address.js'
import type { Hex } from '../../../src/types/misc.js'

const transfer = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

const approval = {
  type: 'event',
  name: 'Approval',
  inputs: [
    { indexed: true, name: 'owner', type: 'address' },
    { indexed: true, name: 'spender', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
} as const

const client = createPublicClient({ transport: http() })

test('client.getLogs: no filter and topics-only give the plain Log', async () => {
  expectTypeOf(await client.getLogs()).toEqualTypeOf<Log[]>()
  expectTypeOf(await client.getLogs({})).toEqualTypeOf<Log[]>()
  expectTypeOf(
    await client.getLogs({ topics: [null, '0x01'], blockHash: '0x02' }),
  ).toEqualTypeOf<Log[]>()

  // The unparameterised types still describe a call.
  const parameters = {} as GetLogsParameters
  const logs: GetLogsReturnType = await client.getLogs(parameters)
  expectTypeOf(logs).toEqualTypeOf<Log[]>()
})

test('client.getLogs: a single event is inferred', async () => {
  const logs = await client.getLogs({ event: transfer })
  expectTypeOf(logs).toEqualTypeOf<Log<typeof transfer>[]>()
  expectTypeOf(logs[0]!.eventName).toEqualTypeOf<'Transfer'>()
  expectTypeOf(logs[0]!.args?.from).toEqualTypeOf<Address | undefined>()
  expectTypeOf(logs[0]!.args?.value).toEqualTypeOf<bigint | undefined>()

  const strict = await client.getLogs({ event: transfer, strict: true })
  expectTypeOf(strict).toEqualTypeOf<Log<typeof transfer, true>[]>()
  expectTypeOf(strict[0]!.args).toEqualTypeOf<{
    from: Address
    to: Address
    value: bigint
  }>()
  expectTypeOf(strict[0]!.transactionHash).toEqualTypeOf<Hex>()
})

test('client.getLogs: an events list narrows on eventName', async () => {
  const logs = await client.getLogs({
    events: [transfer, approval],
    strict: true,
  })
  const log = logs[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<'Transfer' | 'Approval'>()
  if (log.eventName === 'Transfer')
    expectTypeOf(log.args).toEqualTypeOf<{
      from: Address
      to: Address
      value: bigint
    }>()
  else
    expectTypeOf(log.args).toEqualTypeOf<{
      owner: Address
      spender: Address
      value: bigint
    }>()
})

test('client.getLogs: the args filter is typed from the event', () => {
  client.getLogs({ event: transfer, args: { from: 'T...', to: null } })
  client.getLogs({ event: transfer, args: [['T...', 'T...']] })

  // @ts-expect-error `value` is not indexed
  client.getLogs({ event: transfer, args: { value: 1n } })
  // @ts-expect-error misspelt input name
  client.getLogs({ event: transfer, args: { form: 'T...' } })
  // @ts-expect-error an address filter is not a bigint
  client.getLogs({ event: transfer, args: { from: 1n } })
  // @ts-expect-error `args` needs a single `event`
  client.getLogs({ events: [transfer, approval], args: { from: 'T...' } })
})

test('client.getLogs: an inline event / events list is inferred', async () => {
  const single = await client.getLogs({
    event: {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { indexed: true, name: 'from', type: 'address' },
        { indexed: false, name: 'value', type: 'uint256' },
      ],
    },
    strict: true,
  })
  expectTypeOf(single[0]!.eventName).toEqualTypeOf<'Transfer'>()
  expectTypeOf(single[0]!.args).toEqualTypeOf<{
    from: Address
    value: bigint
  }>()

  const plural = await client.getLogs({
    events: [
      {
        type: 'event',
        name: 'Deposit',
        inputs: [{ indexed: true, name: 'account', type: 'address' }],
      },
      { type: 'event', name: 'Ping', inputs: [] },
    ],
    strict: true,
  })
  const log = plural[0]!
  expectTypeOf(log.eventName).toEqualTypeOf<'Deposit' | 'Ping'>()
  if (log.eventName === 'Deposit')
    expectTypeOf(log.args).toEqualTypeOf<{ account: Address }>()
  else expectTypeOf(log.args).toEqualTypeOf<undefined>()
})

test('client.getLogs: a filter that is not narrowable is taken as it is', async () => {
  const list = [] as readonly unknown[]
  const wide = {} as GetLogsParameters['args']
  expectTypeOf(
    await client.getLogs({ event: transfer, args: list }),
  ).toEqualTypeOf<Log<typeof transfer>[]>()
  expectTypeOf(
    await client.getLogs({ event: transfer, args: wide, strict: true }),
  ).toEqualTypeOf<Log<typeof transfer, true>[]>()

  // A literal — inline or held in a variable — is still checked.
  // @ts-expect-error only two inputs are indexed
  client.getLogs({ event: transfer, args: [null, null, 1n] })
  // @ts-expect-error an address filter is not a bigint
  client.getLogs({ event: transfer, args: [1n] })
  const tooLong = [null, null, 1n] as const
  // @ts-expect-error only two inputs are indexed
  client.getLogs({ event: transfer, args: tooLong })
})

test('client.getLogs: a strict that can be undefined is not strict', () => {
  const forward = (strict?: true) => client.getLogs({ event: transfer, strict })
  expectTypeOf(forward).returns.resolves.toEqualTypeOf<Log<typeof transfer>[]>()
})

test('client.getLogs: events takes event items only', () => {
  const balanceOf = {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  } as const
  // @ts-expect-error a function is not an event
  client.getLogs({ events: [transfer, balanceOf] })
  // @ts-expect-error a list of unknown items
  client.getLogs({ events: [] as readonly unknown[] })
})

test('client.getLogs: a wide event keeps the wide shape', async () => {
  const event = {} as AbiEvent
  const logs = await client.getLogs({ event, args: { anything: 1 } })
  expectTypeOf(logs).toEqualTypeOf<Log<AbiEvent>[]>()
  expectTypeOf(logs[0]!.eventName).toEqualTypeOf<string>()
  expectTypeOf(logs[0]!.args).toEqualTypeOf<
    Record<string, unknown> | readonly unknown[] | undefined
  >()
})

test('client.getLogs resolves to what the action resolves to', async () => {
  const bare = {} as Client
  const strict = { event: transfer, strict: true } as const
  expectTypeOf(await client.getLogs(strict)).toEqualTypeOf(
    await getLogs(bare, strict),
  )
  const plural = { events: [transfer, approval] } as const
  expectTypeOf(await client.getLogs(plural)).toEqualTypeOf(
    await getLogs(bare, plural),
  )
  // The decorator's signature is the one a custom client extension sees.
  expectTypeOf(client.getLogs).toEqualTypeOf<PublicActions['getLogs']>()
})
