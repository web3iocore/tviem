import { describe, expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import type {
  JsonRpcAccount,
  SignableTransaction,
  TronAccount,
} from '../../../src/accounts/types.js'
import { deployContract } from '../../../src/actions/wallet/deployContract.js'
import { multiSign } from '../../../src/actions/wallet/multiSign.js'
import { buildSendTrx, sendTrx } from '../../../src/actions/wallet/sendTrx.js'
import { signMessage } from '../../../src/actions/wallet/signMessage.js'
import { signTransaction } from '../../../src/actions/wallet/signTransaction.js'
import { signTypedData } from '../../../src/actions/wallet/signTypedData.js'
import { writeContract } from '../../../src/actions/wallet/writeContract.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import { AccountTypeNotSupportedError } from '../../../src/errors/rpc.js'
import type { Address } from '../../../src/types/address.js'
import { addressToHex } from '../../../src/utils/address/addressToHex.js'
import { rpc } from '../../fixtures/rpc/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'

// pk = 1 → TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC.
const local = privateKeyToAccount(`0x${'0'.repeat(63)}1`)
const addressOnly: JsonRpcAccount = { address: local.address, type: 'json-rpc' }
const recipient = 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe' as Address

const trc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

function mock() {
  return createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
}

/** A built (unsigned) transaction owned by `local`. */
async function unsignedTransfer(): Promise<SignableTransaction> {
  const { transport } = mock()
  const client = createWalletClient({ transport })
  return buildSendTrx(client, {
    account: addressOnly,
    to: recipient,
    amount: 1n,
  })
}

/** Every Action that must sign, called with `account`. */
async function signingCalls(account: TronAccount) {
  const transaction = await unsignedTransfer()
  return {
    sendTrx: (client: ReturnType<typeof createWalletClient>) =>
      sendTrx(client, { account, to: recipient, amount: 1n }),
    writeContract: (client: ReturnType<typeof createWalletClient>) =>
      writeContract(client, {
        account,
        address: recipient,
        abi: trc20Abi,
        functionName: 'transfer',
        args: [recipient, 1n],
      }),
    deployContract: (client: ReturnType<typeof createWalletClient>) =>
      deployContract(client, { account, abi: [], bytecode: '0x60' }),
    signTransaction: (client: ReturnType<typeof createWalletClient>) =>
      signTransaction(client, { account, transaction }),
    signMessage: (client: ReturnType<typeof createWalletClient>) =>
      signMessage(client, { account, message: 'gm' }),
    signTypedData: (client: ReturnType<typeof createWalletClient>) =>
      signTypedData(client, {
        account,
        domain: { name: 'x' },
        types: { M: [{ name: 'a', type: 'uint256' }] },
        primaryType: 'M',
        message: { a: 1n },
      }),
    multiSign: (client: ReturnType<typeof createWalletClient>) =>
      multiSign(client, { account, transaction }),
  }
}

describe('an address-only account', () => {
  test('builds a transaction owned by its address', async () => {
    const transaction = await unsignedTransfer()
    expect(
      (
        transaction.raw_data.contract[0]!.parameter.value as {
          owner_address: string
        }
      ).owner_address,
    ).toBe(addressToHex(local.address))
    expect(transaction.signature).toBeUndefined()
  })

  test('works hoisted on the Client for build actions', async () => {
    const { transport } = mock()
    const client = createWalletClient({ transport, account: addressOnly })
    const transaction = await buildSendTrx(client, {
      to: recipient,
      amount: 1n,
    })
    expect(transaction).toStrictEqual(await unsignedTransfer())
  })

  test.each([
    'sendTrx',
    'writeContract',
    'deployContract',
    'signTransaction',
    'signMessage',
    'signTypedData',
    'multiSign',
  ] as const)('is refused by %s before any request goes out', async (name) => {
    const calls = await signingCalls(addressOnly)
    const { transport, calls: requests } = mock()
    const client = createWalletClient({ transport })
    const error = await calls[name](client).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AccountTypeNotSupportedError)
    expect((error as AccountTypeNotSupportedError).shortMessage).toBe(
      'Account type "json-rpc" is not supported.',
    )
    expect(requests).toHaveLength(0)
  })

  test.each([
    'sendTrx',
    'signTransaction',
    'signMessage',
    'multiSign',
  ] as const)('is refused by %s when hoisted on the Client', async (name) => {
    const { transport, calls: requests } = mock()
    const client = createWalletClient({ transport, account: addressOnly })
    const calls = await signingCalls(undefined as unknown as TronAccount)
    const error = await calls[name](client).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AccountTypeNotSupportedError)
    expect(requests).toHaveLength(0)
  })
})

describe('the signing-account check accepts only local accounts', () => {
  test.each([
    ['no type at all', { address: local.address }, 'undefined'],
    ['an unknown type', { address: local.address, type: 'smart' }, 'smart'],
  ])('refuses an object with %s', async (_, account, shown) => {
    const calls = await signingCalls(account as unknown as TronAccount)
    const { transport, calls: requests } = mock()
    const client = createWalletClient({ transport })
    const error = await calls.sendTrx(client).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AccountTypeNotSupportedError)
    expect((error as AccountTypeNotSupportedError).shortMessage).toBe(
      `Account type "${shown}" is not supported.`,
    )
    expect(requests).toHaveLength(0)
  })

  test('a local account still signs and broadcasts', async () => {
    const { transport, calls: requests } = mock()
    const client = createWalletClient({ transport })
    const { txID } = await sendTrx(client, {
      account: local,
      to: recipient,
      amount: 1n,
    })
    expect(txID).toMatch(/^[0-9a-f]{64}$/)
    expect(requests.map((c) => c.path)).toEqual([
      'getnowblock',
      'broadcasttransaction',
    ])
  })
})
