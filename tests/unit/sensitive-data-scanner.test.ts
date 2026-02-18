import { describe, it, expect } from 'vitest'
import {
  scanCollection,
  scanRequest,
  sanitizeRequestData,
  sanitizeCollectionData,
  isVariableReference,
  maskValue,
} from '../../src/main/services/sensitive-data-scanner'

function makeRequest(overrides: Partial<Parameters<typeof scanRequest>[0]> = {}) {
  return {
    id: 'req-1',
    name: 'Test Request',
    url: 'https://example.com',
    headers: [],
    query_params: [],
    body: null,
    body_type: 'none',
    auth: null,
    ...overrides,
  }
}

describe('isVariableReference', () => {
  it('detects {{var}} references', () => {
    expect(isVariableReference('{{token}}')).toBe(true)
    expect(isVariableReference('Bearer {{token}}')).toBe(true)
  })

  it('returns false for plain values', () => {
    expect(isVariableReference('my-secret')).toBe(false)
    expect(isVariableReference('')).toBe(false)
  })
})

describe('maskValue', () => {
  it('masks values longer than 4 chars', () => {
    expect(maskValue('mysecrettoken')).toBe('myse********')
  })

  it('does not mask short values', () => {
    expect(maskValue('abc')).toBe('abc')
    expect(maskValue('abcd')).toBe('abcd')
  })
})

describe('scanRequest', () => {
  it('detects bearer token', () => {
    const findings = scanRequest(makeRequest({
      auth: { type: 'bearer', bearer_token: 'secret123' },
    }))
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('bearer token')
    expect(findings[0].source).toBe('auth')
  })

  it('detects basic auth password', () => {
    const findings = scanRequest(makeRequest({
      auth: { type: 'basic', basic_username: 'user', basic_password: 'pass123' },
    }))
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('basic password')
  })

  it('skips auth with variable references', () => {
    const findings = scanRequest(makeRequest({
      auth: { type: 'bearer', bearer_token: '{{myToken}}' },
    }))
    expect(findings).toHaveLength(0)
  })

  it('detects sensitive headers', () => {
    const findings = scanRequest(makeRequest({
      headers: [
        { key: 'Authorization', value: 'Bearer real-secret', enabled: true },
        { key: 'Content-Type', value: 'application/json', enabled: true },
      ],
    }))
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('Authorization')
  })

  it('detects sensitive query params', () => {
    const findings = scanRequest(makeRequest({
      query_params: [
        { key: 'api_key', value: 'sk-12345', enabled: true },
        { key: 'page', value: '1', enabled: true },
      ],
    }))
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('api_key')
  })

  it('detects sensitive keys in JSON body', () => {
    const findings = scanRequest(makeRequest({
      body: JSON.stringify({ password: 'secret', name: 'test' }),
      body_type: 'json',
    }))
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('password')
  })

  it('detects sensitive keys in nested JSON body', () => {
    const findings = scanRequest(makeRequest({
      body: JSON.stringify({ data: { api_key: 'sk-123', safe: 'value' } }),
      body_type: 'json',
    }))
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('api_key')
  })

  it('detects sensitive keys in form-data body', () => {
    const findings = scanRequest(makeRequest({
      body: JSON.stringify([
        { key: 'token', value: 'abc123', enabled: true },
        { key: 'name', value: 'test', enabled: true },
      ]),
      body_type: 'form-data',
    }))
    expect(findings).toHaveLength(1)
    expect(findings[0].key).toBe('token')
  })

  it('skips auth type none', () => {
    const findings = scanRequest(makeRequest({
      auth: { type: 'none' },
    }))
    expect(findings).toHaveLength(0)
  })
})

describe('scanCollection', () => {
  it('scans both requests and collection variables', () => {
    const requests = [
      makeRequest({ auth: { type: 'bearer', bearer_token: 'secret' } }),
    ]
    const variables = [
      { key: 'api_key', value: 'sk-123', enabled: true },
      { key: 'base_url', value: 'https://api.com', enabled: true },
    ]
    const findings = scanCollection(requests, variables)
    expect(findings).toHaveLength(2)
  })

  it('skips variables used as {{ref}} in requests', () => {
    const requests = [
      makeRequest({ url: 'https://api.com?token={{myToken}}' }),
    ]
    const variables = [
      { key: 'myToken', value: 'actual-secret', enabled: true },
    ]
    const findings = scanCollection(requests, variables)
    expect(findings).toHaveLength(0)
  })
})

describe('sanitizeRequestData', () => {
  it('blanks bearer token', () => {
    const data = sanitizeRequestData({
      auth: { type: 'bearer', bearer_token: 'secret' },
      headers: [],
      query_params: [],
      body: null,
      body_type: 'none',
    })
    expect((data.auth as any).bearer_token).toBe('')
  })

  it('blanks sensitive headers', () => {
    const data = sanitizeRequestData({
      auth: null,
      headers: [
        { key: 'Authorization', value: 'Bearer token', enabled: true },
        { key: 'Accept', value: 'application/json', enabled: true },
      ],
      query_params: [],
      body: null,
      body_type: 'none',
    })
    expect((data.headers as any)[0].value).toBe('')
    expect((data.headers as any)[1].value).toBe('application/json')
  })

  it('preserves {{variable}} references during sanitization', () => {
    const data = sanitizeRequestData({
      auth: { type: 'bearer', bearer_token: '{{myToken}}' },
      headers: [],
      query_params: [],
      body: null,
      body_type: 'none',
    })
    expect((data.auth as any).bearer_token).toBe('{{myToken}}')
  })

  it('sanitizes JSON body', () => {
    const data = sanitizeRequestData({
      auth: null,
      headers: [],
      query_params: [],
      body: JSON.stringify({ password: 'secret', name: 'test' }),
      body_type: 'json',
    })
    const parsed = JSON.parse(data.body as string)
    expect(parsed.password).toBe('')
    expect(parsed.name).toBe('test')
  })
})

describe('sanitizeCollectionData', () => {
  it('blanks sensitive variable values', () => {
    const data = sanitizeCollectionData({
      variables: [
        { key: 'api_key', value: 'sk-123', enabled: true },
        { key: 'base_url', value: 'https://api.com', enabled: true },
      ],
    })
    expect(data.variables![0].value).toBe('')
    expect(data.variables![1].value).toBe('https://api.com')
  })
})
