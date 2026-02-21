import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock electron before importing modules that depend on session-log → BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

// Mock undici for dependent HTTP requests in pre-request scripts
const { mockUndiciFetch } = vi.hoisted(() => ({ mockUndiciFetch: vi.fn() }))
vi.mock('undici', () => ({
  fetch: mockUndiciFetch,
  Agent: vi.fn(),
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import { extractValue, extractJsonPath, executePostResponseScripts, executePreRequestScripts } from '../../src/main/services/script-execution'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import { getCachedVariables, setCachedVariables, resetProvider } from '../../src/main/vault/vault-sync-service'
import type { ResponseData } from '../../src/shared/types/http'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
  mockUndiciFetch.mockReset()
})
afterEach(() => {
  resetProvider()
  closeDatabase()
})

// extractValue and extractJsonPath are pure functions that can be tested without DB

describe('extractValue', () => {
  it('extracts status code', () => {
    expect(extractValue('status', 200, null, {})).toBe('200')
    expect(extractValue('status', 404, null, {})).toBe('404')
  })

  it('extracts header value (case-insensitive)', () => {
    const headers = { 'Content-Type': 'application/json', 'X-Request-Id': 'abc123' }
    expect(extractValue('header.Content-Type', 200, null, headers)).toBe('application/json')
    expect(extractValue('header.content-type', 200, null, headers)).toBe('application/json')
    expect(extractValue('header.X-Request-Id', 200, null, headers)).toBe('abc123')
  })

  it('returns null for missing header', () => {
    expect(extractValue('header.X-Missing', 200, null, {})).toBeNull()
  })

  it('extracts body value via JSON path', () => {
    const body = JSON.stringify({ data: { token: 'secret123', count: 42 } })
    expect(extractValue('body.data.token', 200, body, {})).toBe('secret123')
    expect(extractValue('body.data.count', 200, body, {})).toBe('42')
  })

  it('extracts nested array element from body', () => {
    const body = JSON.stringify({ items: [{ id: 10 }, { id: 20 }] })
    expect(extractValue('body.items[0].id', 200, body, {})).toBe('10')
    expect(extractValue('body.items[1].id', 200, body, {})).toBe('20')
  })

  it('returns null for invalid body JSON', () => {
    expect(extractValue('body.data', 200, 'not json', {})).toBeNull()
  })

  it('returns null for null body', () => {
    expect(extractValue('body.data', 200, null, {})).toBeNull()
  })

  it('returns null for unknown source prefix', () => {
    expect(extractValue('cookie.session', 200, null, {})).toBeNull()
  })

  it('returns JSON string for object values', () => {
    const body = JSON.stringify({ data: { nested: { a: 1, b: 2 } } })
    expect(extractValue('body.data.nested', 200, body, {})).toBe('{"a":1,"b":2}')
  })
})

describe('extractJsonPath', () => {
  it('handles simple dot path', () => {
    expect(extractJsonPath({ a: { b: 'hello' } }, 'a.b')).toBe('hello')
  })

  it('handles array index', () => {
    expect(extractJsonPath({ items: ['x', 'y', 'z'] }, 'items[1]')).toBe('y')
  })

  it('handles mixed path with array and nested', () => {
    const data = { users: [{ name: 'Alice' }, { name: 'Bob' }] }
    expect(extractJsonPath(data, 'users[0].name')).toBe('Alice')
    expect(extractJsonPath(data, 'users[1].name')).toBe('Bob')
  })

  it('returns null for missing path', () => {
    expect(extractJsonPath({ a: 1 }, 'b')).toBeNull()
    expect(extractJsonPath({ a: { b: 1 } }, 'a.c')).toBeNull()
  })

  it('returns null for out-of-bounds array index', () => {
    expect(extractJsonPath({ items: [1] }, 'items[5]')).toBeNull()
  })

  it('handles number values', () => {
    expect(extractJsonPath({ count: 42 }, 'count')).toBe('42')
  })

  it('handles boolean values', () => {
    expect(extractJsonPath({ active: true }, 'active')).toBe('true')
  })

  it('returns null for null/undefined in path', () => {
    expect(extractJsonPath({ a: null }, 'a.b')).toBeNull()
  })
})

function makeResponse(overrides: Partial<ResponseData> = {}): ResponseData {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
    size: 0,
    timing: { start: 0, ttfb: 0, total: 0 },
    cookies: [],
    ...overrides,
  }
}

describe('executePostResponseScripts', () => {
  it('sets collection variable from response body', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Auth' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.data.token', target: 'auth_token' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ data: { token: 'jwt-abc-123' } }),
    }))

    const updated = collectionsRepo.findById(col.id)!
    const vars = JSON.parse(updated.variables!)
    expect(vars.auth_token).toBe('jwt-abc-123')
  })

  it('handles missing source path gracefully', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.nonexistent.path', target: 'val' }],
      }),
    })

    // Should not throw
    executePostResponseScripts(req.id, col.id, makeResponse({ body: '{"other": true}' }))

    const updated = collectionsRepo.findById(col.id)!
    expect(updated.variables).toBeNull()
  })

  it('creates new variable on collection', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'status', target: 'last_status' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({ status: 201 }))

    const vars = JSON.parse(collectionsRepo.findById(col.id)!.variables!)
    expect(vars.last_status).toBe('201')
  })

  it('updates existing variable on collection', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    collectionsRepo.update(col.id, { variables: JSON.stringify({ token: 'old-value' }) })

    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.token', target: 'token' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ token: 'new-value' }),
    }))

    const vars = JSON.parse(collectionsRepo.findById(col.id)!.variables!)
    expect(vars.token).toBe('new-value')
  })

  it('mirrorToActiveEnvironment updates matching env variable', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const env = environmentsRepo.create({
      name: 'Dev',
      variables: JSON.stringify([{ key: 'token', value: 'old', enabled: true }]),
    })
    environmentsRepo.activate(env.id)

    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.token', target: 'token' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ token: 'refreshed' }),
    }))

    const updated = environmentsRepo.findById(env.id)!
    const vars = JSON.parse(updated.variables)
    expect(vars[0].value).toBe('refreshed')
  })

  it('strips {{...}} template patterns from extracted values to prevent injection', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.url', target: 'next_url' }],
      }),
    })

    // Malicious server returns a value containing {{secret}} template injection
    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ url: 'https://evil.com/steal?data={{secret_token}}&more={{api_key}}' }),
    }))

    const vars = JSON.parse(collectionsRepo.findById(col.id)!.variables!)
    // Template patterns must be stripped — only the literal parts remain
    expect(vars.next_url).toBe('https://evil.com/steal?data=&more=')
    expect(vars.next_url).not.toContain('{{')
  })

  it('mirrorToActiveEnvironment also receives sanitized values', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const env = environmentsRepo.create({
      name: 'Dev',
      variables: JSON.stringify([{ key: 'token', value: 'real-secret', enabled: true }]),
    })
    environmentsRepo.activate(env.id)

    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.token', target: 'token' }],
      }),
    })

    // Attacker tries to inject nested reference
    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ token: '{{admin_password}}' }),
    }))

    const updated = environmentsRepo.findById(env.id)!
    const vars = JSON.parse(updated.variables)
    expect(vars[0].value).toBe('')
    expect(vars[0].value).not.toContain('{{')
  })

  it('mirrorToActiveEnvironment does NOT create new env variable', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const env = environmentsRepo.create({
      name: 'Dev',
      variables: JSON.stringify([{ key: 'base_url', value: 'https://api.com', enabled: true }]),
    })
    environmentsRepo.activate(env.id)

    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.new_key', target: 'new_key' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ new_key: 'value' }),
    }))

    const updated = environmentsRepo.findById(env.id)!
    const vars = JSON.parse(updated.variables)
    // Should still only have the original variable
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('base_url')
  })

  it('mirrorToActiveEnvironment updates in-memory cache for vault-synced env', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const env = environmentsRepo.create({ name: 'Vault Dev', variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'vault-dev' })
    environmentsRepo.activate(env.id)

    // Populate the in-memory cache (simulates a prior pull)
    setCachedVariables(env.id, [
      { key: 'token', value: 'old-vault-token', enabled: true },
    ])

    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.token', target: 'token' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ token: 'refreshed-vault-token' }),
    }))

    // Cache should be updated
    const cached = getCachedVariables(env.id)!
    expect(cached[0].value).toBe('refreshed-vault-token')

    // DB should still have empty variables (no local persistence)
    const dbEnv = environmentsRepo.findById(env.id)!
    expect(JSON.parse(dbEnv.variables)).toEqual([])
  })

  it('mirrorToActiveEnvironment skips vault-synced env when cache is empty', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const env = environmentsRepo.create({ name: 'Vault Empty', variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'vault-empty' })
    environmentsRepo.activate(env.id)

    // No cache set — simulates cold start before pull

    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.token', target: 'token' }],
      }),
    })

    // Should not throw even without cache
    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ token: 'some-token' }),
    }))

    // Cache should remain empty (key didn't exist)
    expect(getCachedVariables(env.id)).toBeNull()
  })

  it('mirrorToActiveEnvironment does not create new keys in vault cache', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const env = environmentsRepo.create({ name: 'Vault Prod', variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'vault-prod' })
    environmentsRepo.activate(env.id)

    setCachedVariables(env.id, [
      { key: 'existing', value: 'val', enabled: true },
    ])

    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.new_key', target: 'new_key' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ new_key: 'value' }),
    }))

    // Cache should still only have the original variable
    const cached = getCachedVariables(env.id)!
    expect(cached).toHaveLength(1)
    expect(cached[0].key).toBe('existing')
  })
})

// --- Helper for mock fetch responses ---
function mockFetchResponse(status: number, body: unknown, headers: Record<string, string> = {}): ReturnType<typeof mockUndiciFetch> {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const bodyBuffer = new TextEncoder().encode(bodyStr).buffer
  const headerMap = new Map(Object.entries(headers))

  return mockUndiciFetch.mockResolvedValue({
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => headerMap.get(key) ?? null,
      forEach: (cb: (value: string, key: string) => void) => headerMap.forEach(cb),
      getSetCookie: () => [],
    },
    arrayBuffer: () => Promise.resolve(bodyBuffer),
    body: null,
  })
}

describe('executePreRequestScripts', () => {
  it('returns true when request has no scripts', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })

    const result = await executePreRequestScripts(req.id, col.id)
    expect(result).toBe(true)
    expect(mockUndiciFetch).not.toHaveBeenCalled()
  })

  it('returns true when scripts JSON is malformed', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, { scripts: '{broken json' })

    const result = await executePreRequestScripts(req.id, col.id)
    expect(result).toBe(true)
  })

  it('returns true when no pre_request key in scripts', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({ post_response: [{ action: 'set_variable', source: 'status', target: 'x' }] }),
    })

    const result = await executePreRequestScripts(req.id, col.id)
    expect(result).toBe(true)
    expect(mockUndiciFetch).not.toHaveBeenCalled()
  })

  it('fires dependent GET request with correct URL and method', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const dep = requestsRepo.create({ collection_id: col.id, name: 'Auth', url: 'https://api.test/auth', method: 'GET' })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({ pre_request: [{ action: 'send_request', request_id: dep.id }] }),
    })

    mockFetchResponse(200, { ok: true })

    await executePreRequestScripts(main.id, col.id)

    expect(mockUndiciFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockUndiciFetch.mock.calls[0]
    expect(url).toBe('https://api.test/auth')
    expect(opts.method).toBe('GET')
  })

  it('applies bearer auth to dependent request headers', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const dep = requestsRepo.create({ collection_id: col.id, name: 'Auth', url: 'https://api.test/me', method: 'GET' })
    requestsRepo.update(dep.id, {
      auth: JSON.stringify({ type: 'bearer', bearer_token: 'my-token-123' }),
    })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({ pre_request: [{ action: 'send_request', request_id: dep.id }] }),
    })

    mockFetchResponse(200, {})

    await executePreRequestScripts(main.id, col.id)

    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe('Bearer my-token-123')
  })

  it('applies basic auth (base64) to dependent request headers', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const dep = requestsRepo.create({ collection_id: col.id, name: 'Auth', url: 'https://api.test/me', method: 'GET' })
    requestsRepo.update(dep.id, {
      auth: JSON.stringify({ type: 'basic', basic_username: 'user', basic_password: 'pass' }),
    })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({ pre_request: [{ action: 'send_request', request_id: dep.id }] }),
    })

    mockFetchResponse(200, {})

    await executePreRequestScripts(main.id, col.id)

    const [, opts] = mockUndiciFetch.mock.calls[0]
    const expected = `Basic ${Buffer.from('user:pass').toString('base64')}`
    expect(opts.headers['Authorization']).toBe(expected)
  })

  it('applies api-key auth as custom header', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const dep = requestsRepo.create({ collection_id: col.id, name: 'Auth', url: 'https://api.test/me', method: 'GET' })
    requestsRepo.update(dep.id, {
      auth: JSON.stringify({ type: 'api-key', api_key_header: 'X-API-KEY', api_key_value: 'secret-key' }),
    })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({ pre_request: [{ action: 'send_request', request_id: dep.id }] }),
    })

    mockFetchResponse(200, {})

    await executePreRequestScripts(main.id, col.id)

    const [, opts] = mockUndiciFetch.mock.calls[0]
    expect(opts.headers['X-API-KEY']).toBe('secret-key')
  })

  it('runs post-response scripts on dependent request response (sets collection variable)', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const dep = requestsRepo.create({ collection_id: col.id, name: 'Auth', url: 'https://api.test/login', method: 'POST' })
    requestsRepo.update(dep.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.token', target: 'auth_token' }],
      }),
    })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({ pre_request: [{ action: 'send_request', request_id: dep.id }] }),
    })

    mockFetchResponse(200, { token: 'jwt-refreshed-abc' })

    await executePreRequestScripts(main.id, col.id)

    const updated = collectionsRepo.findById(col.id)!
    const vars = JSON.parse(updated.variables!)
    expect(vars.auth_token).toBe('jwt-refreshed-abc')
  })

  it('handles pre_request as single object (not just array)', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const dep = requestsRepo.create({ collection_id: col.id, name: 'Dep', url: 'https://api.test/dep', method: 'GET' })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({ pre_request: { action: 'send_request', request_id: dep.id } }),
    })

    mockFetchResponse(200, {})

    await executePreRequestScripts(main.id, col.id)
    expect(mockUndiciFetch).toHaveBeenCalledTimes(1)
  })

  it('self-referencing request executes once (no recursion in dependent requests)', async () => {
    // executeDependentRequest does NOT recursively invoke pre-request scripts
    // of the dependent request, so self-reference just fires the HTTP call once
    const col = collectionsRepo.create({ name: 'C' })
    const reqA = requestsRepo.create({ collection_id: col.id, name: 'A', url: 'https://api.test/a', method: 'GET' })
    requestsRepo.update(reqA.id, {
      scripts: JSON.stringify({ pre_request: [{ action: 'send_request', request_id: reqA.id }] }),
    })

    mockFetchResponse(200, {})

    const result = await executePreRequestScripts(reqA.id, col.id)
    expect(result).toBe(true)
    expect(mockUndiciFetch).toHaveBeenCalledTimes(1)
  })

  it('multiple dependent requests in one pre_request array all fire', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    const dep1 = requestsRepo.create({ collection_id: col.id, name: 'D1', url: 'https://api.test/d1', method: 'GET' })
    const dep2 = requestsRepo.create({ collection_id: col.id, name: 'D2', url: 'https://api.test/d2', method: 'GET' })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({
        pre_request: [
          { action: 'send_request', request_id: dep1.id },
          { action: 'send_request', request_id: dep2.id },
        ],
      }),
    })

    mockFetchResponse(200, {})

    await executePreRequestScripts(main.id, col.id)
    expect(mockUndiciFetch).toHaveBeenCalledTimes(2)
  })

  it('applies variable substitution to dependent request URL', async () => {
    const col = collectionsRepo.create({ name: 'C' })
    collectionsRepo.update(col.id, { variables: JSON.stringify({ base_url: 'https://api.resolved.com' }) })
    const dep = requestsRepo.create({ collection_id: col.id, name: 'Dep', url: '{{base_url}}/auth', method: 'GET' })
    const main = requestsRepo.create({ collection_id: col.id, name: 'Main' })
    requestsRepo.update(main.id, {
      scripts: JSON.stringify({ pre_request: [{ action: 'send_request', request_id: dep.id }] }),
    })

    mockFetchResponse(200, {})

    await executePreRequestScripts(main.id, col.id)

    const [url] = mockUndiciFetch.mock.calls[0]
    expect(url).toBe('https://api.resolved.com/auth')
  })
})
