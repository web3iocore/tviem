import { expectTypeOf, test } from 'vitest'
import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js'
import type {
  AccountSignMessageParameters,
  AccountSignTypedDataParameters,
  SignableTransaction,
  TronLocalAccount,
} from '../../src/accounts/types.js'
import type { Address } from '../../src/types/address.js'
import type { Hex, SignableMessage } from '../../src/types/misc.js'
import type { MaybePromise } from '../../src/types/utils.js'
import type { Signature } from '../../src/utils/signature/sign.js'

// pk=1, in both accepted input forms.
const pk0x =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const pkBare =
  '0000000000000000000000000000000000000000000000000000000000000001'

test('privateKeyToAccount: parameter accepts 0x-prefixed and bare hex', () => {
  // `Hex | string` collapses to `string`, so both forms are assignable.
  expectTypeOf(privateKeyToAccount).parameter(0).toEqualTypeOf<Hex | string>()
  expectTypeOf<Hex>().toExtend<Parameters<typeof privateKeyToAccount>[0]>()
  expectTypeOf<string>().toExtend<Parameters<typeof privateKeyToAccount>[0]>()
})

test('privateKeyToAccount: returns a TronLocalAccount for either input form', () => {
  expectTypeOf(privateKeyToAccount(pk0x)).toEqualTypeOf<TronLocalAccount>()
  expectTypeOf(privateKeyToAccount(pkBare)).toEqualTypeOf<TronLocalAccount>()
  expectTypeOf(privateKeyToAccount).returns.toEqualTypeOf<TronLocalAccount>()
})

test('privateKeyToAccount: address / publicKey field types', () => {
  const account = privateKeyToAccount(pk0x)

  expectTypeOf(account.address).toEqualTypeOf<Address>()
  expectTypeOf(account.publicKey).toEqualTypeOf<Hex>()

  // discriminants
  expectTypeOf(account.source).toEqualTypeOf<'privateKey'>()
  expectTypeOf(account.type).toEqualTypeOf<'local'>()
})

test('privateKeyToAccount: no raw-digest sign on the account surface', () => {
  const account = privateKeyToAccount(pk0x)
  // Blind signing is unsupported: the account exposes no `sign({ hash })`.
  expectTypeOf<keyof typeof account>().not.toEqualTypeOf<'sign'>()
  // @ts-expect-error — `sign` does not exist on TronLocalAccount.
  account.sign
})

test('privateKeyToAccount: signMessage method signature', () => {
  const account = privateKeyToAccount(pk0x)

  expectTypeOf(account.signMessage).toEqualTypeOf<
    (parameters: AccountSignMessageParameters) => MaybePromise<Signature>
  >()
  expectTypeOf(account.signMessage)
    .parameter(0)
    .toEqualTypeOf<AccountSignMessageParameters>()
  expectTypeOf(account.signMessage).returns.toEqualTypeOf<
    MaybePromise<Signature>
  >()
  expectTypeOf<
    Awaited<ReturnType<typeof account.signMessage>>
  >().toEqualTypeOf<Signature>()

  // the message input is the `SignableMessage` union
  expectTypeOf<
    AccountSignMessageParameters['message']
  >().toEqualTypeOf<SignableMessage>()
})

test('privateKeyToAccount: signTypedData method signature', () => {
  const account = privateKeyToAccount(pk0x)

  expectTypeOf(account.signTypedData).toEqualTypeOf<
    (parameters: AccountSignTypedDataParameters) => MaybePromise<Signature>
  >()
  expectTypeOf(account.signTypedData)
    .parameter(0)
    .toEqualTypeOf<AccountSignTypedDataParameters>()
  expectTypeOf(account.signTypedData).returns.toEqualTypeOf<
    MaybePromise<Signature>
  >()
  expectTypeOf<
    Awaited<ReturnType<typeof account.signTypedData>>
  >().toEqualTypeOf<Signature>()
})

test('privateKeyToAccount: signTransaction method signature', () => {
  const account = privateKeyToAccount(pk0x)

  expectTypeOf(account.signTransaction).toEqualTypeOf<
    (transaction: SignableTransaction) => MaybePromise<SignableTransaction>
  >()
  expectTypeOf(account.signTransaction)
    .parameter(0)
    .toEqualTypeOf<SignableTransaction>()
  expectTypeOf(account.signTransaction).returns.toEqualTypeOf<
    MaybePromise<SignableTransaction>
  >()
  expectTypeOf<
    Awaited<ReturnType<typeof account.signTransaction>>
  >().toEqualTypeOf<SignableTransaction>()
})

test('privateKeyToAccount: returned Signature shape (r/s/v/hex/serialized)', async () => {
  const sig = await privateKeyToAccount(pk0x).signMessage({ message: 'gm' })

  expectTypeOf(sig).toEqualTypeOf<Signature>()
  expectTypeOf(sig.r).toEqualTypeOf<Hex>()
  expectTypeOf(sig.s).toEqualTypeOf<Hex>()
  expectTypeOf(sig.v).toEqualTypeOf<number>()
  expectTypeOf(sig.recovery).toEqualTypeOf<number>()
  expectTypeOf(sig.hex).toEqualTypeOf<string>()
  expectTypeOf(sig.serialized).toEqualTypeOf<Hex>()
})

test('privateKeyToAccount: multiSign is typed MaybePromise; awaited is the transaction', () => {
  const account = privateKeyToAccount(pk0x)
  expectTypeOf(account.multiSign).returns.toEqualTypeOf<
    MaybePromise<SignableTransaction>
  >()
  expectTypeOf<
    Awaited<ReturnType<typeof account.multiSign>>
  >().toEqualTypeOf<SignableTransaction>()
})
