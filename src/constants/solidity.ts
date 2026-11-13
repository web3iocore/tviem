import type { AbiError } from 'abitype'

/** Descriptions of the `Panic(uint256)` codes the Solidity compiler emits. */
export const panicReasons = {
  1: 'An `assert` condition failed.',
  17: 'Arithmetic operation resulted in underflow or overflow.',
  18: 'Division or modulo by zero (e.g. `5 / 0` or `23 % 0`).',
  33: 'Attempted to convert to an invalid type.',
  34: 'Attempted to access a storage byte array that is incorrectly encoded.',
  49: 'Performed `.pop()` on an empty array',
  50: 'Array index is out of bounds.',
  65: 'Allocated too much memory or created an array which is too large.',
  81: 'Attempted to call a zero-initialized variable of internal function type.',
} as const

/** The built-in `Error(string)` revert (4-byte selector `0x08c379a0`). */
export const solidityError = {
  inputs: [
    {
      name: 'message',
      type: 'string',
    },
  ],
  name: 'Error',
  type: 'error',
} as const satisfies AbiError

/** The built-in `Panic(uint256)` revert (4-byte selector `0x4e487b71`). */
export const solidityPanic = {
  inputs: [
    {
      name: 'reason',
      type: 'uint256',
    },
  ],
  name: 'Panic',
  type: 'error',
} as const satisfies AbiError
