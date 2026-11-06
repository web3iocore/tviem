import { describe, expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import type {
  JsonRpcAccount,
  TronAccount,
} from '../../../src/accounts/types.js'
import { estimateEnergy } from '../../../src/actions/public/estimateEnergy.js'
import { readContract } from '../../../src/actions/public/readContract.js'
import { triggerConstantContract } from '../../../src/actions/public/triggerConstantContract.js'
import { createClient } from '../../../src/clients/createClient.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import { publicActions } from '../../../src/clients/decorators/public.js'
import { InvalidAddressError } from '../../../src/errors/address.js'
import type { Address } from '../../../src/types/address.js'
import { rpc } from '../../fixtures/rpc/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'

// The `account` of a read Action is the caller sent as `owner_address`. Like
// every other `account`, a string must be a Base58Check address.

const holder = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC' as Address
const holderHex = '417e5f4552091a69125d5dfcb7b8c2659029395bdf'
const contract = 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe' as Address

const abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

function mock() {
  return createMockTransport({
    responses: {
      triggerconstantcontract: {
        response: rpc('triggerconstantcontract.trc20-balanceof'),
      },
      estimateenergy: {
        response: { result: { result: true }, energy_required: 1 },
      },
    },
  })
}

const call = {
  address: contract,
  abi,
  functionName: 'balanceOf',
  args: [holder],
} as const

const actions = {
  readContract: (
    client: ReturnType<typeof createPublicClient>,
    account?: TronAccount | Address,
  ) => readContract(client, { ...call, account }),
  triggerConstantContract: (
    client: ReturnType<typeof createPublicClient>,
    account?: TronAccount | Address,
  ) => triggerConstantContract(client, { ...call, account }),
  estimateEnergy: (
    client: ReturnType<typeof createPublicClient>,
    account?: TronAccount | Address,
  ) => estimateEnergy(client, { ...call, account }),
}
const names = Object.keys(actions) as (keyof typeof actions)[]

const ownerOf = (body: unknown) =>
  (body as { owner_address: string }).owner_address

describe.each(names)('%s caller', (name) => {
  test.each([
    ['a Base58Check address', holder],
    [
      'an address-only account',
      { address: holder, type: 'json-rpc' } as JsonRpcAccount,
    ],
    ['a signing account', privateKeyToAccount(`0x${'0'.repeat(63)}1`)],
  ] as const)('accepts %s', async (_, account) => {
    const { transport, calls } = mock()
    await actions[name](createPublicClient({ transport }), account)
    expect(calls).toHaveLength(1)
    expect(ownerOf(calls[0]!.body)).toBe(holderHex)
  })

  test('accepts an address hoisted on the Client', async () => {
    const { transport, calls } = mock()
    // createPublicClient takes no account (as in viem); the base Client does.
    const client = createClient({ transport, account: holder }).extend(
      publicActions,
    )
    await actions[name](
      client as unknown as ReturnType<typeof createPublicClient>,
    )
    expect(ownerOf(calls[0]!.body)).toBe(holderHex)
  })

  test.each([
    ['41-hex', holderHex],
    ['0x EVM', '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf'],
    ['a private key', `0x${'7c'.repeat(32)}`],
  ])('refuses a %s caller string before any request', async (_, value) => {
    const { transport, calls } = mock()
    const error = await actions[name](
      createPublicClient({ transport }),
      value as Address,
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(InvalidAddressError)
    expect((error as InvalidAddressError).message).not.toContain(value)
    expect((error as InvalidAddressError).message).not.toContain(
      value.slice(0, 6),
    )
    expect(calls).toHaveLength(0)
  })
})
