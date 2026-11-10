// Type-surface tests for the dedicated account-permission-update input types:
// the action does NOT accept the loose protobuf `Permission` model (neither
// its decoded nor its encode-side spelling). `owner` and `actives` are
// required, every permission carries a required `threshold` + `keys`, and an
// active permission additionally requires its 32-byte `operations` bitmap —
// so a call the node is guaranteed to reject cannot type-check.
import { expectTypeOf, test } from 'vitest'

import type {
  AccountPermissionUpdateParameters,
  ActivePermissionInput,
  BuildAccountPermissionUpdateParameters,
  PermissionInput,
} from '../../../src/actions/wallet/accountPermissionUpdate.js'
import type {
  Int64,
  Permission,
  PermissionKeyInput,
  PermissionMessageInput,
} from '../../../src/utils/transaction/types.js'

type ValidBase = {
  owner: PermissionInput
  actives: ActivePermissionInput[]
}

test('owner and actives are required parameters', () => {
  expectTypeOf<ValidBase>().toExtend<AccountPermissionUpdateParameters>()

  // missing owner is a type error
  expectTypeOf<{
    actives: ActivePermissionInput[]
  }>().not.toExtend<AccountPermissionUpdateParameters>()

  // missing actives is a type error
  expectTypeOf<{
    owner: PermissionInput
  }>().not.toExtend<AccountPermissionUpdateParameters>()

  // witness stays optional (SR-only; the node decides whether it applies)
  expectTypeOf<AccountPermissionUpdateParameters['witness']>().toEqualTypeOf<
    PermissionInput | undefined
  >()

  // the build variant shares the same input surface
  expectTypeOf<ValidBase>().toExtend<BuildAccountPermissionUpdateParameters>()
  expectTypeOf<{
    actives: ActivePermissionInput[]
  }>().not.toExtend<BuildAccountPermissionUpdateParameters>()
})

test('every permission requires threshold and keys', () => {
  expectTypeOf<PermissionInput['threshold']>().toEqualTypeOf<Int64>()
  // Keys are taken in their encode-side spelling: a Base58 / 0x / 41-hex /
  // byte address and a bigint, number or string weight.
  expectTypeOf<PermissionInput['keys']>().toEqualTypeOf<PermissionKeyInput[]>()

  expectTypeOf<{ keys: PermissionKeyInput[] }>().not.toExtend<PermissionInput>()
  expectTypeOf<{ threshold: Int64 }>().not.toExtend<PermissionInput>()
  // Both present is the minimum valid permission.
  expectTypeOf<{
    threshold: Int64
    keys: PermissionKeyInput[]
  }>().toExtend<PermissionInput>()
})

test('an active permission additionally requires operations', () => {
  // a permission valid for the owner slot is NOT valid as an active
  expectTypeOf<PermissionInput>().not.toExtend<ActivePermissionInput>()
  expectTypeOf<{
    threshold: Int64
    keys: PermissionKeyInput[]
  }>().not.toExtend<ActivePermissionInput>()

  expectTypeOf<ActivePermissionInput['operations']>().not.toEqualTypeOf<
    ActivePermissionInput['operations'] | undefined
  >()
})

test('the loose protobuf Permission model is not accepted as input', () => {
  // `Permission` (all-optional codec model) must not satisfy the input types
  expectTypeOf<Permission>().not.toExtend<PermissionInput>()
  expectTypeOf<Permission>().not.toExtend<ActivePermissionInput>()
  expectTypeOf<{
    owner: Permission
    actives: Permission[]
  }>().not.toExtend<AccountPermissionUpdateParameters>()
  // Nor its encode-side spelling: `threshold` and `keys` stay optional there.
  expectTypeOf<PermissionMessageInput>().not.toExtend<PermissionInput>()
  expectTypeOf<PermissionMessageInput>().not.toExtend<ActivePermissionInput>()
  expectTypeOf<{
    owner: PermissionMessageInput
    actives: PermissionMessageInput[]
  }>().not.toExtend<AccountPermissionUpdateParameters>()
})
