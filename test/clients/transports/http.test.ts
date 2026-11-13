import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineChain } from '../../../src/chains/defineChain.js'
import {
  http,
  normalizeTronError,
} from '../../../src/clients/transports/http.js'
import {
  TronBroadcastError,
  TronContractValidateError,
  TronNodeError,
} from '../../../src/errors/node.js'
import { HttpRequestError } from '../../../src/errors/request.js'
import { UrlRequiredError } from '../../../src/errors/transport.js'
import { stringToHex } from '../../../src/utils/encoding/toHex.js'

const HOST = 'https://node.example'
const API_KEY = 'super-secret-key'

/** UTF-8 → hex, as TRON encodes node error messages. */
const hexMsg = (s: string) => Buffer.from(s, 'utf8').toString('hex')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function transport(config = {}) {
  return http(HOST, { apiKey: API_KEY, ...config })({})
}

test('throws UrlRequiredError when no url and no chain', () => {
  expect(() => http()({})).toThrow(UrlRequiredError)
})

test('POST full node: url, method, headers and JSON body', async () => {
  const t = transport()
  await t.config.request({
    node: 'full',
    path: 'getaccount',
    body: { address: '4112' },
  })
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(url).toBe(`${HOST}/wallet/getaccount`)
  expect(init.method).toBe('POST')
  const headers = new Headers(init.headers)
  expect(headers.get('Content-Type')).toBe('application/json')
  expect(headers.get('TRON-PRO-API-KEY')).toBe(API_KEY)
  expect(init.body).toBe(JSON.stringify({ address: '4112' }))
})

test('solidity node routes to the /walletsolidity prefix', async () => {
  const t = transport()
  await t.config.request({ node: 'solidity', path: 'getaccount', body: {} })
  const [url] = fetchMock.mock.calls[0] as [string]
  expect(url).toBe(`${HOST}/walletsolidity/getaccount`)
})

test('event node routes a /v1 path to the event host root (no wallet prefix)', async () => {
  const t = transport({ eventUrl: 'https://event.example' })
  await t.config.request({
    node: 'event',
    path: '/v1/contracts/TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe/events',
    method: 'GET',
  })
  const [url] = fetchMock.mock.calls[0] as [string]
  expect(url).toBe(
    'https://event.example/v1/contracts/TA5DvvvmYbS75o3DKtgy2ATAGVHhpFkRLe/events',
  )
})

test('node defaults to full; GET sends no body', async () => {
  const t = transport()
  await t.config.request({ path: 'getnowblock', method: 'GET' })
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(url).toBe(`${HOST}/wallet/getnowblock`)
  expect(init.method).toBe('GET')
  expect(init.body).toBeUndefined()
})

test('leading-slash path escapes the node prefix', async () => {
  const t = transport()
  await t.config.request({ path: '/jsonrpc', body: {} })
  const [url] = fetchMock.mock.calls[0] as [string]
  expect(url).toBe(`${HOST}/jsonrpc`)
})

test('normal business object passes through', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ balance: 5 }))
  const t = transport()
  await expect(
    t.config.request({ node: 'solidity', path: 'getaccount', body: {} }),
  ).resolves.toEqual({ balance: 5 })
})

test('{ result: true } passes through', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ result: true, txid: 'ab' }))
  const t = transport()
  await expect(
    t.config.request({ path: 'broadcasttransaction', body: {} }),
  ).resolves.toEqual({ result: true, txid: 'ab' })
})

test('form 1: { Error } → TronValidationError (plaintext)', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ Error: 'validation failed' }))
  const t = transport()
  await expect(
    t.config.request({ path: 'broadcasttransaction', body: {} }),
  ).rejects.toMatchObject({
    name: 'TronValidationError',
    shortMessage: 'validation failed',
  })
})

test('form 2: { result: { code, message } } → TronContractValidateError (hex decoded)', async () => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      result: {
        code: 'CONTRACT_VALIDATE_ERROR',
        message: hexMsg('bad contract'),
      },
    }),
  )
  const t = transport()
  const err: any = await t.config
    .request({ path: 'triggersmartcontract', body: {} })
    .catch((e) => e)
  expect(err).toBeInstanceOf(TronContractValidateError)
  expect(err.code).toBe('CONTRACT_VALIDATE_ERROR')
  expect(err.shortMessage).toBe('bad contract')
})

test('form 3: { result: false, code } → TronBroadcastError (txid)', async () => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      result: false,
      code: 'TAPOS_ERROR',
      message: hexMsg('tapos check failed'),
      txid: 'cafe',
    }),
  )
  const t = transport()
  const err: any = await t.config
    .request({ path: 'broadcasttransaction', body: {} })
    .catch((e) => e)
  expect(err).toBeInstanceOf(TronBroadcastError)
  expect(err.code).toBe('TAPOS_ERROR')
  expect(err.txid).toBe('cafe')
  expect(err.shortMessage).toBe('tapos check failed')
})

test('form 4: top-level { code } → TronNodeError', async () => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ code: 'SIGERROR', message: hexMsg('bad signature') }),
  )
  const t = transport()
  const err: any = await t.config
    .request({ path: 'broadcasttransaction', body: {} })
    .catch((e) => e)
  expect(err).toBeInstanceOf(TronNodeError)
  expect(err.code).toBe('SIGERROR')
  expect(err.shortMessage).toBe('bad signature')
})

test('non-2xx → HttpRequestError with status', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ nope: 1 }, 500))
  const t = transport()
  const err: any = await t.config
    .request({ path: 'getnowblock', method: 'GET' })
    .catch((e) => e)
  expect(err).toBeInstanceOf(HttpRequestError)
  expect(err.status).toBe(500)
})

test('fetch failure → HttpRequestError', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('network down'))
  const t = transport()
  await expect(
    t.config.request({ path: 'getnowblock', method: 'GET' }),
  ).rejects.toBeInstanceOf(HttpRequestError)
})

test('raw mode skips normalization', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ Error: 'validation failed' }))
  const t = transport({ raw: true })
  await expect(
    t.config.request({ path: 'broadcasttransaction', body: {} }),
  ).resolves.toEqual({ Error: 'validation failed' })
})

test('errors never leak the API key', async () => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ code: 'SIGERROR', message: hexMsg('bad signature') }),
  )
  const t = transport()
  const err: any = await t.config
    .request({ path: 'broadcasttransaction', body: { secret: 1 } })
    .catch((e) => e)
  const serialized = `${err.message}\n${JSON.stringify(err.response)}`
  expect(serialized).not.toContain(API_KEY)
})

test('value exposes fullUrl / solidityUrl / fetchOptions', () => {
  const t = http(HOST, {
    apiKey: API_KEY,
    solidityUrl: 'https://solidity.example',
  })({})
  expect(t.value?.fullUrl).toBe(HOST)
  expect(t.value?.solidityUrl).toBe('https://solidity.example')
  // headers is a `Headers` instance: lookup is by the platform API,
  // case-insensitively, not by object indexing.
  expect(
    (t.value?.fetchOptions?.headers as Headers).get('tron-pro-api-key'),
  ).toBe(API_KEY)
})

/** A chain whose three node roles live on distinct hosts. */
const chain = defineChain({
  id: 1,
  name: 'Test',
  nativeCurrency: { name: 'TRON', symbol: 'TRX', decimals: 6 },
  rpcUrls: {
    default: {
      full: { http: ['https://full.chain'] },
      solidity: { http: ['https://solidity.chain'] },
      event: { http: ['https://event.chain'] },
    },
  },
})

/** The same chain with no event host configured. */
const chainWithoutEvent = defineChain({
  ...chain,
  rpcUrls: {
    default: {
      full: { http: ['https://full.chain'] },
      solidity: { http: ['https://solidity.chain'] },
    },
  },
})

test('solidityUrl: config wins over an explicit url and the chain', () => {
  const t = http(HOST, { solidityUrl: 'https://solidity.example' })({ chain })
  expect(t.value?.solidityUrl).toBe('https://solidity.example')
})

test('solidityUrl: an explicit url wins over the chain solidity host', () => {
  const t = http(HOST)({ chain })
  expect(t.value?.solidityUrl).toBe(HOST)
})

test('solidityUrl: without an explicit url, the chain solidity host is used', () => {
  const t = http()({ chain })
  expect(t.value?.fullUrl).toBe('https://full.chain')
  expect(t.value?.solidityUrl).toBe('https://solidity.chain')
})

test('solidityUrl: without a chain, defaults to the full url', () => {
  const t = http(HOST)({})
  expect(t.value?.solidityUrl).toBe(HOST)
})

test('eventUrl: config wins over an explicit url and the chain', () => {
  const t = http(HOST, { eventUrl: 'https://event.example' })({ chain })
  expect(t.value?.eventUrl).toBe('https://event.example')
})

test('eventUrl: an explicit url wins over the chain event host', () => {
  const t = http(HOST)({ chain })
  expect(t.value?.eventUrl).toBe(HOST)
})

test('eventUrl: without an explicit url, the chain event host is used', () => {
  const t = http()({ chain })
  expect(t.value?.eventUrl).toBe('https://event.chain')
})

test('eventUrl: without an explicit url or a chain event host, the chain full host is used', () => {
  const t = http()({ chain: chainWithoutEvent })
  expect(t.value?.eventUrl).toBe('https://full.chain')
})

test('eventUrl: without a chain, defaults to the full url', () => {
  const t = http(HOST)({})
  expect(t.value?.eventUrl).toBe(HOST)
})

test('normalizeTronError returns non-object bodies unchanged', () => {
  expect(normalizeTronError(null, { node: 'full', path: 'x' })).toBe(null)
  expect(normalizeTronError('ok', { node: 'full', path: 'x' })).toBe('ok')
})

// --- normalizeTronError (called directly): hex decode + graceful passthrough.
// `'full'` is the valid TronNode role (the task's `'fullNode'` isn't a member).
const NODE = { node: 'full', path: '/wallet/triggersmartcontract' } as const

/** Runs `fn`, returning the error it throws (fails if it doesn't throw). */
function caught(fn: () => unknown): any {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw')
}

test('normalizeTronError form 2: hex message → TronContractValidateError (decoded)', () => {
  const err = caught(() =>
    normalizeTronError(
      {
        result: {
          code: 'CONTRACT_VALIDATE_ERROR',
          message: stringToHex('insufficient balance'),
        },
      },
      NODE,
    ),
  )
  expect(err).toBeInstanceOf(TronContractValidateError)
  expect(err.code).toBe('CONTRACT_VALIDATE_ERROR')
  expect(err.shortMessage).toBe('insufficient balance')
  expect(err.node).toBe('full')
  expect(err.path).toBe('/wallet/triggersmartcontract')
})

test('normalizeTronError form 3: { result:false, code, hex message, txid } → TronBroadcastError', () => {
  const err = caught(() =>
    normalizeTronError(
      {
        result: false,
        code: 'SIGERROR',
        message: stringToHex('signature error'),
        txid: 'deadbeef01',
      },
      NODE,
    ),
  )
  expect(err).toBeInstanceOf(TronBroadcastError)
  expect(err.code).toBe('SIGERROR')
  expect(err.txid).toBe('deadbeef01')
  expect(err.shortMessage).toBe('signature error')
})

test.each([
  'broadcasttransaction',
  '/wallet/broadcasttransaction',
  'broadcasthex',
  '/wallet/broadcasthex',
])('normalizeTronError form 3 on %s: a rejection without `result` → TronBroadcastError', (path) => {
  // The body a node sends: a `false` result is left out of the JSON.
  const body = {
    code: 'SIGERROR',
    txid: 'deadbeef01',
    message: stringToHex('Validate signature error'),
  }
  const err = caught(() => normalizeTronError(body, { node: 'full', path }))
  expect(err).toBeInstanceOf(TronBroadcastError)
  expect(err.name).toBe('TronBroadcastError')
  expect(err.code).toBe('SIGERROR')
  expect(err.txid).toBe('deadbeef01')
  expect(err.shortMessage).toBe('Validate signature error')
  expect(err.response).toEqual(body)
})

test('normalizeTronError: a success acknowledgement on a broadcast path is returned unchanged', () => {
  const path = '/wallet/broadcasttransaction'
  const ack = { result: true, txid: 'deadbeef01' }
  expect(normalizeTronError(ack, { node: 'full', path })).toBe(ack)
  const withCode = { code: 'SUCCESS', txid: 'deadbeef01' }
  expect(normalizeTronError(withCode, { node: 'full', path })).toBe(withCode)
})

test('normalizeTronError: a top-level code without `result` stays a TronNodeError off the broadcast paths', () => {
  const err = caught(() =>
    normalizeTronError(
      { code: 'SIGERROR', txid: 'deadbeef01', message: stringToHex('x') },
      NODE,
    ),
  )
  expect(err).toBeInstanceOf(TronNodeError)
  expect(err).not.toBeInstanceOf(TronBroadcastError)
  expect(err.name).toBe('TronNodeError')
})

test('normalizeTronError form 4: non-success top-level code + hex message → TronNodeError', () => {
  const err = caught(() =>
    normalizeTronError(
      { code: 'SOME_ERR', message: stringToHex('some node error') },
      NODE,
    ),
  )
  expect(err).toBeInstanceOf(TronNodeError)
  expect(err.code).toBe('SOME_ERR')
  expect(err.shortMessage).toBe('some node error')
})

test('normalizeTronError decodes a message with the 0x prefix stripped', () => {
  const err = caught(() =>
    normalizeTronError(
      { code: 'SOME_ERR', message: stringToHex('no prefix').slice(2) },
      NODE,
    ),
  )
  expect(err.shortMessage).toBe('no prefix')
})

test('normalizeTronError passes a non-hex message through undecoded', () => {
  const err = caught(() =>
    normalizeTronError(
      { code: 'SOME_ERR', message: 'CONTRACT_VALIDATE_ERROR' },
      NODE,
    ),
  )
  expect(err.shortMessage).toBe('CONTRACT_VALIDATE_ERROR')
})

test('normalizeTronError passes an odd-length hex message through undecoded', () => {
  const err = caught(() =>
    normalizeTronError({ code: 'SOME_ERR', message: 'abc' }, NODE),
  )
  expect(err.shortMessage).toBe('abc')
})

test('normalizeTronError decodes an empty message to "" (falls back to default text)', () => {
  const err = caught(() =>
    normalizeTronError({ code: 'SOME_ERR', message: '' }, NODE),
  )
  expect(err.code).toBe('SOME_ERR')
  expect(err.shortMessage).toBe('The node returned an error.')
})

test('normalizeTronError returns { result: true } unchanged (no throw)', () => {
  const body = { result: true, txid: 'ab' }
  expect(normalizeTronError(body, NODE)).toBe(body)
})

test('normalizeTronError returns a SUCCESS-code body unchanged (no throw)', () => {
  const body = { code: 'SUCCESS', result: true }
  expect(normalizeTronError(body, NODE)).toBe(body)
})

// java-tron renders int64 fields as bare JSON numbers; a naive JSON.parse
// corrupts them past 2^53-1 before any BigInt() coercion can help. The body
// MUST be built from raw text — a JS number literal in this test file would
// itself already be corrupted at source-parse time.
test('re-materializes unsafe integer literals losslessly as bigint', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response('{"balance":9007199254740993,"small":5,"note":"ok"}'),
  )
  const t = transport()
  const body = (await t.config.request({
    node: 'solidity',
    path: 'getaccount',
    body: {},
  })) as { balance: unknown; small: unknown; note: unknown }
  expect(body.balance).toBe(9007199254740993n) // 2^53 + 1, exact
  expect(body.small).toBe(5) // safe integers stay numbers
  expect(body.note).toBe('ok')
})

// `fetch` resolves on response HEADERS; the body can still be streaming. The
// timeout and the caller's AbortSignal must stay armed until the body has been
// read, or a trickling node hangs the call with both safety nets already
// disconnected. These pin the whole lifetime, not just the fetch phase.

/** A response whose headers are ready but whose body never settles. */
function stallingBody(signal: AbortSignal | undefined, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: () =>
      new Promise<string>((_resolve, reject) => {
        signal?.addEventListener('abort', () =>
          reject(
            Object.assign(new Error('The operation was aborted.'), {
              name: 'AbortError',
            }),
          ),
        )
      }),
  } as unknown as Response
}

test('the timeout covers the response body, not just the headers', async () => {
  const transport = http('https://node.example', {
    timeout: 20,
    retryCount: 0,
    fetchFn: ((_url: string, init: RequestInit) =>
      Promise.resolve(stallingBody(init.signal ?? undefined))) as never,
  })({})

  await expect(
    transport.request({ path: 'wallet/getnowblock', body: {} }),
  ).rejects.toThrow(/timed out/i)
})

test('the timeout covers a stalling ERROR body too', async () => {
  const transport = http('https://node.example', {
    timeout: 20,
    retryCount: 0,
    fetchFn: ((_url: string, init: RequestInit) =>
      Promise.resolve(stallingBody(init.signal ?? undefined, 500))) as never,
  })({})

  // Not a bare status-500 HttpRequestError: nothing ever came back to explain
  // the 500, and the reason the call ended was the timeout.
  await expect(
    transport.request({ path: 'wallet/getnowblock', body: {} }),
  ).rejects.toThrow(/timed out/i)
})

test("a caller's AbortSignal still cancels once the body is streaming", async () => {
  const controller = new AbortController()
  const transport = http('https://node.example', {
    timeout: 10_000,
    retryCount: 0,
    fetchFn: ((_url: string, init: RequestInit) => {
      // Headers have arrived; the caller changes its mind afterwards.
      setTimeout(() => controller.abort(), 5)
      return Promise.resolve(stallingBody(init.signal ?? undefined))
    }) as never,
  })({})

  const err = (await transport
    .request(
      { path: 'wallet/getnowblock', body: {} },
      { signal: controller.signal },
    )
    .catch((e) => e)) as Error
  // The caller's abort propagates as an abort — never as the transport's own
  // TimeoutError, and never as a status-200 HttpRequestError.
  expect(err.name).toBe('AbortError')
})

test('an abort during the body read is not reported as a status-200 error', async () => {
  const transport = http('https://node.example', {
    timeout: 20,
    retryCount: 0,
    fetchFn: ((_url: string, init: RequestInit) =>
      Promise.resolve(stallingBody(init.signal ?? undefined))) as never,
  })({})

  const err = (await transport
    .request({ path: 'wallet/getnowblock', body: {} })
    .catch((e) => e)) as HttpRequestError & { status?: number }
  expect(err).not.toBeInstanceOf(HttpRequestError)
  expect(err.status).toBeUndefined()
})

// Header merging goes through the platform `Headers` class, so every legal
// `HeadersInit` form survives and names merge case-insensitively. The old
// object spread silently emptied a `Headers` instance, turned a tuple list
// into a header named "0", and let a lowercase `content-type` or
// `tron-pro-api-key` ride alongside the default as a duplicate.

/** What actually reaches fetch, re-materialized through the platform. */
function capturedHeaders(fetchOptions: RequestInit) {
  let seen: Headers | undefined
  const transport = http('https://node.example', {
    apiKey: 'config-key',
    fetchOptions: fetchOptions as never,
    retryCount: 0,
    fetchFn: (async (_url: string, init: RequestInit) => {
      seen = new Headers(init.headers)
      return new Response('{}', { status: 200 })
    }) as never,
  })({})
  return transport
    .request({ path: 'wallet/getnowblock', body: {} })
    .then(() => seen!)
}

test('a Headers-instance fetchOptions.headers survives the merge', async () => {
  const seen = await capturedHeaders({
    headers: new Headers([['X-Custom', 'a']]),
  })
  expect(seen.get('X-Custom')).toBe('a')
  expect(seen.get('Content-Type')).toBe('application/json')
})

test('a tuple-list fetchOptions.headers survives the merge', async () => {
  const seen = await capturedHeaders({ headers: [['X-Custom', 'b']] })
  expect(seen.get('X-Custom')).toBe('b')
  expect(seen.get('0')).toBeNull() // the spread artifact must not exist
})

test("a caller's explicit content-type wins over the JSON default", async () => {
  const seen = await capturedHeaders({
    headers: { 'content-type': 'text/plain' },
  })
  expect(seen.get('Content-Type')).toBe('text/plain')
})

test('the config apiKey wins over any header spelling of the key', async () => {
  const seen = await capturedHeaders({
    headers: { 'tron-pro-api-key': 'stale-header-key' },
  })
  // Exactly one key on the wire, and it is the config's.
  expect(seen.get('TRON-PRO-API-KEY')).toBe('config-key')
})

// Redirects: fetch's default `follow` re-sends custom headers — including
// `TRON-PRO-API-KEY` — to whatever cross-origin target a 30x names. The
// transport must refuse redirects unless the caller explicitly opts in.

/** The `redirect` mode that actually reaches fetch. */
function capturedRedirect(fetchOptions?: RequestInit) {
  let seen: RequestInit['redirect']
  const transport = http(HOST, {
    fetchOptions: fetchOptions as never,
    retryCount: 0,
    fetchFn: (async (_url: string, init: RequestInit) => {
      seen = init.redirect
      return new Response('{}', { status: 200 })
    }) as never,
  })({})
  return transport
    .request({ path: 'wallet/getnowblock', body: {} })
    .then(() => seen)
}

test('requests refuse redirects by default (redirect: "error")', async () => {
  expect(await capturedRedirect()).toBe('error')
})

test("a caller's explicit fetchOptions.redirect is honored as an opt-in", async () => {
  expect(await capturedRedirect({ redirect: 'follow' })).toBe('follow')
})

// ── Basic credentials in a node URL ────────────────────────────────────────

const basic = (credentials: string) =>
  `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`

/** The URL and headers of the n-th fetch call. */
function fetched(n = 0) {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit]
  return { url, headers: new Headers(init.headers), init }
}

test('URL credentials are sent as an Authorization header, to the URL without them', async () => {
  const t = http('https://user:s3cretpw@node.example', { apiKey: API_KEY })({})
  await t.config.request({ path: 'getnowblock', body: {} })
  const { url, headers } = fetched()
  expect(url).toBe('https://node.example/wallet/getnowblock')
  expect(headers.get('Authorization')).toBe(basic('user:s3cretpw'))
  // The other headers are unchanged.
  expect(headers.get('Content-Type')).toBe('application/json')
  expect(headers.get('TRON-PRO-API-KEY')).toBe(API_KEY)
})

test('a URL with credentials is usable with a fetch that refuses credentials in URLs', async () => {
  // The platform `Request` constructor throws for a URL with credentials, as
  // the platform `fetch` does.
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    new Request(url, init)
    return jsonResponse({ ok: true })
  })
  expect(() => new Request('https://user:pw@node.example/x')).toThrow()
  const t = http('https://user:pw@node.example')({})
  await expect(
    t.config.request({ path: 'getnowblock', body: {} }),
  ).resolves.toEqual({ ok: true })
})

test.each([
  [
    'percent-encoded characters',
    'https://us%40er:p%3Ass%2Fw%23rd@node.example',
    'us@er:p:ss/w#rd',
  ],
  ['a user name only', 'https://token@node.example', 'token:'],
  ['a password only', 'https://:onlypw@node.example', ':onlypw'],
  [
    'non-Latin-1 characters',
    'https://user:%E5%AF%86%E7%A0%81@node.example',
    'user:密码',
  ],
])('URL credentials with %s', async (_, url, credentials) => {
  const t = http(url)({})
  await t.config.request({ path: 'getnowblock', body: {} })
  const { url: requested, headers } = fetched()
  expect(requested).toBe('https://node.example/wallet/getnowblock')
  expect(headers.get('Authorization')).toBe(basic(credentials))
})

test('URL credentials keep the port, path prefix and every node path form', async () => {
  const t = http('https://user:pw@node.example:8443/prefix/')({})
  await t.config.request({ node: 'full', path: 'getaccount', body: {} })
  await t.config.request({ node: 'solidity', path: 'getaccount', body: {} })
  await t.config.request({ path: '/jsonrpc', body: {} })
  expect(fetched(0).url).toBe(
    'https://node.example:8443/prefix/wallet/getaccount',
  )
  expect(fetched(1).url).toBe(
    'https://node.example:8443/prefix/walletsolidity/getaccount',
  )
  expect(fetched(2).url).toBe('https://node.example:8443/prefix/jsonrpc')
  for (const n of [0, 1, 2])
    expect(fetched(n).headers.get('Authorization')).toBe(basic('user:pw'))
})

test('each node sends only the credentials of its own URL', async () => {
  const t = http('https://full:fullpw@full.example', {
    solidityUrl: 'https://sol:solpw@solidity.example',
    eventUrl: 'https://event.example',
  })({})
  await t.config.request({ node: 'full', path: 'getnowblock', body: {} })
  await t.config.request({ node: 'solidity', path: 'getnowblock', body: {} })
  await t.config.request({ node: 'event', path: '/v1/x', method: 'GET' })
  expect(fetched(0).url).toBe('https://full.example/wallet/getnowblock')
  expect(fetched(0).headers.get('Authorization')).toBe(basic('full:fullpw'))
  expect(fetched(1).url).toBe(
    'https://solidity.example/walletsolidity/getnowblock',
  )
  expect(fetched(1).headers.get('Authorization')).toBe(basic('sol:solpw'))
  // A node whose URL has no credentials gets no Authorization header.
  expect(fetched(2).url).toBe('https://event.example/v1/x')
  expect(fetched(2).headers.has('Authorization')).toBe(false)
})

test('credentials in a chain-derived URL are handled the same way', async () => {
  const withCredentials = defineChain({
    ...chain,
    rpcUrls: {
      default: {
        full: { http: ['https://user:pw@full.chain'] },
        solidity: { http: ['https://solidity.chain'] },
      },
    },
  })
  const t = http()({ chain: withCredentials })
  await t.config.request({ node: 'full', path: 'getnowblock', body: {} })
  await t.config.request({ node: 'solidity', path: 'getnowblock', body: {} })
  expect(fetched(0).url).toBe('https://full.chain/wallet/getnowblock')
  expect(fetched(0).headers.get('Authorization')).toBe(basic('user:pw'))
  expect(fetched(1).headers.has('Authorization')).toBe(false)
})

test('the event node uses the credentials of its own URL', async () => {
  const t = http('https://full.example', {
    eventUrl: 'https://ev:evpw@event.example',
  })({})
  await t.config.request({ node: 'event', path: '/v1/x', method: 'GET' })
  await t.config.request({ node: 'full', path: 'getnowblock', body: {} })
  expect(fetched(0).url).toBe('https://event.example/v1/x')
  expect(fetched(0).headers.get('Authorization')).toBe(basic('ev:evpw'))
  expect(fetched(1).url).toBe('https://full.example/wallet/getnowblock')
  expect(fetched(1).headers.has('Authorization')).toBe(false)
})

// Credentials that are not valid percent-encoding are used as written; the
// request still goes to the URL without them.
test.each([
  ['a literal %', 'https://user:S3cr3tPw%@node.example', 'user:S3cr3tPw%'],
  ['a literal % in the user name', 'https://us%er:pw@node.example', 'us%er:pw'],
  [
    'an escape that is not UTF-8',
    'https://user:%E9pw@node.example',
    'user:%E9pw',
  ],
])('URL credentials with %s', async (_, url, credentials) => {
  const t = http(url)({})
  await t.config.request({ path: 'getnowblock', body: {} })
  const { url: requested, headers } = fetched()
  expect(requested).toBe('https://node.example/wallet/getnowblock')
  expect(headers.get('Authorization')).toBe(basic(credentials))
})

test('long URL credentials are encoded in full', async () => {
  const password = 'a'.repeat(200_000)
  const t = http(`https://user:${password}@node.example`)({})
  await t.config.request({ path: 'getnowblock', body: {} })
  const { url, headers } = fetched()
  expect(url).toBe('https://node.example/wallet/getnowblock')
  expect(headers.get('Authorization')).toBe(basic(`user:${password}`))
})

test('a base URL that does not parse is requested as given', async () => {
  const t = http('node.example')({})
  await t.config.request({ path: 'getnowblock', body: {} })
  const { url, headers } = fetched()
  expect(url).toBe('node.example/wallet/getnowblock')
  expect(headers.has('Authorization')).toBe(false)
})

test('headers set on the transport value later apply to every node', async () => {
  const t = http('https://user:pw@full.example', {
    solidityUrl: 'https://solidity.example',
  })({})
  ;(t.value?.fetchOptions?.headers as Headers).set('X-Later', 'yes')
  await t.config.request({ node: 'full', path: 'getnowblock', body: {} })
  await t.config.request({ node: 'solidity', path: 'getnowblock', body: {} })
  expect(fetched(0).headers.get('X-Later')).toBe('yes')
  expect(fetched(0).headers.get('Authorization')).toBe(basic('user:pw'))
  expect(fetched(1).headers.get('X-Later')).toBe('yes')
  expect(fetched(1).headers.has('Authorization')).toBe(false)
})

test("a caller's Authorization header takes precedence over URL credentials", async () => {
  const t = http('https://user:pw@node.example', {
    fetchOptions: { headers: { authorization: 'Bearer caller-token' } },
  })({})
  await t.config.request({ path: 'getnowblock', body: {} })
  const { url, headers } = fetched()
  expect(url).toBe('https://node.example/wallet/getnowblock')
  expect(headers.get('Authorization')).toBe('Bearer caller-token')
})

test('a URL without credentials is requested as given, with no Authorization header', async () => {
  // Spelled so that re-serializing it through `URL` would change it.
  const t = http('HTTPS://Node.Example:443/prefix')({})
  await t.config.request({ path: 'getnowblock', body: {} })
  const { url, headers } = fetched()
  expect(url).toBe('HTTPS://Node.Example:443/prefix/wallet/getnowblock')
  expect(headers.has('Authorization')).toBe(false)
})

test('request errors for a URL with credentials do not contain them', async () => {
  const t = http('https://user:s3cretpw@node.example')({})
  const texts = async (run: () => void) => {
    run()
    const err: any = await t.config
      .request({ path: 'getnowblock', body: {} })
      .catch((e) => e)
    expect(err).toBeInstanceOf(HttpRequestError)
    return [
      err.message,
      String(err.details),
      String(err.url),
      String(err.cause?.message),
      JSON.stringify(err),
    ].join('\n')
  }

  const status = await texts(() =>
    fetchMock.mockResolvedValueOnce(
      new Response('unauthorized', { status: 401 }),
    ),
  )
  // A fetch failure whose message quotes the URL it was given.
  const network = await texts(() =>
    fetchMock.mockImplementationOnce(async (url: string) => {
      throw new TypeError(`fetch failed for ${url}`)
    }),
  )
  for (const text of [status, network]) {
    expect(text).not.toContain('s3cretpw')
    expect(text).not.toContain(basic('user:s3cretpw'))
    expect(text).toContain('https://node.example/wallet/getnowblock')
  }
})

test('the transport value keeps the URLs as configured and has no Authorization header', () => {
  const t = http('https://user:pw@node.example', { apiKey: API_KEY })({})
  expect(t.value?.fullUrl).toBe('https://user:pw@node.example')
  expect(t.value?.solidityUrl).toBe('https://user:pw@node.example')
  expect(t.value?.eventUrl).toBe('https://user:pw@node.example')
  expect((t.value?.fetchOptions?.headers as Headers).has('Authorization')).toBe(
    false,
  )
})
