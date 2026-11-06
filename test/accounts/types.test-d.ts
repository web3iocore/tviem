import { expectTypeOf, test } from 'vitest'
import { generatePrivateKey } from '../../src/accounts/generatePrivateKey.js'
import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../src/accounts/toAccount.js'
import type {
  JsonRpcAccount,
  SignableTransaction,
  TronAccount,
  TronCustomAccount,
  TronCustomSource,
  TronHDAccount,
  TronLocalAccount,
} from '../../src/accounts/types.js'
import type { Address } from '../../src/types/address.js'
import type { Hex } from '../../src/types/misc.js'
import type { MaybePromise } from '../../src/types/utils.js'
import type { Signature } from '../../src/utils/signature/sign.js'
import type { RawData } from '../../src/utils/transaction/serializeRawData.js'

test('privateKeyToAccount returns a TronLocalAccount', () => {
  const account = privateKeyToAccount(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  )
  expectTypeOf(account).toEqualTypeOf<TronLocalAccount>()
})

test('account fields are branded/narrowed', () => {
  const account = privateKeyToAccount(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  )
  expectTypeOf(account.address).toEqualTypeOf<Address>()
  expectTypeOf(account.publicKey).toEqualTypeOf<Hex>()
  expectTypeOf(account.source).toEqualTypeOf<'privateKey'>()
  expectTypeOf(account.type).toEqualTypeOf<'local'>()
})

test('signing methods are typed MaybePromise; the awaited value is the TRON-wire Signature / SignableTransaction', async () => {
  const account = privateKeyToAccount(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  )
  // Every account — key-backed included — is typed `MaybePromise<T>`, so
  // callers always `await`; key-backed accounts happen to resolve sync.
  expectTypeOf(account.signMessage({ message: 'gm' })).toEqualTypeOf<
    MaybePromise<Signature>
  >()
  expectTypeOf(
    await account.signMessage({ message: 'gm' }),
  ).toEqualTypeOf<Signature>()
  expectTypeOf(
    account.signTypedData({ types: {}, primaryType: 'X' }),
  ).toEqualTypeOf<MaybePromise<Signature>>()
  expectTypeOf(
    await account.signTypedData({ types: {}, primaryType: 'X' }),
  ).toEqualTypeOf<Signature>()
  const transaction: SignableTransaction = {
    txID: 'ab',
    raw_data: {} as RawData,
    raw_data_hex: 'ab',
  }
  expectTypeOf(account.signTransaction(transaction)).toEqualTypeOf<
    MaybePromise<SignableTransaction>
  >()
  expectTypeOf(
    await account.signTransaction(transaction),
  ).toEqualTypeOf<SignableTransaction>()
  expectTypeOf(account.multiSign(transaction)).toEqualTypeOf<
    MaybePromise<SignableTransaction>
  >()
  expectTypeOf(
    await account.multiSign(transaction),
  ).toEqualTypeOf<SignableTransaction>()
})

test('TronCustomSource signer methods are typed MaybePromise', () => {
  expectTypeOf<ReturnType<TronCustomSource['signMessage']>>().toEqualTypeOf<
    MaybePromise<Signature>
  >()
  expectTypeOf<ReturnType<TronCustomSource['signTypedData']>>().toEqualTypeOf<
    MaybePromise<Signature>
  >()
  expectTypeOf<ReturnType<TronCustomSource['signTransaction']>>().toEqualTypeOf<
    MaybePromise<SignableTransaction>
  >()
  expectTypeOf<
    ReturnType<NonNullable<TronCustomSource['multiSign']>>
  >().toEqualTypeOf<MaybePromise<SignableTransaction>>()
})

test('compat: key-backed accounts remain assignable to TronCustomSource', () => {
  expectTypeOf<TronLocalAccount>().toExtend<TronCustomSource>()
  expectTypeOf<TronHDAccount>().toExtend<TronCustomSource>()
  const local = privateKeyToAccount(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  )
  const source: TronCustomSource = local
  expectTypeOf(toAccount(source)).toEqualTypeOf<TronCustomAccount>()
})

test('compat: sync and async object literals are both assignable to TronCustomSource', () => {
  const signature = {} as Signature
  const signed = {} as SignableTransaction
  const syncSource = {
    address: 'T' as Address,
    publicKey: '0x04' as Hex,
    signMessage: () => signature,
    signTypedData: () => signature,
    signTransaction: () => signed,
  }
  const asyncSource = {
    address: 'T' as Address,
    publicKey: '0x04' as Hex,
    signMessage: async () => signature,
    signTypedData: async () => signature,
    signTransaction: async () => signed,
    multiSign: async () => signed,
  }
  expectTypeOf(syncSource).toExtend<TronCustomSource>()
  expectTypeOf(asyncSource).toExtend<TronCustomSource>()
  const asLiteral: TronCustomSource = {
    address: 'T' as Address,
    publicKey: '0x04' as Hex,
    async signMessage() {
      return signature
    },
    async signTypedData() {
      return signature
    },
    async signTransaction(transaction) {
      return transaction
    },
  }
  expectTypeOf(toAccount(asLiteral)).toEqualTypeOf<TronCustomAccount>()
  // A Promise of the wrong value is still rejected.
  const wrong: TronCustomSource = {
    address: 'T' as Address,
    publicKey: '0x04' as Hex,
    // @ts-expect-error — must resolve to a Signature, not a string.
    signMessage: async () => '0xdead',
    signTypedData: async () => signature,
    signTransaction: async () => signed,
  }
  void wrong
})

test('SignableTransaction requires the full triple — partial forms are a type error', () => {
  const account = privateKeyToAccount(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  )
  // @ts-expect-error a bare txID (blind signing) is no longer assignable
  account.signTransaction({ txID: 'ab' })
  // @ts-expect-error raw_data alone is not assignable
  account.signTransaction({ raw_data: {} as RawData })
  // @ts-expect-error txID + raw_data without raw_data_hex is not assignable
  account.signTransaction({ txID: 'ab', raw_data: {} as RawData })
})

test('signMessage accepts both string and { raw } messages', () => {
  const account = privateKeyToAccount(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  )
  account.signMessage({ message: 'gm' })
  account.signMessage({ message: { raw: '0xdead' } })
  account.signMessage({ message: { raw: new Uint8Array([1]) } })
})

test('a local account is assignable to the account union', () => {
  const account = privateKeyToAccount(
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  )
  expectTypeOf(account).toMatchTypeOf<TronAccount>()
})

test('generatePrivateKey returns a Hex', () => {
  expectTypeOf(generatePrivateKey()).toEqualTypeOf<Hex>()
})

test('toAccount overloads: address → json-rpc, source → custom', () => {
  expectTypeOf(toAccount('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC')).toEqualTypeOf<
    JsonRpcAccount<'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'>
  >()
  expectTypeOf(toAccount('T' as Address)).toMatchTypeOf<TronAccount>()
  // @ts-expect-error a private key is not an account source
  toAccount('0x01')
  const source = {} as TronCustomSource
  expectTypeOf(toAccount(source)).toEqualTypeOf<TronCustomAccount>()
  expectTypeOf(toAccount(source)).toMatchTypeOf<TronAccount>()
})
