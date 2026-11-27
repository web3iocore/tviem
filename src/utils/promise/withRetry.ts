import {
  type ErrorType,
  getAbortError,
  isAbortError,
} from '../../errors/utils.js'
import { wait } from '../wait.js'

export type WithRetryParameters = {
  /** The delay (in ms) between retries. */
  delay?:
    | ((config: { count: number; error: Error }) => number)
    | number
    | undefined
  /** The max number of times to retry. */
  retryCount?: number | undefined
  /** Whether or not to retry when an error is thrown. */
  shouldRetry?:
    | (({
        count,
        error,
      }: {
        count: number
        error: Error
      }) => Promise<boolean> | boolean)
    | undefined
  /** AbortSignal to cancel retries. */
  signal?: AbortSignal | undefined
}

/** @public */
export type WithRetryErrorType = ErrorType

/** Retries `fn` up to `retryCount` times with a configurable backoff `delay`. */
export async function withRetry<data>(
  fn: () => Promise<data>,
  {
    delay: delay_ = 100,
    retryCount = 2,
    shouldRetry = () => true,
    signal,
  }: WithRetryParameters = {},
): Promise<data> {
  for (let count = 0; ; count++) {
    if (signal?.aborted) throw getAbortError(signal)

    try {
      return await fn()
    } catch (err) {
      if (signal?.aborted) throw getAbortError(signal)
      if (isAbortError(err)) throw err

      const error = err as Error
      const canRetry =
        count < retryCount && (await shouldRetry({ count, error }))
      if (!canRetry) throw err

      const delay =
        typeof delay_ === 'function' ? delay_({ count, error }) : delay_
      if (delay) await wait(delay, { signal })
    }
  }
}
