import { expectTypeOf, test } from 'vitest'
import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../src/accounts/toAccount.js'
import type {
  AccountSignMessageParameters,
  AccountSignTypedDataParameters,
  JsonRpcAccount,
  SignableTransaction,
  TronCustomAccount,
  TronCustomSource,
  TronLocalAccount,
} from '../../src/accounts/types.js'
import type { Address } from '../../src/types/address.js'
import type { Hex } from '../../src/types/misc.js'
import type { MaybePromise } from '../../src/types/utils.js'
import type { Signature } from '../../src/utils/signature/sign.js'

// pk=1, in both private-key string forms, and its Base58Check address.
const pk0x =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const pkBare =
  '0000000000000000000000000000000000000000000000000000000000000001'
const pk1Address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'

test('toAccount: address branch → JsonRpcAccount', () => {
  // Overload 1: `toAccount<address extends Address>(source: address): JsonRpcAccount<address>`
  expectTypeOf(toAccount(pk1Address)).toEqualTypeOf<
    JsonRpcAccount<typeof pk1Address>
  >()
  const address: Address = pk1Address
  expectTypeOf(toAccount(address)).toEqualTypeOf<JsonRpcAccount>()

  // the address branch is NOT the custom branch
  expectTypeOf(toAccount(pk1Address)).not.toEqualTypeOf<TronCustomAccount>()
})

test('toAccount: a private-key string is rejected', () => {
  // @ts-expect-error a 0x private key is not an account source
  toAccount(pk0x)
  // @ts-expect-error a bare-hex private key is not an account source
  toAccount(pkBare)
  const hex: Hex = pk0x
  // @ts-expect-error a `Hex` value is not an account source
  toAccount(hex)
  // @ts-expect-error a plain string is not an account source
  toAccount('' as string)
})

test('toAccount: custom-source branch → TronCustomAccount', () => {
  // Overload 2: `toAccount(source: TronCustomSource): TronCustomAccount`
  const source = {} as TronCustomSource
  expectTypeOf(toAccount(source)).toEqualTypeOf<TronCustomAccount>()

  // the custom branch is NOT the address branch
  expectTypeOf(toAccount(source)).not.toEqualTypeOf<JsonRpcAccount>()
})

test('toAccount: the two branches carry distinct `source` discriminants', () => {
  expectTypeOf<TronLocalAccount['source']>().toEqualTypeOf<'privateKey'>()
  expectTypeOf<TronCustomAccount['source']>().toEqualTypeOf<'custom'>()

  // both share the `type: 'local'` discriminant
  expectTypeOf<TronLocalAccount['type']>().toEqualTypeOf<'local'>()
  expectTypeOf<TronCustomAccount['type']>().toEqualTypeOf<'local'>()
})

test('toAccount: a custom account retains the signing surface; an address-only one does not', () => {
  const local = privateKeyToAccount(pk0x)
  const custom = toAccount({} as TronCustomSource)

  // key-backed and custom accounts expose the TronCustomSource surface
  expectTypeOf(local).toExtend<TronCustomSource>()
  expectTypeOf(custom).toExtend<TronCustomSource>()
  expectTypeOf(toAccount(pk1Address)).not.toExtend<TronCustomSource>()
})

test('toAccount: accepts a fully async source without casts', () => {
  const local = privateKeyToAccount(pk0x)
  const account = toAccount({
    address: local.address,
    publicKey: local.publicKey,
    signMessage: async (parameters) => local.signMessage(parameters),
    signTypedData: async (parameters) => local.signTypedData(parameters),
    signTransaction: async (transaction) => local.signTransaction(transaction),
    multiSign: async (transaction, options) =>
      local.multiSign(transaction, options),
  })
  expectTypeOf(account).toEqualTypeOf<TronCustomAccount>()

  // a mixed source (some sync, some async) is accepted too
  toAccount({
    address: local.address,
    publicKey: local.publicKey,
    signMessage: async (parameters) => local.signMessage(parameters),
    signTypedData: local.signTypedData,
    signTransaction: local.signTransaction,
  })
})

test('TronCustomAccount: signing methods return MaybePromise<...>', () => {
  expectTypeOf<TronCustomAccount['signMessage']>().returns.toEqualTypeOf<
    MaybePromise<Signature>
  >()
  expectTypeOf<TronCustomAccount['signTypedData']>().returns.toEqualTypeOf<
    MaybePromise<Signature>
  >()
  expectTypeOf<TronCustomAccount['signTransaction']>().returns.toEqualTypeOf<
    MaybePromise<SignableTransaction>
  >()
  expectTypeOf<
    NonNullable<TronCustomAccount['multiSign']>
  >().returns.toEqualTypeOf<MaybePromise<SignableTransaction>>()

  // awaiting always yields the plain result
  const account = toAccount({} as TronCustomSource)
  expectTypeOf(
    account.signMessage({} as AccountSignMessageParameters),
  ).resolves.toEqualTypeOf<Signature>()
  expectTypeOf(
    account.signTypedData({} as AccountSignTypedDataParameters),
  ).resolves.toEqualTypeOf<Signature>()
})

test('toAccount: a source resolving to the wrong type is rejected', () => {
  const local = privateKeyToAccount(pk0x)
  // Bound to `TronCustomSource` so the error lands on the offending member
  // rather than on the whole `toAccount` overload call.
  const badMessage: TronCustomSource = {
    address: local.address,
    publicKey: local.publicKey,
    // @ts-expect-error a signature is a `Signature`, not a hex string
    signMessage: async () => '0xdeadbeef',
    signTypedData: local.signTypedData,
    signTransaction: local.signTransaction,
  }
  const badTransaction: TronCustomSource = {
    address: local.address,
    publicKey: local.publicKey,
    signMessage: local.signMessage,
    signTypedData: local.signTypedData,
    // @ts-expect-error signTransaction must resolve to a transaction
    signTransaction: async () => 'signed',
  }
  toAccount(badMessage)
  toAccount(badTransaction)

  // inline, the whole call is rejected
  // @ts-expect-error no overload accepts a Promise<string> signer
  toAccount({
    address: local.address,
    publicKey: local.publicKey,
    signMessage: async () => '0xdeadbeef',
    signTypedData: local.signTypedData,
    signTransaction: local.signTransaction,
  })
})
