import { expect, test, vi } from 'vitest'

import {
  type WithRetryParameters,
  withRetry,
} from '../../../src/utils/promise/withRetry.js'

const callbackError = new Error('Retry callback failed')

test.each([
  {
    name: 'shouldRetry throws',
    options: {
      shouldRetry: () => {
        throw callbackError
      },
    },
    attempts: 1,
  },
  {
    name: 'shouldRetry rejects',
    options: { shouldRetry: () => Promise.reject(callbackError) },
    attempts: 1,
  },
  {
    name: 'delay throws on a later retry',
    options: {
      delay: ({ count }) => {
        if (count === 1) throw callbackError
        return 0
      },
    },
    attempts: 2,
  },
] satisfies {
  name: string
  options: WithRetryParameters
  attempts: number
}[])('rejects and runs finally when $name', async ({ options, attempts }) => {
  const fn = vi.fn().mockRejectedValue(new Error('Operation failed'))
  const cleanup = vi.fn()
  const result = withRetry(fn, { retryCount: 2, ...options }).finally(cleanup)

  await expect(result).rejects.toBe(callbackError)
  expect(fn).toHaveBeenCalledTimes(attempts)
  expect(cleanup).toHaveBeenCalledTimes(1)
})
