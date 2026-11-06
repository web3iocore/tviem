// Shared, dependency-free helpers for the `buildX` write-action unit tests:
// a pinned offline block header and a mock-transport wallet client, so each
// test builds a transaction fully offline (no node call, no external SDK).
// Byte-for-byte parity against TronWeb lives in the separate tron-viem-test
// project; the unit tests here only assert tviem's own behavior.
import { createWalletClient } from '../../../src/clients/createWalletClient.js'
import { createMockTransport } from '../../mock/createMockTransport.js'

// The address of pk = 1. The build actions only need the owner address, so
// the client hoists it as an address-only account (nothing signs).
const owner = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC' as const

/** The single pinned reference block every build test builds against. */
export const tviemHeader = {
  ref_block_bytes: '1234',
  ref_block_hash: '0102030405060708',
  timestamp: 1700000000000n,
  expiration: 1700000060000n,
}

/** A tviem wallet client hoisted with pk1's address; no node is hit (blockHeader is set). */
export function makeTviemClient() {
  const { transport } = createMockTransport({ responses: {} })
  return createWalletClient({ account: owner, transport })
}
