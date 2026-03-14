import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock electron for session-log → BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import { evaluateAssertions, evaluateRequestAssertions } from '../../src/main/services/assertion-evaluator'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import type { Assertion, AssertionResult } from '../../src/shared/types/models'
import type { ResponseData } from '../../src/shared/types/http'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => {
  closeDatabase()
})

function makeResponse(overrides: Partial<ResponseData> = {}): ResponseData {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-request-id': 'abc-123' },
    body: JSON.stringify({ data: { token: 'jwt-xyz', count: 42, items: [{ id: 1 }, { id: 2 }] } }),
    size: 100,
    timing: { start: 0, ttfb: 50, total: 150 },
    cookies: [],
    ...overrides,
  }
}

function makeAssertion(overrides: Partial<Assertion> = {}): Assertion {
  return {
    type: 'status',
    target: '',
    operator: 'equals',
    expected: '200',
    enabled: true,
    ...overrides,
  }
}

describe('evaluateAssertions', () => {
  // --- Status assertions ---

  it('status equals - passes', () => {
    const results = evaluateAssertions([makeAssertion({ type: 'status', expected: '200' })], makeResponse())
    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe('200')
  })

  it('status equals - fails', () => {
    const results = evaluateAssertions([makeAssertion({ type: 'status', expected: '201' })], makeResponse())
    expect(results[0].passed).toBe(false)
    expect(results[0].actual).toBe('200')
  })

  it('status not_equals - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'status', operator: 'not_equals', expected: '404' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('status less_than - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'status', operator: 'less_than', expected: '300' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('status greater_than - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'status', operator: 'greater_than', expected: '199' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  // --- Header assertions ---

  it('header equals - passes (case-insensitive key lookup)', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'Content-Type', operator: 'equals', expected: 'application/json' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe('application/json')
  })

  it('header contains - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'content-type', operator: 'contains', expected: 'json' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('header not_contains - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'content-type', operator: 'not_contains', expected: 'xml' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('header exists - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'x-request-id', operator: 'exists', expected: '' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('header exists - fails for missing header', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'x-nonexistent', operator: 'exists', expected: '' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(false)
  })

  it('header not_exists - passes for missing header', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'x-nonexistent', operator: 'not_exists', expected: '' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('header matches_regex - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'x-request-id', operator: 'matches_regex', expected: '^[a-z]+-\\d+$' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('header matches_regex - fails on invalid regex', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'x-request-id', operator: 'matches_regex', expected: '[invalid(' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(false)
  })

  // --- JSON path assertions ---

  it('json_path equals - passes for nested value', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'json_path', target: 'data.token', operator: 'equals', expected: 'jwt-xyz' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe('jwt-xyz')
  })

  it('json_path equals - passes for numeric value', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'json_path', target: 'data.count', operator: 'equals', expected: '42' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('json_path with array index - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'json_path', target: 'data.items[0].id', operator: 'equals', expected: '1' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('json_path exists - passes for existing path', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'json_path', target: 'data.token', operator: 'exists', expected: '' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  it('json_path exists - fails for missing path', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'json_path', target: 'data.nonexistent', operator: 'exists', expected: '' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(false)
  })

  it('json_path returns null for non-JSON body', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'json_path', target: 'data.token', operator: 'equals', expected: 'foo' })],
      makeResponse({ body: 'not valid json' }),
    )
    expect(results[0].passed).toBe(false)
    expect(results[0].actual).toBeNull()
  })

  it('json_path greater_than - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'json_path', target: 'data.count', operator: 'greater_than', expected: '10' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  // --- Response time assertions ---

  it('response_time less_than - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'response_time', operator: 'less_than', expected: '500' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe('150')
  })

  it('response_time less_than - fails', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'response_time', operator: 'less_than', expected: '100' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(false)
  })

  it('response_time greater_than - passes', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'response_time', operator: 'greater_than', expected: '100' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
  })

  // --- Disabled assertions ---

  it('skips disabled assertions', () => {
    const results = evaluateAssertions(
      [makeAssertion({ enabled: false })],
      makeResponse(),
    )
    expect(results).toHaveLength(0)
  })

  // --- Multiple assertions ---

  it('evaluates multiple assertions', () => {
    const results = evaluateAssertions(
      [
        makeAssertion({ type: 'status', expected: '200' }),
        makeAssertion({ type: 'header', target: 'content-type', operator: 'contains', expected: 'json' }),
        makeAssertion({ type: 'json_path', target: 'data.token', operator: 'exists', expected: '' }),
        makeAssertion({ type: 'response_time', operator: 'less_than', expected: '1000' }),
      ],
      makeResponse(),
    )
    expect(results).toHaveLength(4)
    expect(results.every((r) => r.passed)).toBe(true)
  })

  it('mixed pass/fail results', () => {
    const results = evaluateAssertions(
      [
        makeAssertion({ type: 'status', expected: '200' }),
        makeAssertion({ type: 'status', expected: '404' }),
      ],
      makeResponse(),
    )
    expect(results[0].passed).toBe(true)
    expect(results[1].passed).toBe(false)
  })

  // --- Edge cases ---

  it('less_than with non-numeric values returns false', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'header', target: 'content-type', operator: 'less_than', expected: '100' })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(false)
  })

  it('regex over 500 chars is rejected', () => {
    const longRegex = 'a'.repeat(501)
    const results = evaluateAssertions(
      [makeAssertion({ type: 'status', operator: 'matches_regex', expected: longRegex })],
      makeResponse(),
    )
    expect(results[0].passed).toBe(false)
  })

  it('handles error status (0) for failed requests', () => {
    const results = evaluateAssertions(
      [makeAssertion({ type: 'status', expected: '0' })],
      makeResponse({ status: 0, statusText: 'Connection refused' }),
    )
    expect(results[0].passed).toBe(true)
    expect(results[0].actual).toBe('0')
  })
})

describe('evaluateRequestAssertions', () => {
  it('evaluates assertions stored in request scripts column', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        assertions: [
          { type: 'status', target: '', operator: 'equals', expected: '200', enabled: true },
          { type: 'json_path', target: 'data.token', operator: 'exists', expected: '', enabled: true },
        ],
      }),
    })

    const results = evaluateRequestAssertions(req.id, makeResponse())
    expect(results).toHaveLength(2)
    expect(results[0].passed).toBe(true)
    expect(results[1].passed).toBe(true)
  })

  it('returns empty array for request with no scripts', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })

    const results = evaluateRequestAssertions(req.id, makeResponse())
    expect(results).toHaveLength(0)
  })

  it('returns empty array for request with no assertions', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'status', target: 'x' }],
      }),
    })

    const results = evaluateRequestAssertions(req.id, makeResponse())
    expect(results).toHaveLength(0)
  })

  it('returns empty array for malformed scripts JSON', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, { scripts: '{broken' })

    const results = evaluateRequestAssertions(req.id, makeResponse())
    expect(results).toHaveLength(0)
  })
})
