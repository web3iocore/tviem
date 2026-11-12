import { expectTypeOf, test } from 'vitest'

import type { Address, AddressInput } from '../../../src/types/address.js'
import {
  type IsAddressOptions,
  isAddress,
} from '../../../src/utils/address/isAddress.js'

const value = '' as string

test('strict mode (the default) narrows to Address', () => {
  if (isAddress(value)) expectTypeOf(value).toEqualTypeOf<Address>()
  if (isAddress(value, {})) expectTypeOf(value).toEqualTypeOf<Address>()
  if (isAddress(value, { strict: true }))
    expectTypeOf(value).toEqualTypeOf<Address>()
  if (isAddress(value, undefined)) expectTypeOf(value).toEqualTypeOf<Address>()
})

test('strict: false narrows to AddressInput', () => {
  if (isAddress(value, { strict: false })) {
    expectTypeOf(value).toEqualTypeOf<AddressInput>()
    expectTypeOf(value).not.toEqualTypeOf<Address>()
  }
})

test('a strict flag not known to be true narrows to AddressInput', () => {
  const strict = true as boolean
  if (isAddress(value, { strict }))
    expectTypeOf(value).toEqualTypeOf<AddressInput>()

  const options = {} as IsAddressOptions
  if (isAddress(value, options))
    expectTypeOf(value).toEqualTypeOf<AddressInput>()
})

test('the result is a boolean', () => {
  expectTypeOf(isAddress(value)).toEqualTypeOf<boolean>()
  expectTypeOf(isAddress(value, { strict: false })).toEqualTypeOf<boolean>()
})
