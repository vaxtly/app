import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase } from '../../src/main/database/connection'
import { closeDatabase } from '../../src/main/database/connection'
import { extractValue, extractJsonPath } from '../../src/main/services/script-execution'

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
