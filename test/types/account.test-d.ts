import { expectTypeOf, test } from 'vitest'
import type {
  JsonRpcAccount,
  TronAccount,
  TronLocalAccount,
} from '../../src/accounts/types.js'
import { type ParseAccount, parseAccount } from '../../src/types/account.js'
import type { Address } from '../../src/types/address.js'
import type { Hex } from '../../src/types/misc.js'

// pk=1, in both private-key string forms, and its Base58Check address.
const pk0x =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const pkBare =
  '0000000000000000000000000000000000000000000000000000000000000001'
const pk1Address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'

test('parseAccount: an address resolves to JsonRpcAccount of that literal', () => {
  expectTypeOf(parseAccount(pk1Address)).toEqualTypeOf<
    JsonRpcAccount<typeof pk1Address>
  >()
  const address: Address = pk1Address
  expectTypeOf(parseAccount(address)).toEqualTypeOf<JsonRpcAccount>()
})

test('parseAccount: a private-key string or plain string is rejected', () => {
  // @ts-expect-error a 0x private key is not an account source
  parseAccount(pk0x)
  // @ts-expect-error a bare-hex private key is not an account source
  parseAccount(pkBare)
  // @ts-expect-error a `Hex` value is not an account source
  parseAccount('0x01' as Hex)
  // @ts-expect-error a plain string is not an account source
  parseAccount('' as string)
})

test('parseAccount: an already-built account passes through unchanged', () => {
  const account = {} as TronLocalAccount
  expectTypeOf(parseAccount(account)).toEqualTypeOf<TronLocalAccount>()
  const jsonRpc = {} as JsonRpcAccount
  expectTypeOf(parseAccount(jsonRpc)).toEqualTypeOf<JsonRpcAccount>()
})

test('parseAccount: non-string sources that are not accounts are rejected', () => {
  // @ts-expect-error a number is not an account source
  parseAccount(123)
})

test('ParseAccount: address sources infer JsonRpcAccount; the rest pass through', () => {
  expectTypeOf<ParseAccount<Address>>().toEqualTypeOf<JsonRpcAccount>()
  expectTypeOf<ParseAccount<typeof pk1Address>>().toEqualTypeOf<
    JsonRpcAccount<typeof pk1Address>
  >()
  expectTypeOf<ParseAccount<TronAccount>>().toEqualTypeOf<TronAccount>()
  expectTypeOf<ParseAccount<undefined>>().toEqualTypeOf<undefined>()
  // A non-address string is not an address source, so it is not mapped to
  // an account (parseAccount itself refuses it — see above).
  expectTypeOf<ParseAccount<typeof pkBare>>().toEqualTypeOf<typeof pkBare>()
})
