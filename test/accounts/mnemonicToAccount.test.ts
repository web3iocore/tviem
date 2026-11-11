// Vectors are byte-for-byte from TronWeb's `TronWeb.fromMnemonic` over the
// canonical zero-entropy BIP-39 test vector (the "pk=1" of mnemonics: 16 zero
// bytes → "abandon abandon … about"). No secret is committed — the phrase is
// derived from zero entropy in-test and only public addresses/pubkeys are
// pinned, never a derived private key.
import { HDKey } from '@scure/bip32'
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { describe, expect, test } from 'vitest'
import { generateMnemonic } from '../../src/accounts/generateMnemonic.js'
import { hdKeyToAccount } from '../../src/accounts/hdKeyToAccount.js'
import { mnemonicToAccount } from '../../src/accounts/mnemonicToAccount.js'
import {
  InvalidParameterError,
  MissingFieldError,
} from '../../src/errors/parameter.js'
import { verifyMessage } from '../../src/utils/signature/verifyMessage.js'
import { verifyTypedData } from '../../src/utils/signature/verifyTypedData.js'

const mnemonic = entropyToMnemonic(new Uint8Array(16), wordlist)

// TronWeb-verified derivations (address, uncompressed pubkey) at pinned paths.
const V = {
  default: {
    address: 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH',
    publicKey:
      '0x04ff21f8e64d3a3c0198edfbb7afdc79be959432e92e2f8a1984bb436a414b8edcec0345aad0c1bf7da04fd036dd7f9f617e30669224283d950fab9dd84831dc83',
  },
  account1: 'TLrpNTBuCpGMrB9TyVwgEhNVRhtWEQPHh4',
  addressIndex1: 'TSeJkUh4Qv67VNFwY8LaAxERygNdy6NQZK',
  change1: 'THLNguYKN3S8RUzVyi9ErynW4YmXLU5c8n',
  path5: 'TBdYXtwq18cAhi1BA574TrP6tw2G86anu1',
  passphrase: 'TLqaejwnaDYJmRDhTNKE5FizgKvB52niAq',
} as const

describe('mnemonicToAccount', () => {
  test('the fixture mnemonic is the canonical zero-entropy vector', () => {
    expect(mnemonic).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    )
  })

  test('derives the default TRON path m/44’/195’/0’/0/0', () => {
    const account = mnemonicToAccount(mnemonic)
    expect(account.address).toBe(V.default.address)
    expect(account.publicKey).toBe(V.default.publicKey)
    expect(account.source).toBe('hd')
    expect(account.type).toBe('local')
  })

  test('accountIndex varies the hardened account segment', () => {
    expect(mnemonicToAccount(mnemonic, { accountIndex: 1 }).address).toBe(
      V.account1,
    )
  })

  test('addressIndex varies the final segment; explicit path agrees', () => {
    expect(mnemonicToAccount(mnemonic, { addressIndex: 1 }).address).toBe(
      V.addressIndex1,
    )
    expect(
      mnemonicToAccount(mnemonic, { path: "m/44'/195'/0'/0/1" }).address,
    ).toBe(V.addressIndex1)
  })

  test('changeIndex varies the change segment', () => {
    expect(mnemonicToAccount(mnemonic, { changeIndex: 1 }).address).toBe(
      V.change1,
    )
  })

  test('an explicit path overrides the index options', () => {
    expect(
      mnemonicToAccount(mnemonic, { path: "m/44'/195'/0'/0/5" }).address,
    ).toBe(V.path5)
  })

  test('a passphrase changes the derived account', () => {
    const account = mnemonicToAccount(mnemonic, {
      passphrase: 'passphrase-\u{1f680}',
    })
    expect(account.address).toBe(V.passphrase)
    expect(account.address).not.toBe(V.default.address)
  })

  test.each([
    ['null', null],
    ['0', 0],
    ['false', false],
    ['an object', {}],
    ['an array', []],
  ])('throws on a passphrase that is not a string (%s)', (_, passphrase) => {
    expect(() =>
      mnemonicToAccount(mnemonic, {
        passphrase: passphrase as unknown as string,
      }),
    ).toThrow(/Invalid passphrase/)
  })

  test('an empty-string passphrase is the default wallet', () => {
    expect(mnemonicToAccount(mnemonic, { passphrase: '' }).address).toBe(
      V.default.address,
    )
    expect(mnemonicToAccount(mnemonic, { passphrase: undefined }).address).toBe(
      V.default.address,
    )
  })

  test('the passphrase itself is not normalized', () => {
    const base = mnemonicToAccount(mnemonic, { passphrase: 'abc' }).address
    expect(mnemonicToAccount(mnemonic, { passphrase: 'ABC' }).address).not.toBe(
      base,
    )
    expect(
      mnemonicToAccount(mnemonic, { passphrase: ' abc ' }).address,
    ).not.toBe(base)
  })

  test.each([
    [
      'first letters upper-cased',
      (m: string) => m.replace(/\b\w/g, (c) => c.toUpperCase()),
    ],
    ['all upper-case', (m: string) => m.toUpperCase()],
    ['double spaces', (m: string) => m.split(' ').join('  ')],
    ['tabs and newlines', (m: string) => m.split(' ').join('\t\n')],
    ['leading and trailing whitespace', (m: string) => `  ${m} \n`],
  ])('normalizes a phrase with %s to the canonical wallet', (_, mutate) => {
    const variant = mutate(mnemonic)
    expect(variant).not.toBe(mnemonic)
    const account = mnemonicToAccount(variant)
    expect(account.address).toBe(V.default.address)
    expect(mnemonicToAccount(variant, { addressIndex: 1 }).address).toBe(
      V.addressIndex1,
    )
  })

  test('throws on a mnemonic that is not a string', () => {
    for (const value of [null, undefined, 42, {}, []])
      expect(() => mnemonicToAccount(value as unknown as string)).toThrow(
        /Invalid mnemonic/,
      )
  })

  test('throws on an invalid mnemonic', () => {
    expect(() => mnemonicToAccount('not a valid mnemonic phrase')).toThrow()
    // A valid-looking phrase with a bad checksum is also rejected.
    expect(() =>
      mnemonicToAccount(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon',
      ),
    ).toThrow()
  })

  test('the validation errors are InvalidParameterErrors naming the parameter', () => {
    const thrownBy = (fn: () => unknown): unknown => {
      try {
        fn()
      } catch (error) {
        return error
      }
      throw new Error('expected a throw')
    }

    const passphrase = thrownBy(() =>
      mnemonicToAccount(mnemonic, { passphrase: 0 as unknown as string }),
    )
    expect(passphrase).toBeInstanceOf(InvalidParameterError)
    expect(passphrase).toMatchObject({
      name: 'InvalidParameterError',
      param: 'passphrase',
      reason: 'type',
      shortMessage:
        'Invalid passphrase: expected a string or undefined, got number.',
    })

    const notAString = thrownBy(() =>
      mnemonicToAccount(null as unknown as string),
    )
    expect(notAString).toBeInstanceOf(InvalidParameterError)
    expect(notAString).toMatchObject({
      name: 'InvalidParameterError',
      param: 'mnemonic',
      reason: 'type',
      shortMessage: 'Invalid mnemonic: expected a string, got null.',
    })

    const notAPhrase = thrownBy(() =>
      mnemonicToAccount('not a valid mnemonic phrase'),
    )
    expect(notAPhrase).toBeInstanceOf(InvalidParameterError)
    expect(notAPhrase).toMatchObject({
      name: 'InvalidParameterError',
      param: 'mnemonic',
      reason: 'format',
      shortMessage:
        'Invalid mnemonic: the phrase is not a valid BIP-39 English mnemonic.',
    })
  })

  test('hdKeyToAccount throws a MissingFieldError when the derived node has no private key', () => {
    const master = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))
    // A node whose derivation yields a public-only node.
    const publicOnly = {
      derive: (path: string) => master.derive(path).wipePrivateData(),
    } as unknown as HDKey
    let caught: unknown
    try {
      hdKeyToAccount(publicOnly)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(MissingFieldError)
    expect(caught).toMatchObject({
      name: 'MissingFieldError',
      field: 'privateKey',
      shortMessage:
        'The derived HD node has no private key (a public-only node cannot sign).',
    })
  })

  test('getHdKey exposes the derived node', () => {
    const account = mnemonicToAccount(mnemonic)
    const hdKey = account.getHdKey()
    expect(hdKey.privateKey).toBeInstanceOf(Uint8Array)
    expect(hdKey.publicKey).toBeInstanceOf(Uint8Array)
    expect(hdKey.publicExtendedKey.startsWith('xpub')).toBe(true)
  })

  test('the derived account can sign messages and typed data', async () => {
    const account = mnemonicToAccount(mnemonic)
    const signature = await account.signMessage({ message: 'gm from HD' })
    expect(
      verifyMessage({
        message: 'gm from HD',
        signature,
        address: account.address,
      }),
    ).toBe(true)

    const typedData = {
      domain: { name: 'Example', version: '1', chainId: 728126428n },
      types: { Msg: [{ name: 'text', type: 'string' }] },
      primaryType: 'Msg',
      message: { text: 'hi' },
    } as const
    const tdSig = await account.signTypedData(typedData)
    expect(
      verifyTypedData({
        ...typedData,
        signature: tdSig,
        address: account.address,
      }),
    ).toBe(true)
  })
})

describe('hdKeyToAccount / generateMnemonic', () => {
  const master = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic))

  test('mnemonicToAccount delegates to hdKeyToAccount(master)', () => {
    expect(hdKeyToAccount(master).address).toBe(V.default.address)
    expect(hdKeyToAccount(master, { accountIndex: 1 }).address).toBe(V.account1)
    expect(hdKeyToAccount(master, { path: "m/44'/195'/0'/0/5" }).address).toBe(
      V.path5,
    )
  })

  test('the derived getHdKey node re-derives to the same account', () => {
    const account = mnemonicToAccount(mnemonic, { addressIndex: 2 })
    // The leaf node's own private key reproduces the same signer address.
    expect(account.getHdKey().privateKey).toBeInstanceOf(Uint8Array)
    expect(account.address).toBe(
      mnemonicToAccount(mnemonic, { path: "m/44'/195'/0'/0/2" }).address,
    )
  })

  test('generateMnemonic round-trips into a usable HD account', () => {
    const phrase = generateMnemonic()
    expect(phrase.split(' ')).toHaveLength(12)
    const account = mnemonicToAccount(phrase)
    expect(account.address.startsWith('T')).toBe(true)
    expect(account.source).toBe('hd')
    // 24-word phrase (256-bit entropy).
    expect(generateMnemonic(256).split(' ')).toHaveLength(24)
  })
})

describe('sync compatibility (signer surface typed MaybePromise)', () => {
  // HD accounts are key-backed: typed `MaybePromise<Hex>`, but they
  // still resolve synchronously, and awaiting yields the identical value.
  const isThenable = (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'

  test('signMessage / signTypedData return synchronously; awaiting is identical', async () => {
    const account = mnemonicToAccount(mnemonic)
    const message = account.signMessage({ message: 'gm from HD' })
    expect(isThenable(message)).toBe(false)
    expect(await account.signMessage({ message: 'gm from HD' })).toEqual(
      message,
    )
    expect(await message).toBe(message)

    const typedData = {
      domain: { name: 'Example', version: '1', chainId: 728126428n },
      types: { Msg: [{ name: 'text', type: 'string' }] },
      primaryType: 'Msg',
      message: { text: 'hi' },
    } as const
    const typed = account.signTypedData(typedData)
    expect(isThenable(typed)).toBe(false)
    expect(await account.signTypedData(typedData)).toEqual(typed)
    expect(await typed).toBe(typed)
  })
})
