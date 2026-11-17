import { afterEach, describe, expect, test, vi } from 'vitest'

import { privateKeyToAccount } from '../../src/accounts/privateKeyToAccount.js'
import { toAccount } from '../../src/accounts/toAccount.js'
import type { TronCustomSource } from '../../src/accounts/types.js'
import { InvalidAddressError } from '../../src/errors/address.js'
import { InvalidParameterError } from '../../src/errors/parameter.js'
import { decodeRawData } from '../../src/utils/transaction/decodeRawData.js'
import { loadTxFixtures } from '../fixtures/tx/loader.js'

// Only pk=1 is a permitted trivial private key.
const pk1 = '0x0000000000000000000000000000000000000000000000000000000000000001'
const pk1Address = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'
// §2.3 canonical transaction id and its pk=1 signature.
const txID = '407ec75dad4545890e5788ef78555ecab9dc72d56df29da4ebbd508022bdbaba'
const canonicalSig =
  '4d6f1e54ea593e5118c2d1b3701a4cab4d5235a418e9e46dba8c5f033bc4af0f6c04a08241de23936dffdedc869eac45533f9479a6bf372a38382b168b65ae001c'
// TronWeb-verified TIP-191 signature of 'hello world' under pk=1.
const helloWorldSig =
  '0x0dc0b53d525e0103a6013061cf18e60cf158809149f2b8994a545af65a7004cb1eeaff560e801ab51b28df5d42549aa024c2aa7e9d34de1e01294b9afb5e6c7e1c'

const canonicalTransaction = () => {
  const fixture = loadTxFixtures().find((f) => f.txID === txID)
  if (!fixture) throw new Error('canonical fixture missing')
  return {
    txID: fixture.txID,
    raw_data: decodeRawData(fixture.rawDataHex),
    raw_data_hex: fixture.rawDataHex,
  }
}

describe('toAccount', () => {
  test('from a Base58Check address: an address-only json-rpc account', () => {
    const account = toAccount(pk1Address)
    expect(account).toEqual({ address: pk1Address, type: 'json-rpc' })
    // Address-only: no signing surface, no `source` discriminant.
    expect('signMessage' in account).toBe(false)
    expect('signTransaction' in account).toBe(false)
    expect('source' in account).toBe(false)
  })

  test('from a private-key string (0x or bare hex): refused without echoing the key', () => {
    for (const key of [pk1, pk1.slice(2)]) {
      let caught: unknown
      try {
        toAccount(key as never)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(InvalidAddressError)
      const { message } = caught as Error
      expect(message).not.toContain(key)
      expect(message).not.toContain(key.slice(0, 6))
      expect(message).toContain('privateKeyToAccount')
    }
  })

  test('a private key still works through privateKeyToAccount + toAccount(source)', async () => {
    const account = toAccount(privateKeyToAccount(pk1))
    expect(account.address).toBe(pk1Address)
    expect(await account.signMessage({ message: 'hello world' })).toBe(
      helloWorldSig,
    )
    // No raw-digest signer: blind signing is not part of the account surface.
    expect('sign' in account).toBe(false)
  })

  test('from a custom source: completes to a custom local account', () => {
    const base = privateKeyToAccount(pk1)
    const source: TronCustomSource = {
      address: base.address,
      publicKey: base.publicKey,
      signMessage: base.signMessage,
      signTypedData: base.signTypedData,
      signTransaction: base.signTransaction,
    }
    const account = toAccount(source)
    expect(account.source).toBe('custom')
    expect(account.type).toBe('local')
    expect(account.address).toBe(pk1Address)
    expect(account.publicKey).toBe(base.publicKey)
  })

  test('a custom account delegates signing to the supplied functions', async () => {
    const base = privateKeyToAccount(pk1)
    const account = toAccount({
      address: base.address,
      publicKey: base.publicKey,
      signMessage: base.signMessage,
      signTypedData: base.signTypedData,
      signTransaction: base.signTransaction,
    })
    expect(await account.signMessage({ message: 'hello world' })).toBe(
      helloWorldSig,
    )
    const signed = await account.signTransaction(canonicalTransaction())
    expect(signed.txID).toBe(txID)
    expect(signed.signature).toEqual([canonicalSig])
  })

  test('a class-instance source keeps the signing methods on its prototype', async () => {
    // The natural shape of a wallet adapter: state on the instance (here a
    // private field), signing methods on the prototype, reaching that state
    // through `this`. Copying only own properties drops every method; copying
    // the bare functions would call them with the wrong `this`.
    class Signer {
      readonly #inner = privateKeyToAccount(pk1)
      readonly address = this.#inner.address
      readonly publicKey = this.#inner.publicKey
      signMessage(parameters: Parameters<TronCustomSource['signMessage']>[0]) {
        return this.#inner.signMessage(parameters)
      }
      signTypedData(
        parameters: Parameters<TronCustomSource['signTypedData']>[0],
      ) {
        return this.#inner.signTypedData(parameters)
      }
      signTransaction(
        transaction: Parameters<TronCustomSource['signTransaction']>[0],
      ) {
        return this.#inner.signTransaction(transaction)
      }
      multiSign(
        ...args: Parameters<NonNullable<TronCustomSource['multiSign']>>
      ) {
        return this.#inner.multiSign(...args)
      }
    }

    const account = toAccount(new Signer())

    expect(account.address).toBe(pk1Address)
    expect(await account.signMessage({ message: 'hello world' })).toBe(
      helloWorldSig,
    )
    expect(
      (await account.signTransaction(canonicalTransaction())).signature,
    ).toEqual([canonicalSig])
    expect(account.multiSign).toBeTypeOf('function')
  })

  test("carries exactly the account surface, not the source's other properties", () => {
    const base = privateKeyToAccount(pk1)
    const account = toAccount({
      address: base.address,
      publicKey: base.publicKey,
      signMessage: base.signMessage,
      signTypedData: base.signTypedData,
      signTransaction: base.signTransaction,
      // Not part of `TronCustomSource`: a signer's private state must not
      // ride along into an object that gets passed around as "the account".
      privateKey: pk1,
    } as TronCustomSource)

    expect(Object.keys(account).sort()).toEqual([
      'address',
      'publicKey',
      'signMessage',
      'signTransaction',
      'signTypedData',
      'source',
      'type',
    ])
  })

  test('throws on an invalid source (no address)', () => {
    expect(() => toAccount({} as never)).toThrow()
  })

  test('an invalid source throws an InvalidParameterError for `source`', () => {
    for (const source of [{}, null, { address: 42 }]) {
      let caught: unknown
      try {
        toAccount(source as never)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(InvalidParameterError)
      expect(caught).toMatchObject({
        name: 'InvalidParameterError',
        param: 'source',
        reason: 'type',
        shortMessage:
          'Invalid account source: expected a Base58Check address or a custom source with an `address`.',
      })
    }
  })

  describe('a custom source must be able to sign', () => {
    const fullSource = (): TronCustomSource => {
      const base = privateKeyToAccount(pk1)
      return {
        address: base.address,
        publicKey: base.publicKey,
        signMessage: base.signMessage,
        signTypedData: base.signTypedData,
        signTransaction: base.signTransaction,
      }
    }

    for (const method of [
      'signMessage',
      'signTypedData',
      'signTransaction',
    ] as const) {
      test(`pins the validated \`${method}\` from its first read`, () => {
        const source = fullSource()
        const signer = vi.fn(function (this: TronCustomSource) {
          return this.address
        })
        const getter = vi.fn().mockReturnValueOnce(signer)
        Object.defineProperty(source, method, { get: getter })

        const account = toAccount(source)
        const parameters = {} as never
        expect(account[method](parameters)).toBe(pk1Address)
        expect(getter).toHaveBeenCalledTimes(1)
        expect(signer).toHaveBeenCalledExactlyOnceWith(parameters)
      })

      test(`missing \`${method}\` throws naming the method`, () => {
        const { [method]: _omitted, ...rest } = fullSource()
        expect(() => toAccount(rest as TronCustomSource)).toThrow(
          `Invalid account source: \`${method}\` must be a function`,
        )
      })

      test(`a non-function \`${method}\` throws naming the method`, () => {
        const source = { ...fullSource(), [method]: 'nope' }
        expect(() => toAccount(source as unknown as TronCustomSource)).toThrow(
          `Invalid account source: \`${method}\` must be a function`,
        )
      })

      test(`a non-function \`${method}\` throws an InvalidParameterError for \`source.${method}\``, () => {
        const source = { ...fullSource(), [method]: 'nope' }
        let caught: unknown
        try {
          toAccount(source as unknown as TronCustomSource)
        } catch (error) {
          caught = error
        }
        expect(caught).toBeInstanceOf(InvalidParameterError)
        expect(caught).toMatchObject({
          name: 'InvalidParameterError',
          param: `source.${method}`,
          reason: 'type',
        })
      })
    }

    test('an address-only object { address, type: json-rpc } is refused', () => {
      expect(() =>
        toAccount({
          address: pk1Address,
          type: 'json-rpc',
        } as unknown as TronCustomSource),
      ).toThrow(
        'Invalid account source: `signMessage` must be a function. For an address-only account, pass the address string instead.',
      )
    })

    test('a source without multiSign still works', () => {
      const account = toAccount(fullSource())
      expect(account.source).toBe('custom')
      expect(account.type).toBe('local')
      expect(account.address).toBe(pk1Address)
      expect(account.multiSign).toBeUndefined()
    })
  })
})

test('pins the address it type-checked, not a later read', () => {
  // `address` is read once: a second read while building the account would
  // let an accessor hand it an address the guard never saw.
  let reads = 0
  const source = {
    get address() {
      reads++
      return reads === 1 ? 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC' : 12345
    },
    signMessage: (() => {}) as never,
    signTypedData: (() => {}) as never,
    signTransaction: (() => {}) as never,
  } as unknown as TronCustomSource
  const account = toAccount(source)
  expect(account.address).toBe('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC')
})

describe('toAccount: sync / async custom-source compatibility', () => {
  const typedData = {
    domain: { name: 'Example', version: '1', chainId: 728126428n },
    types: { Msg: [{ name: 'text', type: 'string' }] },
    primaryType: 'Msg',
    message: { text: 'hi' },
  } as const

  /** A source whose every method resolves on a later microtask. */
  const asyncSourceOf = (
    base: ReturnType<typeof privateKeyToAccount>,
  ): TronCustomSource => ({
    address: base.address,
    publicKey: base.publicKey,
    signMessage: async (parameters) => base.signMessage(parameters),
    signTypedData: async (parameters) => base.signTypedData(parameters),
    signTransaction: async (transaction) => base.signTransaction(transaction),
    multiSign: async (transaction, options) =>
      base.multiSign(transaction, options),
  })

  const unhandled = vi.fn()
  afterEach(() => {
    process.off('unhandledRejection', unhandled)
    unhandled.mockReset()
  })
  const watchUnhandled = () => process.on('unhandledRejection', unhandled)
  const flushMacrotask = () => new Promise((r) => setTimeout(r, 0))

  test('a sync source stays synchronous: results are returned, not Promises', () => {
    const base = privateKeyToAccount(pk1)
    const account = toAccount({
      address: base.address,
      publicKey: base.publicKey,
      signMessage: base.signMessage,
      signTypedData: base.signTypedData,
      signTransaction: base.signTransaction,
      multiSign: base.multiSign,
    })

    const message = account.signMessage({ message: 'hello world' })
    const typed = account.signTypedData(typedData)
    const tx = account.signTransaction(canonicalTransaction())
    const multi = account.multiSign!(canonicalTransaction())
    for (const result of [message, typed, tx, multi])
      expect(result).not.toBeInstanceOf(Promise)

    // Byte-for-byte what the key-backed account itself returns.
    expect(message).toEqual(base.signMessage({ message: 'hello world' }))
    expect(message).toBe(helloWorldSig)
    expect(typed).toEqual(base.signTypedData(typedData))
    expect(tx).toEqual(base.signTransaction(canonicalTransaction()))
    expect((tx as Awaited<typeof tx>).signature).toEqual([canonicalSig])
    expect(multi).toEqual(base.multiSign(canonicalTransaction()))
  })

  test('a fully async source resolves to the same results as a sync one', async () => {
    const base = privateKeyToAccount(pk1)
    const account = toAccount(asyncSourceOf(base))

    const message = account.signMessage({ message: 'hello world' })
    expect(message).toBeInstanceOf(Promise)
    expect(await message).toEqual(
      await base.signMessage({ message: 'hello world' }),
    )
    expect(await message).toBe(helloWorldSig)
    expect(await account.signTypedData(typedData)).toEqual(
      await base.signTypedData(typedData),
    )
    const signed = await account.signTransaction(canonicalTransaction())
    expect(signed.txID).toBe(txID)
    expect(signed.signature).toEqual([canonicalSig])
    expect(signed).toEqual(await base.signTransaction(canonicalTransaction()))
  })

  test('a mixed source (some methods async, some sync) works method by method', async () => {
    const base = privateKeyToAccount(pk1)
    const account = toAccount({
      address: base.address,
      publicKey: base.publicKey,
      signMessage: async (parameters) => base.signMessage(parameters),
      signTypedData: base.signTypedData,
      signTransaction: base.signTransaction,
    })

    const message = account.signMessage({ message: 'hello world' })
    expect(message).toBeInstanceOf(Promise)
    expect(await message).toBe(helloWorldSig)

    const tx = account.signTransaction(canonicalTransaction())
    expect(tx).not.toBeInstanceOf(Promise)
    expect((await tx).signature).toEqual([canonicalSig])
    expect(await account.signTypedData(typedData)).toEqual(
      await base.signTypedData(typedData),
    )
  })

  test('an async multiSign resolves to the same co-signed transaction', async () => {
    const base = privateKeyToAccount(pk1)
    const account = toAccount(asyncSourceOf(base))
    const unsigned = canonicalTransaction()

    const pending = account.multiSign!(unsigned, { permissionId: 2 })
    expect(pending).toBeInstanceOf(Promise)
    const signed = await pending
    expect(signed).toEqual(
      await base.multiSign(canonicalTransaction(), { permissionId: 2 }),
    )
    expect(signed.signature).toHaveLength(1)
  })

  test('a class-based async source keeps `this` across awaits', async () => {
    class AsyncSigner {
      readonly #inner = privateKeyToAccount(pk1)
      readonly address = this.#inner.address
      readonly publicKey = this.#inner.publicKey
      calls: string[] = []
      async #tick() {
        await new Promise((r) => setTimeout(r, 0))
      }
      async signMessage(
        parameters: Parameters<TronCustomSource['signMessage']>[0],
      ) {
        await this.#tick()
        this.calls.push('signMessage')
        return this.#inner.signMessage(parameters)
      }
      async signTypedData(
        parameters: Parameters<TronCustomSource['signTypedData']>[0],
      ) {
        await this.#tick()
        this.calls.push('signTypedData')
        return this.#inner.signTypedData(parameters)
      }
      async signTransaction(
        transaction: Parameters<TronCustomSource['signTransaction']>[0],
      ) {
        await this.#tick()
        this.calls.push('signTransaction')
        return this.#inner.signTransaction(transaction)
      }
      async multiSign(
        ...args: Parameters<NonNullable<TronCustomSource['multiSign']>>
      ) {
        await this.#tick()
        this.calls.push('multiSign')
        return this.#inner.multiSign(...args)
      }
    }

    const signer = new AsyncSigner()
    const account = toAccount(signer)
    const { signMessage, signTransaction, multiSign } = account

    // Detached from the account object: still bound to the signer.
    expect(await signMessage({ message: 'hello world' })).toBe(helloWorldSig)
    expect(await account.signTypedData(typedData)).toBe(
      await privateKeyToAccount(pk1).signTypedData(typedData),
    )
    expect((await signTransaction(canonicalTransaction())).signature).toEqual([
      canonicalSig,
    ])
    expect((await multiSign!(canonicalTransaction())).signature).toHaveLength(1)
    expect(signer.calls).toEqual([
      'signMessage',
      'signTypedData',
      'signTransaction',
      'multiSign',
    ])
  })

  test('a rejecting async source propagates the original error object unchanged', async () => {
    watchUnhandled()
    class WalletRejected extends Error {
      code = 4001
    }
    const base = privateKeyToAccount(pk1)
    const errors = {
      signMessage: new WalletRejected('message rejected'),
      signTypedData: new WalletRejected('typed data rejected'),
      signTransaction: new WalletRejected('transaction rejected'),
      multiSign: new WalletRejected('multisig rejected'),
    }
    const account = toAccount({
      address: base.address,
      publicKey: base.publicKey,
      signMessage: async () => {
        throw errors.signMessage
      },
      signTypedData: () => Promise.reject(errors.signTypedData),
      signTransaction: async () => {
        await new Promise((r) => setTimeout(r, 0))
        throw errors.signTransaction
      },
      multiSign: async () => {
        throw errors.multiSign
      },
    })

    // Same object identity: not wrapped, not re-created.
    await expect(account.signMessage({ message: 'x' })).rejects.toBe(
      errors.signMessage,
    )
    await expect(account.signTypedData(typedData)).rejects.toBe(
      errors.signTypedData,
    )
    let caught: unknown
    try {
      await account.signTransaction(canonicalTransaction())
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(errors.signTransaction)
    expect((caught as WalletRejected).code).toBe(4001)
    await expect(account.multiSign!(canonicalTransaction())).rejects.toBe(
      errors.multiSign,
    )

    await flushMacrotask()
    expect(unhandled).not.toHaveBeenCalled()
  })

  test('a source that throws synchronously still throws synchronously', async () => {
    watchUnhandled()
    const base = privateKeyToAccount(pk1)
    const boom = new Error('device locked')
    const account = toAccount({
      address: base.address,
      publicKey: base.publicKey,
      signMessage: () => {
        throw boom
      },
      signTypedData: base.signTypedData,
      signTransaction: () => {
        throw boom
      },
    })

    // Unchanged from the sync-only contract: a plain call throws...
    expect(() => account.signMessage({ message: 'x' })).toThrow(boom)
    expect(() => account.signTransaction(canonicalTransaction())).toThrow(boom)

    // ...and an awaiting caller catches the very same object.
    let caught: unknown
    try {
      await account.signTransaction(canonicalTransaction())
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(boom)

    await flushMacrotask()
    expect(unhandled).not.toHaveBeenCalled()
  })
})
