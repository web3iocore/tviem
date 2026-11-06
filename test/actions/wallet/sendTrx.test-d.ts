import { expectTypeOf, test } from 'vitest'
import type { TronAccount } from '../../../src/accounts/types.js'
import type { SendTrxParameters } from '../../../src/actions/wallet/sendTrx.js'
import type { Address } from '../../../src/types/address.js'

// pk=1 — a private key is no longer an `account` string.
const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'

type AccountParam = NonNullable<SendTrxParameters['account']>

test('SendTrxParameters: account accepts an address or a built account, not a key', () => {
  expectTypeOf<Address>().toExtend<AccountParam>()
  expectTypeOf<'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'>().toExtend<AccountParam>()
  expectTypeOf<TronAccount>().toExtend<AccountParam>()
  // @ts-expect-error a hex private key is not an account string
  expectTypeOf<typeof pk1>().toExtend<AccountParam>()
})
