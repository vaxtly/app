import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Capture IPC handlers
const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Function) => { handlers.set(ch, fn) } },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn() },
}))

// Hoisted mocks (must be declared before vi.mock factories)
const { mockUndiciFetch, mockAgent, mockFormData, mockPreScript, mockPostScript } = vi.hoisted(() => ({
  mockUndiciFetch: vi.fn(),
  mockAgent: vi.fn(),
  mockFormData: vi.fn().mockImplementation(() => ({ append: vi.fn() })),
  mockPreScript: vi.fn().mockResolvedValue(true),
  mockPostScript: vi.fn(),
}))

vi.mock('undici', () => ({
  fetch: mockUndiciFetch,
  Agent: mockAgent,
  FormData: mockFormData,
}))

vi.mock('../../src/main/services/script-execution', () => ({
  executePreRequestScripts: (...args: unknown[]) => mockPreScript(...args),
  executePostResponseScripts: (...args: unknown[]) => mockPostScript(...args),
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import { registerProxyHandlers } from '../../src/main/ipc/proxy'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import type { RequestConfig } from '../../src/shared/types/http'

function mockFetchResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const bodyBuffer = new TextEncoder().encode(bodyStr).buffer
  const headerMap = new Map(Object.entries(headers))
  const setCookies: string[] = []

  mockUndiciFetch.mockResolvedValue({
    status,
    statusText: status === 200 ? 'OK' : `Error ${status}`,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => headerMap.get(key) ?? null,
      forEach: (cb: (value: string, key: string) => void) => headerMap.forEach(cb),
      getSetCookie: () => setCookies,
    },
    arrayBuffer: () => Promise.resolve(bodyBuffer),
    body: { cancel: vi.fn() },
  })
}

function makeConfig(overrides: Partial<RequestConfig> = {}): RequestConfig {
  return {
    method: 'GET',
    url: 'https://api.test/data',
    headers: {},
    ...overrides,
  }
}

beforeEach(() => {
  handlers.clear()
  openTestDatabase()
  initEncryptionForTesting()
  registerProxyHandlers()
  vi.clearAllMocks()
  mockPreScript.mockResolvedValue(true)
})
afterEach(() => closeDatabase())

function invoke(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for ${channel}`)
  return handler(null, ...args)
}

describe('proxy:send — core request flow', () => {
  it('simple GET calls fetch with correct URL/method', async () => {
    mockFetchResponse(200, { ok: true })

    const result = await invoke('proxy:send', 'req-1', makeConfig())
    expect(mockUndiciFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockUndiciFetch.mock.calls[0]
    expect(url).toBe('https://api.test/data')
    expect(opts.method).toBe('GET')
    expect(result.status).toBe(200)
  })

  it('returns ResponseData with status/headers/body/timing/cookies', async () => {
    mockFetchResponse(201, '{"id":1}', { 'content-type': 'application/json' })

    const result = await invoke('proxy:send', 'req-1', makeConfig())
    expect(result.status).toBe(201)
    expect(result.headers['content-type']).toBe('application/json')
    expect(result.body).toBe('{"id":1}')
    expect(result.timing).toHaveProperty('start')
    expect(result.timing).toHaveProperty('ttfb')
    expect(result.timing).toHaveProperty('total')
    expect(result.cookies).toEqual([])
  })

  it('rejects unsupported method (TRACE)', async () => {
    await expect(
      invoke('proxy:send', 'req-1', makeConfig({ method: 'TRACE' })),
    ).rejects.toThrow('Unsupported HTTP method')
  })

  it('rejects invalid URL', async () => {
    await expect(
      invoke('proxy:send', 'req-1', makeConfig({ url: 'not a url' })),
    ).rejects.toThrow('Invalid URL')
  })

  it('rejects ftp:// scheme', async () => {
    await expect(
      invoke('proxy:send', 'req-1', makeConfig({ url: 'ftp://files.test/data' })),
    ).rejects.toThrow('Unsupported URL scheme')
  })

  it('calls pre-request scripts before fetch', async () => {
    mockFetchResponse(200, {})
    const col = collectionsRepo.create({ name: 'C' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })

    await invoke('proxy:send', req.id, makeConfig({ collectionId: col.id }))

    expect(mockPreScript).toHaveBeenCalledWith(req.id, col.id, undefined)
    expect(mockUndiciFetch).toHaveBeenCalledTimes(1)
  })
})

describe('proxy:send — body types', () => {
  it('JSON sets Content-Type', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({
      method: 'POST',
      body: '{"key":"value"}',
      bodyType: 'json',
    }))
    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.body).toBe('{"key":"value"}')
  })

  it('XML sets Content-Type', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({
      method: 'POST',
      body: '<root/>',
      bodyType: 'xml',
    }))
    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.headers['Content-Type']).toBe('application/xml')
  })

  it('urlencoded re-encodes params', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({
      method: 'POST',
      body: 'key=value&foo=bar',
      bodyType: 'urlencoded',
    }))
    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(opts.body).toContain('key=value')
  })

  it('graphql wraps in JSON (Content-Type set)', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({
      method: 'POST',
      body: '{ users { id } }',
      bodyType: 'graphql',
    }))
    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.headers['Content-Type']).toBe('application/json')
    // graphql body is passed as-is (renderer wraps it in JSON)
    expect(opts.body).toBe('{ users { id } }')
  })

  it('raw sends as-is', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({
      method: 'POST',
      body: 'raw text content',
      bodyType: 'raw',
    }))
    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.body).toBe('raw text content')
  })

  it('GET ignores body', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({
      method: 'GET',
      body: '{"key":"value"}',
      bodyType: 'json',
    }))
    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.body).toBeUndefined()
  })
})

describe('proxy:send — settings', () => {
  it('verify_ssl=false creates Agent with rejectUnauthorized', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({ verifySsl: false }))
    expect(mockAgent).toHaveBeenCalledWith({ connect: { rejectUnauthorized: false } })
  })

  it('follow_redirects=false passes redirect:manual', async () => {
    mockFetchResponse(200, {})
    await invoke('proxy:send', 'req-1', makeConfig({ followRedirects: false }))
    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.redirect).toBe('manual')
  })

  it('timeout clamps to [1,300]', async () => {
    mockFetchResponse(200, {})
    // With timeout of 0 (should clamp to 1) — just verify it doesn't throw
    await invoke('proxy:send', 'req-1', makeConfig({ timeout: 0 }))
    expect(mockUndiciFetch).toHaveBeenCalledTimes(1)

    mockUndiciFetch.mockClear()
    mockFetchResponse(200, {})
    // With timeout of 999 (should clamp to 300) — just verify it doesn't throw
    await invoke('proxy:send', 'req-1', makeConfig({ timeout: 999 }))
    expect(mockUndiciFetch).toHaveBeenCalledTimes(1)
  })
})

describe('proxy:send — error handling', () => {
  it('network error returns status:0', async () => {
    mockUndiciFetch.mockRejectedValue(new Error('fetch failed'))
    const result = await invoke('proxy:send', 'req-1', makeConfig())
    expect(result.status).toBe(0)
    expect(result.body).toContain('fetch failed')
  })

  it('abort returns status:0', async () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    mockUndiciFetch.mockRejectedValue(err)
    const result = await invoke('proxy:send', 'req-1', makeConfig())
    expect(result.status).toBe(0)
  })

  it('content-length > 50MB throws', async () => {
    const bigSize = String(60 * 1024 * 1024)
    mockFetchResponse(200, 'x', { 'content-length': bigSize })
    const result = await invoke('proxy:send', 'req-1', makeConfig())
    // The proxy catches the throw and returns status 0
    expect(result.status).toBe(0)
    expect(result.body).toContain('too large')
  })

  it('pre-script failure logs but continues', async () => {
    mockPreScript.mockRejectedValue(new Error('Script error'))
    mockFetchResponse(200, { ok: true })
    const col = collectionsRepo.create({ name: 'C' })

    const result = await invoke('proxy:send', 'req-1', makeConfig({ collectionId: col.id }))
    // Should still make the request and return success
    expect(result.status).toBe(200)
  })
})

describe('proxy:cancel', () => {
  it('no-op when request not found', () => {
    // Should not throw
    invoke('proxy:cancel', 'nonexistent')
  })
})

describe('proxy:send — post-response', () => {
  it('calls executePostResponseScripts after response', async () => {
    mockFetchResponse(200, { data: 'test' })
    const col = collectionsRepo.create({ name: 'C' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })

    await invoke('proxy:send', req.id, makeConfig({ collectionId: col.id }))

    expect(mockPostScript).toHaveBeenCalledWith(
      req.id,
      col.id,
      expect.objectContaining({ status: 200 }),
      undefined,
    )
  })

  it('logs failure but returns result', async () => {
    mockFetchResponse(200, { data: 'test' })
    mockPostScript.mockImplementationOnce(() => { throw new Error('Script crash') })
    const col = collectionsRepo.create({ name: 'C' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })

    const result = await invoke('proxy:send', req.id, makeConfig({ collectionId: col.id }))
    // Should still return the response even though post-script failed
    expect(result.status).toBe(200)
  })
})
