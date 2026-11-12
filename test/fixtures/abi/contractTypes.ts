// Literal ABIs shared by the contract type tests (`*.test-d.ts`). Only their
// types are used; every address below is a placeholder.
import { parseAbi } from 'abitype'

/** A Base58Check-form (`T…`) address literal. */
export const base58Address = 'TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe' as const
/** A TRON hex-form (`41…`) address literal. */
export const hexAddress = '410000000000000000000000000000000000000001' as const
/** An EVM-form (`0x…`) address literal. */
export const evmAddress = '0x0000000000000000000000000000000000000001' as const

/**
 * A vault-like ABI covering every shape the helper types distinguish:
 * - `view` functions with no / single / multiple / tuple outputs;
 * - `nonpayable` and `payable` functions, with and without inputs;
 * - array, fixed-array, named-tuple and unnamed-tuple inputs;
 * - `lookup`: three `view` overloads;
 * - `send`: a `nonpayable` and a `payable` overload;
 * - `move`: two `nonpayable` overloads;
 * - `stake`: a `nonpayable` overload without inputs and a `payable` one;
 * - events with named, hashed and unnamed inputs, and an error.
 */
export const vaultAbi = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'holders',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'list', type: 'address[]' },
      { name: 'total', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'position',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'holder', type: 'address' },
          { name: 'amount', type: 'uint64' },
          { name: 'tags', type: 'bytes32[]' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'pair',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [{ type: 'address' }, { type: 'int24' }],
      },
    ],
  },
  {
    type: 'function',
    name: 'lookup',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'lookup',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'lookup',
    stateMutability: 'view',
    inputs: [
      { name: 'who', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [
      { name: '', type: 'address' },
      { name: '', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'burn',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'batch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[2]' },
      {
        name: 'order',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint64' },
        ],
      },
      {
        name: 'raw',
        type: 'tuple',
        components: [{ type: 'address' }, { type: 'bool' }],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'depositFor',
    stateMutability: 'payable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'send',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'send',
    stateMutability: 'payable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'move',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'move',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'stake',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'stake',
    stateMutability: 'payable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Note',
    inputs: [
      { name: 'tag', type: 'string', indexed: true },
      { name: 'id', type: 'uint64', indexed: true },
      { name: 'data', type: 'bytes', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Ping',
    inputs: [
      { type: 'address', indexed: true },
      { type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Paused',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'needed', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'Locked',
    inputs: [],
  },
] as const

/** A `nonpayable` constructor taking `(address, uint256)`. */
export const nonpayableConstructorAbi = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'cap', type: 'uint256' },
    ],
  },
] as const

/** A `payable` constructor taking `(address)`. */
export const payableConstructorAbi = [
  {
    type: 'constructor',
    stateMutability: 'payable',
    inputs: [{ name: 'owner', type: 'address' }],
  },
] as const

/** A `payable` constructor without inputs. */
export const payableNoArgsConstructorAbi = [
  { type: 'constructor', stateMutability: 'payable', inputs: [] },
] as const

/** An ABI that declares no constructor. */
export const noConstructorAbi = [
  {
    type: 'function',
    name: 'ping',
    stateMutability: 'view',
    inputs: [],
    outputs: [],
  },
] as const

/**
 * A constructor, thirty-three function names (one of them overloaded), three
 * events and two errors — the size of a typical production contract.
 */
export const largeAbi = parseAbi([
  'constructor(address owner, uint256 cap) payable',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function owner() view returns (address)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address holder, address spender) view returns (uint256)',
  'function nonces(address holder) view returns (uint256)',
  'function paused() view returns (bool)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function holdersOf(uint256 offset, uint256 limit) view returns (address[] list, uint256 total)',
  'function quote(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function supportsInterface(bytes4 interfaceId) pure returns (bool)',
  'function domainSeparator() view returns (bytes32)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
  'function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)',
  'function mint(address to, uint256 amount)',
  'function burn(uint256 amount)',
  'function burnFrom(address account, uint256 amount)',
  'function pause()',
  'function unpause()',
  'function transferOwnership(address newOwner)',
  'function renounceOwnership()',
  'function deposit() payable',
  'function depositFor(address to) payable returns (uint256 shares)',
  'function withdraw(uint256 shares, address to) returns (uint256 amount)',
  'function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data)',
  'function multicall(bytes[] data) payable returns (bytes[] results)',
  'function permit(address holder, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function safeTransfer(address to, uint256 amount)',
  'function safeTransfer(address to, uint256 amount, bytes data) payable',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  'error InsufficientBalance(address account, uint256 needed)',
  'error Unauthorized(address caller)',
])
