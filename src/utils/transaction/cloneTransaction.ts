import {
  InvalidParameterError,
  type InvalidParameterErrorType,
} from '../../errors/parameter.js'
import type { ErrorType } from '../../errors/utils.js'

export type CloneTransactionErrorType = InvalidParameterErrorType | ErrorType

/**
 * Maximum nesting depth of a cloned transaction. Transactions nest shallowly
 * (a contract message stays under ~10 levels). A getter can return a new
 * object on every read, so the recursion is bounded by this depth as well as
 * by cycle detection.
 */
const maxDepth = 64

/**
 * The depth cap bounds the recursion, not the work: shared references are
 * duplicated by design, so levels that each point at the next one twice — a
 * few dozen objects, no cycle — expand to 2^depth copies, and getters minting
 * fresh objects do the same with no sharing at all. The total number of
 * values copied is therefore capped too. A transaction is bounded by the
 * network's 500 KB limit and typed data by what a signer can review; both sit
 * orders of magnitude below this.
 */
const maxValues = 1_000_000

/** The root of every path quoted in an error message. */
const rootLabel = 'transaction'

/** `path` re-rooted at `name`, the parameter the cloned value was passed as. */
function paramAt(path: string, name: string): string {
  return `${name}${path.slice(rootLabel.length)}`
}

/**
 * Deep-copies a transaction into plain data, reading every own enumerable
 * string-keyed property exactly once. This is the snapshot every signing
 * path takes before verifying anything, so the integrity check (`txCheck`)
 * and the signing step read the same values even when the input uses
 * getters or a `Proxy`. The value captured here is the one both checked and
 * signed.
 *
 * The copy works as follows:
 * - accessors are evaluated once and pinned as plain, writable data
 *   properties — the clone carries no getters, setters or `Proxy` traps;
 * - an own `__proto__` key is copied as an ordinary data property (via
 *   `Object.defineProperty`), never as the clone's prototype;
 * - primitives (`string`, `number`, `bigint`, `boolean`, `null`,
 *   `undefined`) pass through; arrays stay arrays; a `Uint8Array` is copied
 *   as a `Uint8Array` (contract `bytes` fields accept raw bytes, and a
 *   plain-object copy would serialize to different bytes than the caller
 *   supplied); every other object is snapshotted into a plain object;
 * - a `function` or `symbol` value throws — a signable transaction is data
 *   only, and live code must not ride along into the signed result;
 * - a circular reference throws, and nesting past a fixed depth cap throws
 *   (a getter can return a new object on every read, which cycle detection
 *   alone does not catch);
 * - the total number of values copied is capped as well: a shared subtree is
 *   duplicated, never aliased, so a small DAG can expand exponentially inside
 *   the depth cap — it throws instead of exhausting memory.
 *
 * @param transaction The transaction (or any plain-data value) to snapshot.
 * @param name The parameter the value was passed as. A thrown error's `param`
 * is the path of the refused value below it (e.g. `transaction.raw_data.data`),
 * or the name alone when the value is refused as a whole. Defaults to
 * `'transaction'`.
 * @returns A structurally equal copy sharing no references with the input.
 */
export function cloneTransaction<transaction>(
  transaction: transaction,
  name = rootLabel,
): transaction {
  return cloneValue(transaction, rootLabel, new WeakSet(), 0, {
    values: 0,
    name,
  }) as transaction
}

function cloneValue(
  value: unknown,
  path: string,
  stack: WeakSet<object>,
  depth: number,
  copied: { values: number; name: string },
): unknown {
  // Counted per value, leaves included, so a huge (or merely claimed — a
  // sparse array's `length`) flat container is bounded the same way.
  if (++copied.values > maxValues)
    throw new InvalidParameterError(
      `Cannot clone the transaction: too large — more than ${maxValues} values (reached at \`${path}\`). A shared or generated subtree is likely being duplicated.`,
      { param: copied.name, reason: 'range' },
    )

  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol')
      throw new InvalidParameterError(
        `Cannot clone the transaction: \`${path}\` is a ${typeof value}, but a signable transaction must be plain data.`,
        { param: paramAt(path, copied.name), reason: 'type' },
      )
    return value
  }

  // Raw bytes are a leaf, not a container: copy the bytes once and keep the
  // type. Snapshotting into a plain object would hand the serializer
  // `{0:…,1:…}` for a `bytes` field the caller passed as a `Uint8Array`.
  // Realm-safe on purpose: `instanceof Uint8Array` is false for bytes
  // created in another realm (iframe, `node:vm`), which would fall through
  // to the plain-object branch and mangle them the same way —
  // `ArrayBuffer.isView` reads the internal typed-array slot instead, so it
  // holds across realms. Any other view (`Int8Array`, `DataView`, …) is not
  // transaction data and is refused here, loudly, rather than snapshotted
  // into a shape the serializer would misread.
  if (ArrayBuffer.isView(value)) {
    const tagged = Object.prototype.toString.call(value).slice(8, -1)
    if (tagged === 'Uint8Array') return new Uint8Array(value as Uint8Array)
    throw new InvalidParameterError(
      `Cannot clone the transaction: \`${path}\` is a ${tagged}; binary data must be a Uint8Array.`,
      { param: paramAt(path, copied.name), reason: 'type' },
    )
  }

  if (depth >= maxDepth)
    throw new InvalidParameterError(
      `Cannot clone the transaction: nesting at \`${path}\` exceeds ${maxDepth} levels.`,
      { param: paramAt(path, copied.name), reason: 'range' },
    )
  if (stack.has(value))
    throw new InvalidParameterError(
      `Cannot clone the transaction: circular reference at \`${path}\`.`,
      { param: paramAt(path, copied.name), reason: 'format' },
    )
  stack.add(value)

  try {
    if (Array.isArray(value)) {
      // Read `length` once, and each element once.
      const length = value.length
      const clone = new Array(length)
      for (let i = 0; i < length; i++)
        clone[i] = cloneValue(
          value[i],
          `${path}[${i}]`,
          stack,
          depth + 1,
          copied,
        )
      return clone
    }

    const clone: Record<string, unknown> = {}
    // defineProperty, not assignment: a key like `__proto__` must become
    // an own data property of the clone, never its prototype.
    for (const key of Object.keys(value))
      Object.defineProperty(clone, key, {
        value: cloneValue(
          (value as Record<string, unknown>)[key],
          `${path}.${key}`,
          stack,
          depth + 1,
          copied,
        ),
        enumerable: true,
        writable: true,
        configurable: true,
      })
    return clone
  } finally {
    stack.delete(value)
  }
}
