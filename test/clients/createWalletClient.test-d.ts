import { expectTypeOf, test } from 'vitest'
import type {
  JsonRpcAccount,
  TronAccount,
  TronLocalAccount,
} from '../../src/accounts/types.js'
import { createWalletClient } from '../../src/clients/createWalletClient.js'
import { http } from '../../src/clients/transports/http.js'
import type { Address } from '../../src/types/address.js'

// pk=1, in both forms a key used to be accepted in, and its address.
const pk0x =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const pkBare =
  '0000000000000000000000000000000000000000000000000000000000000001'
const address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'

test('createWalletClient: hoisting an address infers JsonRpcAccount', () => {
  const client = createWalletClient({ account: address, transport: http() })
  expectTypeOf(client.account).toEqualTypeOf<JsonRpcAccount<typeof address>>()
})

test('createWalletClient: hoisting a private-key string is a type error', () => {
  // @ts-expect-error a private key is not an `account` string
  createWalletClient({ account: pkBare, transport: http() })
  // @ts-expect-error a private key is not an `account` string
  createWalletClient({ account: pk0x, transport: http() })
})

test('createWalletClient: a built account passes through unchanged', () => {
  const account = {} as TronLocalAccount
  const client = createWalletClient({ account, transport: http() })
  expectTypeOf(client.account).toEqualTypeOf<TronLocalAccount>()
})

test('sendTrx: a per-call account is an Address or a TronAccount, not a key', () => {
  const client = createWalletClient({ transport: http() })
  type AccountParam = NonNullable<
    Parameters<typeof client.sendTrx>[0]['account']
  >
  expectTypeOf<Address>().toExtend<AccountParam>()
  expectTypeOf<typeof address>().toExtend<AccountParam>()
  expectTypeOf<TronAccount>().toExtend<AccountParam>()
  expectTypeOf<typeof pkBare>().not.toExtend<AccountParam>()
  expectTypeOf<typeof pk0x>().not.toExtend<AccountParam>()
  // @ts-expect-error a private key is not an `account` string
  client.sendTrx({ account: pk0x, to: address, amount: 1n })
})
