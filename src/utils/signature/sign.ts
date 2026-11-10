import { secp256k1 } from '@noble/curves/secp256k1'

import { BaseError, type BaseErrorType } from '../../errors/base.js'
import type { ErrorType } from '../../errors/utils.js'
import type { ByteArray, Hex } from '../../types/misc.js'
import { type HexToBytesErrorType, hexToBytes } from '../encoding/toBytes.js'

/** A secp256k1 signature in TRON wire form (`r(32) ++ s(32) ++ v(1)`). */
export type Signature = {
  /** `0x`-prefixed 32-byte `r` component. */
  r: Hex
  /** `0x`-prefixed 32-byte `s` component. */
  s: Hex
  /** Recovery id offset into the Ethereum range: `27 | 28`. */
  v: number
  /** Recovery id: `0 | 1`. */
  yParity: number
  /** Recovery id: `0 | 1`. Same value as `yParity`. */
  recovery: number
  /**
   * TRON `transaction.signature[]` form: bare lowercase hex
   * `r(32) ++ s(32) ++ v(1)` (130 chars, no `0x` prefix).
   */
  hex: string
  /** `0x`-prefixed `r(32) ++ s(32) ++ v(1)` (65 bytes). */
  serialized: Hex
}

export type SerializeSignatureErrorType = BaseErrorType | ErrorType

/** Exactly 32 bytes of hex, or a structured error naming the component. */
function componentHex(name: 'r' | 's', value: Hex): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value
  if (!/^[0-9a-fA-F]{64}$/.test(clean))
    throw new BaseError(
      `Invalid signature ${name}: expected 32 bytes of hex, got "${value}".`,
    )
  return clean
}

/** Signature components accepted by {@link serializeSignature}. */
export type SerializeSignatureParameters = {
  /** `0x`-prefixed 32-byte `r` component. */
  r: Hex
  /** `0x`-prefixed 32-byte `s` component. */
  s: Hex
  /** Recovery id offset into the Ethereum range: `27 | 28`. */
  v?: number | bigint | undefined
  /** Recovery id: `0 | 1`. Used when `v` is absent. */
  yParity?: number | undefined
}

/**
 * Serializes the `r`, `s` and recovery components into the `0x`-prefixed TRON
 * wire form `r(32) ++ s(32) ++ v(1)` (65 bytes). Each component is required in
 * the exact width the wire form carries — a shorter `r`/`s` is rejected rather
 * than zero-padded, since a short value cannot be told apart from a truncated
 * one. The recovery id is taken from `v` (`27 | 28`, as a number or bigint) or,
 * when `v` is absent, from `yParity` (`0 | 1`).
 *
 * @param signature Signature components.
 * @returns `0x`-prefixed 65-byte signature.
 */
export function serializeSignature({
  r,
  s,
  v,
  yParity,
}: SerializeSignatureParameters): Hex {
  const vByte = (() => {
    if (v !== undefined) {
      const n = Number(v)
      if (n !== 27 && n !== 28)
        throw new BaseError(`Invalid v: ${v}. Expected 27 or 28.`)
      return n
    }
    if (yParity === 0 || yParity === 1) return yParity + 27
    throw new BaseError(
      `Invalid yParity: ${yParity}. Expected 0 or 1 (or a v of 27 or 28).`,
    )
  })()
  return `0x${componentHex('r', r)}${componentHex('s', s)}${vByte.toString(16)}` as Hex
}

export type ParseSignatureErrorType = BaseErrorType | ErrorType

/**
 * Splits a 65-byte `r(32) ++ s(32) ++ v(1)` signature into its components. The
 * input may be `0x`-prefixed or bare hex (the form a transaction's
 * `signature[]` carries). The recovery byte is accepted as `27 | 28` or as a
 * bare `0 | 1`.
 *
 * @param signature 65-byte signature hex.
 * @returns The {@link Signature} components.
 */
export function parseSignature(signature: Hex | string): Signature {
  const clean = signature.startsWith('0x') ? signature.slice(2) : signature
  if (!/^[0-9a-fA-F]{130}$/.test(clean))
    throw new BaseError(
      `Invalid signature hex: expected 130 hex characters (r ++ s ++ v), got ${clean.length}.`,
    )
  const r = `0x${clean.slice(0, 64).toLowerCase()}` as Hex
  const s = `0x${clean.slice(64, 128).toLowerCase()}` as Hex
  const vByte = Number.parseInt(clean.slice(128), 16)
  const yParity = (() => {
    if (vByte === 0 || vByte === 1) return vByte
    if (vByte === 27 || vByte === 28) return vByte - 27
    throw new BaseError(
      `Invalid recovery value: ${vByte}. Expected 0, 1, 27 or 28.`,
    )
  })()
  return toSignature(r, s, yParity)
}

/** Builds the {@link Signature} object from components. */
function toSignature(r: Hex, s: Hex, yParity: number): Signature {
  const v = yParity + 27
  const serialized = serializeSignature({ r, s, v })
  return {
    r,
    s,
    v,
    yParity,
    recovery: yParity,
    hex: serialized.slice(2),
    serialized,
  }
}

/** Output form of {@link sign}. */
export type SignTo = 'object' | 'hex' | 'bytes'

export type SignParameters<to extends SignTo = 'object'> = {
  /** The 32-byte digest to sign, as `0x`-prefixed hex or bytes. */
  hash: Hex | ByteArray
  /** The secp256k1 private key, as `0x`-prefixed or bare hex. */
  privateKey: Hex | string
  /**
   * Extra entropy for the (otherwise RFC 6979-deterministic) nonce. Pass `true`
   * for secure randomness, or explicit bytes/hex. Omit for a deterministic
   * signature (the TRON default).
   */
  extraEntropy?: Hex | ByteArray | boolean | undefined
  /**
   * Output form: the {@link Signature} components (`'object'`, default), the
   * `0x`-prefixed 65-byte hex (`'hex'`), or the 65 raw bytes (`'bytes'`).
   */
  to?: to | SignTo | undefined
}

export type SignReturnType<to extends SignTo = 'object'> =
  | (to extends 'object' ? Signature : never)
  | (to extends 'hex' ? Hex : never)
  | (to extends 'bytes' ? ByteArray : never)

export type SignErrorType = BaseErrorType | HexToBytesErrorType | ErrorType

/**
 * Signs a 32-byte digest with a secp256k1 private key, producing a TRON-form
 * signature (`r(32) ++ s(32) ++ v(1)`, `v ∈ {27, 28}`).
 *
 * The digest is signed as-is (never re-hashed); nonces are RFC 6979
 * deterministic with canonical low-`s`, matching TronWeb's `ECKeySign`.
 *
 * @param parameters Hash, private key and optional extra entropy.
 * @returns The signature, exposing `r`/`s`/`v`/`recovery`, the bare `hex` wire
 * form and the `0x`-prefixed `serialized` form.
 *
 * @example
 * sign({ hash: '0x407ec7...', privateKey: '0x00...01' }).hex
 * // '4d6f1e...ae001c'
 */
export function sign<to extends SignTo = 'object'>({
  hash,
  privateKey,
  extraEntropy,
  to = 'object',
}: SignParameters<to>): SignReturnType<to> {
  const hashBytes = typeof hash === 'string' ? hexToBytes(hash) : hash
  if (hashBytes.length !== 32)
    throw new BaseError(
      `Invalid hash length: ${hashBytes.length} bytes. Expected a 32-byte digest.`,
    )

  const keyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey

  // The advertised hex form is decoded here — noble rejects 0x-prefixed hex.
  const entropy =
    typeof extraEntropy === 'string' ? hexToBytes(extraEntropy) : extraEntropy

  const { r, s, recovery } = secp256k1.sign(
    hashBytes,
    keyHex,
    entropy !== undefined ? { extraEntropy: entropy } : {},
  )

  const rHex = `0x${r.toString(16).padStart(64, '0')}` as Hex
  const sHex = `0x${s.toString(16).padStart(64, '0')}` as Hex
  const signature = toSignature(rHex, sHex, recovery)

  return (() => {
    if (to === 'hex') return signature.serialized
    if (to === 'bytes') return hexToBytes(signature.serialized)
    return signature
  })() as SignReturnType<to>
}
