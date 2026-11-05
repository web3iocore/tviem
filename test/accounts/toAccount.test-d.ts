import { expectTypeOf, test } from 'vitest'
import { toAccount } from '../../src/accounts/toAccount.js'
import type {
  AccountSignMessageParameters,
  AccountSignTypedDataParameters,
  SignableTransaction,
  TronCustomAccount,
  TronCustomSource,
  TronLocalAccount,
} from '../../src/accounts/types.js'
import type { Hex } from '../../src/types/misc.js'
import type { MaybePromise } from '../../src/types/utils.js'
import type { Signature } from '../../src/utils/signature/sign.js'

// pk=1, in both accepted input forms.
const pk0x =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const pkBare =
  '0000000000000000000000000000000000000000000000000000000000000001'

test('toAccount: hex private-key branch → TronLocalAccount', () => {
  // Overload 1: `toAccount(source: Hex | string): TronLocalAccount`
  expectTypeOf(toAccount(pk0x)).toEqualTypeOf<TronLocalAccount>()
  expectTypeOf(toAccount(pkBare)).toEqualTypeOf<TronLocalAccount>()

  // a `Hex`-branded literal also selects the private-key overload
  const hex: Hex = pk0x
  expectTypeOf(toAccount(hex)).toEqualTypeOf<TronLocalAccount>()

  // the private-key branch is NOT the custom branch
  expectTypeOf(toAccount(pk0x)).not.toEqualTypeOf<TronCustomAccount>()
})

test('toAccount: custom-source branch → TronCustomAccount', () => {
  // Overload 2: `toAccount(source: TronCustomSource): TronCustomAccount`
  const source = {} as TronCustomSource
  expectTypeOf(toAccount(source)).toEqualTypeOf<TronCustomAccount>()

  // the custom branch is NOT the private-key branch
  expectTypeOf(toAccount(source)).not.toEqualTypeOf<TronLocalAccount>()
})

test('toAccount: the two branches carry distinct `source` discriminants', () => {
  expectTypeOf<TronLocalAccount['source']>().toEqualTypeOf<'privateKey'>()
  expectTypeOf<TronCustomAccount['source']>().toEqualTypeOf<'custom'>()

  // both share the `type: 'local'` discriminant
  expectTypeOf<TronLocalAccount['type']>().toEqualTypeOf<'local'>()
  expectTypeOf<TronCustomAccount['type']>().toEqualTypeOf<'local'>()
})

test('toAccount: both returns retain the shared signing surface', () => {
  const local = toAccount(pk0x)
  const custom = toAccount({} as TronCustomSource)

  // both expose the TronCustomSource surface
  expectTypeOf(local).toExtend<TronCustomSource>()
  expectTypeOf(custom).toExtend<TronCustomSource>()
})

test('toAccount: accepts a fully async source without casts', () => {
  const local = toAccount(pk0x)
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
  const local = toAccount(pk0x)
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
