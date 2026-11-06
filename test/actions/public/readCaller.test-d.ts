import { expectTypeOf, test } from 'vitest'
import type {
  JsonRpcAccount,
  TronAccount,
} from '../../../src/accounts/types.js'
import type { EstimateEnergyParameters } from '../../../src/actions/public/estimateEnergy.js'
import type { ReadContractParameters } from '../../../src/actions/public/readContract.js'
import type { TriggerConstantContractParameters } from '../../../src/actions/public/triggerConstantContract.js'
import type { Address } from '../../../src/types/address.js'

test('read-action `account` is TronAccount | Address, like every other account', () => {
  type Read = NonNullable<ReadContractParameters['account']>
  type Trigger = NonNullable<TriggerConstantContractParameters['account']>
  type Energy = NonNullable<EstimateEnergyParameters['account']>
  expectTypeOf<Read>().toEqualTypeOf<TronAccount | Address>()
  expectTypeOf<Trigger>().toEqualTypeOf<TronAccount | Address>()
  expectTypeOf<Energy>().toEqualTypeOf<TronAccount | Address>()
  expectTypeOf<JsonRpcAccount>().toExtend<Read>()

  // Hex spellings (and so a 0x private key) are no longer an `account`.
  expectTypeOf<'417e5f4552091a69125d5dfcb7b8c2659029395bdf'>().not.toExtend<Read>()
  expectTypeOf<'0x7e5f4552091a69125d5dfcb7b8c2659029395bdf'>().not.toExtend<Read>()
})
