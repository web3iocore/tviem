import { expectTypeOf, test } from 'vitest'

import type { Address } from '../../../src/types/address.js'
import type {
  ByteArray,
  Hex,
  SignableMessage,
} from '../../../src/types/misc.js'
import {
  parseSignature,
  type Signature,
  type SignParameters,
  type SignTo,
  serializeSignature,
  sign,
} from '../../../src/utils/signature/sign.js'
import {
  type SignMessageParameters,
  signMessage,
} from '../../../src/utils/signature/signMessage.js'
import { signTypedData } from '../../../src/utils/signature/signTypedData.js'
import {
  type RecoverMessageAddressParameters,
  recoverMessageAddress,
  type VerifyMessageParameters,
  verifyMessage,
} from '../../../src/utils/signature/verifyMessage.js'

test('sign: parameter shape — hash is Hex | ByteArray', () => {
  expectTypeOf(sign).parameter(0).toEqualTypeOf<SignParameters<SignTo>>()
  expectTypeOf<SignParameters['to']>().toEqualTypeOf<SignTo | undefined>()
  expectTypeOf<SignParameters['hash']>().toEqualTypeOf<Hex | ByteArray>()

  // both digest input forms are accepted
  expectTypeOf<Hex>().toExtend<SignParameters['hash']>()
  expectTypeOf<ByteArray>().toExtend<SignParameters['hash']>()

  // private key accepts 0x-prefixed or bare hex
  expectTypeOf<SignParameters['privateKey']>().toEqualTypeOf<Hex | string>()
})

test('sign: returns the TRON Signature (exactly r/s/v/yParity)', () => {
  const sig = sign({
    hash: '0x0000000000000000000000000000000000000000000000000000000000000001',
    privateKey:
      '0x0000000000000000000000000000000000000000000000000000000000000001',
  })

  expectTypeOf(sig).toEqualTypeOf<Signature>()
  // `to` selects the output form (as in viem's sign).
  const params = { hash: sig.r, privateKey: sig.r } as const
  expectTypeOf(sign({ ...params, to: 'object' })).toEqualTypeOf<Signature>()
  expectTypeOf(sign({ ...params, to: 'hex' })).toEqualTypeOf<Hex>()
  expectTypeOf(sign({ ...params, to: 'bytes' })).toEqualTypeOf<ByteArray>()
  expectTypeOf(parseSignature).returns.toEqualTypeOf<Signature>()
  expectTypeOf(serializeSignature).returns.toEqualTypeOf<Hex>()
  // The object form is directly serializable.
  expectTypeOf(sig).toExtend<Parameters<typeof serializeSignature>[0]>()

  // Signature is exactly { r, s, v, yParity }.
  expectTypeOf<Signature>().toEqualTypeOf<{
    r: Hex
    s: Hex
    v: number
    yParity: number
  }>()
  expectTypeOf<keyof Signature>().toEqualTypeOf<'r' | 's' | 'v' | 'yParity'>()
  expectTypeOf<Signature['r']>().toEqualTypeOf<Hex>()
  expectTypeOf<Signature['s']>().toEqualTypeOf<Hex>()
  expectTypeOf<Signature['v']>().toEqualTypeOf<number>()
  expectTypeOf<Signature['yParity']>().toEqualTypeOf<number>()

  // The pre-RC fields are gone: the bare `hex`, the `serialized` Hex and the
  // `recovery` alias of `yParity`. Use `to: 'hex'` / serializeSignature /
  // `.yParity` instead.
  // @ts-expect-error — `hex` was removed from Signature
  sig.hex
  // @ts-expect-error — `serialized` was removed from Signature
  sig.serialized
  // @ts-expect-error — `recovery` was removed from Signature (use yParity)
  sig.recovery
  // @ts-expect-error — `hex` is not a key of Signature
  type _Hex = Signature['hex']
  // @ts-expect-error — `serialized` is not a key of Signature
  type _Serialized = Signature['serialized']
  // @ts-expect-error — `recovery` is not a key of Signature
  type _Recovery = Signature['recovery']
})

test('signMessage: message is the SignableMessage (string | { raw }) union', () => {
  expectTypeOf(signMessage).parameter(0).toEqualTypeOf<SignMessageParameters>()
  expectTypeOf<
    SignMessageParameters['message']
  >().toEqualTypeOf<SignableMessage>()

  expectTypeOf<SignableMessage>().toEqualTypeOf<
    string | { raw: Hex | ByteArray }
  >()

  // both arms of the union are accepted
  expectTypeOf<string>().toExtend<SignableMessage>()
  expectTypeOf<{ raw: Hex }>().toExtend<SignableMessage>()
  expectTypeOf<{ raw: ByteArray }>().toExtend<SignableMessage>()
})

test('signMessage / signTypedData: return the 0x-prefixed 65-byte Hex', () => {
  // The TronWeb / TronLink form — not the Signature object.
  expectTypeOf(signMessage).returns.toEqualTypeOf<Hex>()
  expectTypeOf(signTypedData).returns.toEqualTypeOf<Hex>()
  expectTypeOf(signMessage).returns.not.toEqualTypeOf<Signature>()
  expectTypeOf(signTypedData).returns.not.toEqualTypeOf<Signature>()

  // Equal to the `to: 'hex'` form of sign, and splittable by parseSignature.
  const sig = signMessage({
    message: 'hello',
    privateKey:
      '0x0000000000000000000000000000000000000000000000000000000000000001',
  })
  expectTypeOf(sig).toEqualTypeOf<ReturnType<typeof sign<'hex'>>>()
  expectTypeOf(parseSignature(sig)).toEqualTypeOf<Signature>()
  // and it is accepted by the verify/recover helpers as-is
  expectTypeOf(sig).toExtend<VerifyMessageParameters['signature']>()
  expectTypeOf(sig).toExtend<RecoverMessageAddressParameters['signature']>()

  // @ts-expect-error — the Hex has no `serialized` (it *is* the serialized form)
  sig.serialized
  // @ts-expect-error — the Hex has no `r` component; use parseSignature(sig).r
  sig.r
})

test('verifyMessage: returns boolean', () => {
  expectTypeOf(verifyMessage)
    .parameter(0)
    .toEqualTypeOf<VerifyMessageParameters>()
  expectTypeOf(verifyMessage).returns.toEqualTypeOf<boolean>()

  // the message arg is a SignableMessage
  expectTypeOf<
    VerifyMessageParameters['message']
  >().toEqualTypeOf<SignableMessage>()
})

test('recoverMessageAddress: returns a Base58Check Address', () => {
  expectTypeOf(recoverMessageAddress)
    .parameter(0)
    .toEqualTypeOf<RecoverMessageAddressParameters>()
  expectTypeOf(recoverMessageAddress).returns.toEqualTypeOf<Address>()

  expectTypeOf<
    RecoverMessageAddressParameters['message']
  >().toEqualTypeOf<SignableMessage>()
})
