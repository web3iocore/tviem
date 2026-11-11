import { expect, test } from 'vitest'
import { privateKeyToAccount } from '../../../src/accounts/privateKeyToAccount.js'
import {
  type AccountPermission,
  getAccount,
} from '../../../src/actions/public/getAccount.js'
import {
  type AccountPermissionUpdateParameters,
  accountPermissionUpdate,
  buildAccountPermissionUpdate,
} from '../../../src/actions/wallet/accountPermissionUpdate.js'
import { createPublicClient } from '../../../src/clients/createPublicClient.js'
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import {
  InvalidParameterError,
  MissingFieldError,
} from '../../../src/errors/parameter.js'
import { AccountNotFoundError } from '../../../src/errors/rpc.js'
import { PermissionError } from '../../../src/errors/transaction.js'
import { rpc } from '../../fixtures/rpc/loader.js'
import { loadTxFixtureFile } from '../../fixtures/tx/loader.js'
import { createMockTransport } from '../../mock/createMockTransport.js'
import { parseBroadcast } from '../../mock/parseBroadcast.js'

// pk = 1 (permitted trivial key) → address TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC,
// which is exactly the fixture `owner_address`.
const pk1 = `0x${'0'.repeat(63)}1` as const
const account = privateKeyToAccount(pk1)

const [fixture] = loadTxFixtureFile('account-permission-update-contract.json')

// A minimal valid permission set, cloned per test.
const key = {
  address: 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC',
  weight: 1n,
} as const
const validOwner = () => ({ threshold: 1n, keys: [{ ...key }] })
const validActive = () => ({
  threshold: 1n,
  operations:
    '0x7fff1fc0033e0300000000000000000000000000000000000000000000000000',
  keys: [{ ...key }],
})

// A complete TaPoS header, so validation tests build fully offline — the
// mock transport has no responses, proving the guards fire before any
// node call.
const blockHeader = {
  ref_block_bytes: '1234',
  ref_block_hash: '0011223344556677',
  expiration: 1_600_000_060_000,
  timestamp: 1_600_000_000_000,
}

function offlineBuild(parameters: Record<string, unknown>) {
  const { transport } = createMockTransport({ responses: {} })
  const client = createWalletClient({ account, transport })
  return buildAccountPermissionUpdate(client, {
    ...parameters,
    blockHeader,
  } as unknown as AccountPermissionUpdateParameters)
}

function writeMock() {
  return createMockTransport({
    responses: {
      getnowblock: { response: rpc('getnowblock.fixed') },
      broadcasttransaction: { response: rpc('broadcasttransaction.ok') },
    },
  })
}

test('updates owner + active permissions byte-for-byte against the gold vector', async () => {
  const { transport, calls, bodyOf } = writeMock()
  const client = createWalletClient({ account, transport })

  const { txID } = await accountPermissionUpdate(client, {
    owner: {
      permissionName: 'owner',
      threshold: 2n,
      keys: [
        { address: 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC', weight: 1n },
        { address: 'TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K', weight: 1n },
      ],
    },
    actives: [
      {
        id: 2,
        permissionName: 'active0',
        threshold: 1n,
        operations:
          '0x7fff1fc0033e0300000000000000000000000000000000000000000000000000',
        keys: [{ address: 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC', weight: 1n }],
      },
    ],
  })

  expect(txID).toBe(fixture?.txID)
  expect(calls.map((c) => c.path)).toEqual([
    'getnowblock',
    'broadcasttransaction',
  ])
  const body = parseBroadcast(bodyOf('broadcasttransaction'))
  expect(body.raw_data_hex).toBe(fixture?.rawDataHex)
})

// java-tron (AccountCapsule.updatePermissions) stores actives BY POSITION —
// actives[i] is written with id i+2 unconditionally, and the actuator never
// checks a provided id — so a caller-supplied id that differs from its slot is
// signed but never stored. `[{id:3},{id:2}]` would bind the first key set to
// id 2 and the second to id 3, the reverse of what the ids say. A provided id
// must equal its slot's i+2, else it is refused.
test('rejects an active permission id that does not match its position', async () => {
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [{ ...validActive(), id: 5 }],
    }),
  ).rejects.toThrow('Invalid actives[0] permission: `id` must be 2')
})

test('rejects ids that would reorder the positional assignment', async () => {
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [
        { ...validActive(), id: 3 },
        { ...validActive(), id: 2 },
      ],
    }),
  ).rejects.toThrow('Invalid actives[0] permission: `id` must be 2')
})

test('rejects a wrong id at a later active slot too', async () => {
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [
        { ...validActive(), id: 2 },
        { ...validActive(), id: 2 },
      ],
    }),
  ).rejects.toThrow('Invalid actives[1] permission: `id` must be 3')
})

test('accepts an omitted id and a matching positional id alike', async () => {
  await expect(
    offlineBuild({ owner: validOwner(), actives: [validActive()] }),
  ).resolves.toBeDefined()
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [{ ...validActive(), id: 2 }],
    }),
  ).resolves.toBeDefined()
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [
        { ...validActive(), id: 2 },
        { ...validActive(), id: 3 },
      ],
    }),
  ).resolves.toBeDefined()
})

test('throws AccountNotFoundError when no account is available', async () => {
  const { transport } = writeMock()
  const client = createPublicClient({ transport })
  await expect(
    accountPermissionUpdate(client, {
      owner: validOwner(),
      actives: [validActive()],
    }),
  ).rejects.toBeInstanceOf(AccountNotFoundError)
})

test('builds a full owner + witness + actives set offline', async () => {
  const { txID } = await offlineBuild({
    owner: { permissionName: 'owner', ...validOwner() },
    witness: { permissionName: 'witness', ...validOwner() },
    actives: [{ permissionName: 'active0', ...validActive() }],
  })
  expect(txID).toMatch(/^[0-9a-f]{64}$/)
})

test('rejects a missing owner permission before any node call', async () => {
  await expect(offlineBuild({ actives: [validActive()] })).rejects.toThrow(
    'Missing owner permission',
  )
})

test('rejects missing actives before any node call', async () => {
  await expect(offlineBuild({ owner: validOwner() })).rejects.toThrow(
    'Missing active permissions',
  )
})

test('rejects an empty actives array', async () => {
  await expect(
    offlineBuild({ owner: validOwner(), actives: [] }),
  ).rejects.toThrow('Missing active permissions')
})

test('rejects a permission without threshold', async () => {
  await expect(
    offlineBuild({
      owner: { keys: [{ ...key }] },
      actives: [validActive()],
    }),
  ).rejects.toThrow('Invalid owner permission: missing `threshold`')
})

test('rejects a permission with no keys', async () => {
  await expect(
    offlineBuild({
      owner: { threshold: 1n, keys: [] },
      actives: [validActive()],
    }),
  ).rejects.toThrow('Invalid owner permission: `keys` must carry at least one')
})

test('rejects a witness permission with no keys', async () => {
  await expect(
    offlineBuild({
      owner: validOwner(),
      witness: { threshold: 1n, keys: [] },
      actives: [validActive()],
    }),
  ).rejects.toThrow(
    'Invalid witness permission: `keys` must carry at least one',
  )
})

test('rejects an active permission without operations', async () => {
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [{ threshold: 1n, keys: [{ ...key }] }],
    }),
  ).rejects.toThrow('Invalid actives[0] permission: missing `operations`')
})

test('rejects an active operations bitmap that is not 32 bytes', async () => {
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [{ ...validActive(), operations: '0xdeadbeef' }],
    }),
  ).rejects.toThrow(
    'Invalid actives[0] permission: `operations` must be a 32-byte bitmap',
  )
})

test('rejects an operations bitmap passed as a wrong-size Uint8Array', async () => {
  await expect(
    offlineBuild({
      owner: validOwner(),
      actives: [{ ...validActive(), operations: new Uint8Array(31) }],
    }),
  ).rejects.toThrow(
    'Invalid actives[0] permission: `operations` must be a 32-byte bitmap',
  )
})

test('validation errors carry their class and the field they refer to', async () => {
  const failure = (parameters: Record<string, unknown>) =>
    offlineBuild(parameters).catch((e) => e)

  const noOwner = await failure({ actives: [validActive()] })
  expect(noOwner).toBeInstanceOf(MissingFieldError)
  expect(noOwner).toMatchObject({ name: 'MissingFieldError', field: 'owner' })

  const noActives = await failure({ owner: validOwner() })
  expect(noActives).toBeInstanceOf(MissingFieldError)
  expect(noActives).toMatchObject({
    name: 'MissingFieldError',
    field: 'actives',
  })

  // `actives`: like `keys`, an empty array is out of range and a non-array
  // is the wrong type; only an absent value is a missing field.
  const emptyActives = await failure({ owner: validOwner(), actives: [] })
  expect(emptyActives).toBeInstanceOf(InvalidParameterError)
  expect(emptyActives).toMatchObject({
    name: 'InvalidParameterError',
    param: 'actives',
    reason: 'range',
  })
  expect(emptyActives.shortMessage).toBe(noActives.shortMessage)
  const activesNotArray = await failure({ owner: validOwner(), actives: 7 })
  expect(activesNotArray).toBeInstanceOf(InvalidParameterError)
  expect(activesNotArray).toMatchObject({
    name: 'InvalidParameterError',
    param: 'actives',
    reason: 'type',
  })

  const noThreshold = await failure({
    owner: { keys: [{ ...key }] },
    actives: [validActive()],
  })
  expect(noThreshold).toBeInstanceOf(MissingFieldError)
  expect(noThreshold).toMatchObject({
    name: 'MissingFieldError',
    field: 'owner.threshold',
  })

  const noOperations = await failure({
    owner: validOwner(),
    actives: [{ threshold: 1n, keys: [{ ...key }] }],
  })
  expect(noOperations).toBeInstanceOf(MissingFieldError)
  expect(noOperations).toMatchObject({
    name: 'MissingFieldError',
    field: 'actives[0].operations',
  })

  // `keys`: an empty array is out of range, a non-array is the wrong type.
  const emptyKeys = await failure({
    owner: validOwner(),
    witness: { threshold: 1n, keys: [] },
    actives: [validActive()],
  })
  expect(emptyKeys).toBeInstanceOf(InvalidParameterError)
  expect(emptyKeys).toMatchObject({
    name: 'InvalidParameterError',
    param: 'witness.keys',
    reason: 'range',
  })
  const keysNotArray = await failure({
    owner: { threshold: 1n, keys: 'none' },
    actives: [validActive()],
  })
  expect(keysNotArray).toBeInstanceOf(InvalidParameterError)
  expect(keysNotArray).toMatchObject({
    name: 'InvalidParameterError',
    param: 'owner.keys',
    reason: 'type',
  })

  // `operations`: a wrong-size string or byte array is malformed, anything
  // else is the wrong type.
  for (const [operations, reason] of [
    ['0xdeadbeef', 'format'],
    [new Uint8Array(31), 'format'],
    [7, 'type'],
  ] as const) {
    const err = await failure({
      owner: validOwner(),
      actives: [{ ...validActive(), operations }],
    })
    expect(err).toBeInstanceOf(InvalidParameterError)
    expect(err).toMatchObject({
      name: 'InvalidParameterError',
      param: 'actives[0].operations',
      reason,
    })
  }

  const wrongId = await failure({
    owner: validOwner(),
    actives: [{ ...validActive(), id: 5 }],
  })
  expect(wrongId).toBeInstanceOf(PermissionError)
  expect(wrongId).toMatchObject({ name: 'PermissionError', permissionId: 5 })
})

test('`permissionName` is written to the wire model as `permission_name`', async () => {
  const tx = await offlineBuild({
    owner: { permissionName: 'owner', ...validOwner() },
    witness: { permissionName: 'witness', ...validOwner() },
    actives: [{ permissionName: 'active0', ...validActive() }],
  })
  const value = tx.raw_data.contract[0]!.parameter.value as {
    owner: Record<string, unknown>
    witness: Record<string, unknown>
    actives: Record<string, unknown>[]
  }
  expect(value.owner.permission_name).toBe('owner')
  expect(value.witness.permission_name).toBe('witness')
  expect(value.actives[0]!.permission_name).toBe('active0')
  expect(value.owner).not.toHaveProperty('permissionName')
  expect(value.actives[0]).not.toHaveProperty('permissionName')
})

test('the wire spelling `permission_name` on a permission input is an unknown field', async () => {
  const { transport, calls } = writeMock()
  const client = createWalletClient({ account, transport })
  const failure = (parameters: Record<string, unknown>) =>
    accountPermissionUpdate(
      client,
      parameters as unknown as AccountPermissionUpdateParameters,
    ).catch((e) => e)

  // An inherited value and an accessor are read like an own property.
  class NamedByAccessor {
    threshold = 1n
    keys = [{ ...key }]
    get permission_name() {
      return 'owner'
    }
  }
  const namedByPrototype = Object.assign(
    Object.create({ permission_name: 'owner' }),
    validOwner(),
  )

  for (const [parameters, slot] of [
    [
      {
        owner: { permission_name: 'owner', ...validOwner() },
        actives: [validActive()],
      },
      'owner',
    ],
    [
      {
        owner: validOwner(),
        witness: { permission_name: 'witness', ...validOwner() },
        actives: [validActive()],
      },
      'witness',
    ],
    [
      {
        owner: validOwner(),
        actives: [
          validActive(),
          { permission_name: 'active1', ...validActive() },
        ],
      },
      'actives[1]',
    ],
    // Reported even next to the current spelling, and for a null value.
    [
      {
        owner: {
          permissionName: 'owner',
          permission_name: 'owner',
          ...validOwner(),
        },
        actives: [validActive()],
      },
      'owner',
    ],
    [
      {
        owner: { permission_name: null, ...validOwner() },
        actives: [validActive()],
      },
      'owner',
    ],
    [{ owner: new NamedByAccessor(), actives: [validActive()] }, 'owner'],
    [{ owner: namedByPrototype, actives: [validActive()] }, 'owner'],
  ] as const) {
    const err = await failure(parameters)
    expect(err).toBeInstanceOf(InvalidParameterError)
    expect(err).toMatchObject({
      name: 'InvalidParameterError',
      shortMessage: `Invalid ${slot} permission: unknown field \`permission_name\` (the permission name is passed as \`permissionName\`).`,
      // For 'unknown-field' the param is the unrecognised key itself.
      param: 'permission_name',
      reason: 'unknown-field',
    })
  }

  // Nothing was fetched, signed or broadcast for any of them.
  expect(calls).toHaveLength(0)
})

test('`permission_name: undefined` is the same as leaving it out', async () => {
  const baseline = await offlineBuild({
    owner: validOwner(),
    actives: [validActive()],
  })
  const tx = await offlineBuild({
    owner: { ...validOwner(), permission_name: undefined },
    actives: [{ ...validActive(), permission_name: undefined }],
  })
  expect(tx.raw_data_hex).toBe(baseline.raw_data_hex)
})

test('other fields on a permission input are not carried into the model', async () => {
  const baseline = await offlineBuild({
    owner: validOwner(),
    witness: validOwner(),
    actives: [validActive()],
  })
  const tx = await offlineBuild({
    owner: {
      ...validOwner(),
      type: 2,
      id: 7,
      parent_id: 3,
      operations: validActive().operations,
    },
    witness: { ...validOwner(), type: 0, id: 1 },
    actives: [{ ...validActive(), type: 0, parent_id: 3 }],
  })
  expect(tx.raw_data_hex).toBe(baseline.raw_data_hex)
  expect(tx.txID).toBe(baseline.txID)
})

test('permissions read with getAccount are accepted as inputs', async () => {
  const { transport } = createMockTransport({
    responses: { getaccount: { response: rpc('getaccount.rich') } },
  })
  const state = await getAccount(createPublicClient({ transport }), {
    address: 'TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY',
  })
  if (!state?.ownerPermission || !state.witnessPermission)
    throw new Error('expected permissions')
  const active = state.activePermission[0]
  if (!active?.operations) throw new Error('expected an active permission')
  // The formatted shape carries `type` / `id` next to the input fields.
  expect(state.ownerPermission.type).toBe(0)
  expect(state.witnessPermission).toMatchObject({ type: 1, id: 1 })
  expect(active).toMatchObject({ type: 2, id: 2 })

  const offline = createWalletClient({
    account,
    transport: createMockTransport({ responses: {} }).transport,
  })
  // No cast: the formatted permission is assignable to the input types.
  const tx = await buildAccountPermissionUpdate(offline, {
    owner: state.ownerPermission,
    witness: state.witnessPermission,
    actives: [{ ...active, operations: active.operations }],
    blockHeader,
  })

  // The same bytes as the input spelled out field by field.
  const pick = ({ permissionName, threshold, keys }: AccountPermission) => ({
    permissionName,
    threshold,
    keys,
  })
  const spelledOut = await buildAccountPermissionUpdate(offline, {
    owner: pick(state.ownerPermission),
    witness: pick(state.witnessPermission),
    actives: [{ ...pick(active), id: 2, operations: active.operations }],
    blockHeader,
  })
  expect(tx.raw_data_hex).toBe(spelledOut.raw_data_hex)
  expect(tx.txID).toBe(spelledOut.txID)

  const value = tx.raw_data.contract[0]!.parameter.value as {
    owner: Record<string, unknown>
    witness: Record<string, unknown>
    actives: Record<string, unknown>[]
  }
  expect(value.owner.permission_name).toBe('owner')
  expect(value.witness.permission_name).toBe('witness')
  expect(value.actives[0]!.permission_name).toBe('active')
})
