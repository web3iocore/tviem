/**
 * Transport protocol types (replaces the EVM EIP-1193 request contract).
 *
 * TRON nodes expose a REST surface, so the request contract is expressed in
 * terms of a node role, an endpoint path, an HTTP method and a JSON body —
 * not a JSON-RPC `{ method, params }` envelope.
 */

/** The node role a request is routed to. */
export type TronNode = 'full' | 'solidity' | 'event'

/**
 * A single transport request.
 *
 * - `node` — `'full'` (FullNode `/wallet/*`), `'solidity'`
 *   (SolidityNode `/walletsolidity/*`), or `'event'` (TronGrid `/v1/*` event
 *   index host). Defaults to `'full'`.
 * - `path` — endpoint path without a host. The HTTP transport adds the node
 *   prefix to paths without a leading `/` (e.g. `getaccount`). Paths starting
 *   with `/` (e.g. `/jsonrpc` and `/v1/...`) skip the node prefix and are
 *   appended directly to the selected node's base URL, including its path
 *   prefix. For example, `/jsonrpc` with `https://gateway.example/node`
 *   resolves to `https://gateway.example/node/jsonrpc`.
 * - `body` — JSON request body (omitted for `GET`).
 * - `method` — HTTP verb. Defaults to `'POST'`.
 */
export type TronRequestArgs = {
  node?: TronNode | undefined
  path: string
  body?: unknown
  method?: 'GET' | 'POST' | undefined
}

/** Per-call / per-transport request tuning. */
export type TronRequestOptions = {
  /** Deduplicate concurrent identical requests. */
  dedupe?: boolean | undefined
  /** Max number of retries. Defaults to `0` (no retries). */
  retryCount?: number | undefined
  /** Base delay (in ms) between retries. */
  retryDelay?: number | undefined
  /** AbortSignal to cancel the request (and its retries). */
  signal?: AbortSignal | undefined
  /** Stable id used to salt the dedupe hash. */
  uid?: string | undefined
}

/** The normalized transport request function. */
export type TronRequestFn = <returnType = unknown>(
  args: TronRequestArgs,
  options?: TronRequestOptions | undefined,
) => Promise<returnType>
