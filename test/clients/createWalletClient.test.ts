import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js'
import { createWalletClient } from '../../src/clients/createWalletClient.js'
import {
  createTransport,
  type Transport,
} from '../../src/clients/transports/createTransport.js'
import { InvalidAddressError } from '../../src/errors/address.js'
import { AccountNotFoundError } from '../../src/errors/rpc.js'
import { rpc } from '../fixtures/rpc/loader.js'
import { createMockTransport } from '../mock/createMockTransport.js'

const transport: Transport = () =>
  createTransport(
    {
      key: 'mock',
      name: 'Mock Transport',
      type: 'mock',
      request: async () => ({}) as any,
    },
    {},
  )

const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'
const account = privateKeyToAccount(pk1)
const to = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC' as const

test('defaults to the wallet key/name and hoists the account', () => {
  const client = createWalletClient({ account, transport })
  expect(client.key).toBe('wallet')
  expect(client.name).toBe('Wallet Client')
  expect(client.type).toBe('walletClient')
  expect(client.account?.type).toBe('local')
  expect(client.account?.address).toBe('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC')
})

test('hoisting an address string gives an address-only json-rpc account', () => {
  const client = createWalletClient({ account: to, transport })
  expect(client.account).toEqual({ address: to, type: 'json-rpc' })
})

test('hoisting a private-key string throws InvalidAddressError without echoing it', () => {
  for (const key of [pk1, pk1.slice(2)]) {
    let error: unknown
    try {
      // @ts-expect-error a private key is not an `account` string
      createWalletClient({ account: key, transport })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(InvalidAddressError)
    const { message } = error as InvalidAddressError
    expect(message).toContain('Address is invalid.')
    expect(message).not.toContain(pk1.slice(2))
  }
})

test('exposes the wallet action set', () => {
  const client = createWalletClient({ account, transport })
  for (const name of [
    'sendTrx',
    'writeContract',
    'broadcastTransaction',
    'broadcastHex',
  ] as const)
    expect(typeof client[name]).toBe('function')
})

test('sendTrx throws AccountNotFoundError when no account is available', async () => {
  const client = createWalletClient({ transport })
  await expect(client.sendTrx({ to, amount: 1n })).rejects.toBeInstanceOf(
    AccountNotFoundError,
  )
})

test('sendTrx runs the full pipeline when the client hoists an account', async () => {
  // A hoisted account passes the guard and the local build → sign → broadcast
  // pipeline completes, returning a locally computed txID.
  const { transport: mock } = createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
  const client = createWalletClient({ account, transport: mock })
  const { txID } = await client.sendTrx({ to, amount: 1n })
  expect(txID).toMatch(/^[0-9a-f]{64}$/)
})

test('a per-call account satisfies the guard on an account-less client', async () => {
  const { transport: mock } = createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
  const client = createWalletClient({ transport: mock })
  const { txID } = await client.sendTrx({
    account,
    to,
    amount: 1n,
  })
  expect(txID).toMatch(/^[0-9a-f]{64}$/)
})

test('writeContract throws AccountNotFoundError when no account is available', async () => {
  const client = createWalletClient({ transport })
  await expect(
    client.writeContract({
      address: to,
      abi: [],
      functionName: 'transfer',
      args: [to, 1n],
    }),
  ).rejects.toBeInstanceOf(AccountNotFoundError)
})
