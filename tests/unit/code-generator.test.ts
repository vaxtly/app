import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { generateCode, type CodeGenRequest } from '../../src/main/services/code-generator'

// Code generator uses variable substitution which needs DB
beforeEach(() => openTestDatabase())
afterEach(() => closeDatabase())

function makeRequest(overrides: Partial<CodeGenRequest> = {}): CodeGenRequest {
  return {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    queryParams: [],
    body: '',
    bodyType: 'none',
    formData: [],
    authType: 'none',
    authToken: '',
    authUsername: '',
    authPassword: '',
    apiKeyName: '',
    apiKeyValue: '',
    ...overrides,
  }
}

describe('generateCode', () => {
  describe('curl', () => {
    it('generates simple GET', () => {
      const code = generateCode('curl', makeRequest())
      expect(code).toContain('curl')
      expect(code).toContain("'https://api.example.com/users'")
      expect(code).not.toContain('-X')
    })

    it('generates POST with JSON body', () => {
      const code = generateCode('curl', makeRequest({
        method: 'POST',
        body: '{"name":"test"}',
        bodyType: 'json',
      }))
      expect(code).toContain('-X POST')
      expect(code).toContain("Content-Type: application/json")
      expect(code).toContain("-d")
    })

    it('includes custom headers', () => {
      const code = generateCode('curl', makeRequest({
        headers: [{ key: 'X-Custom', value: 'hello', enabled: true }],
      }))
      expect(code).toContain("X-Custom: hello")
    })

    it('includes query params in URL', () => {
      const code = generateCode('curl', makeRequest({
        queryParams: [{ key: 'page', value: '1', enabled: true }],
      }))
      expect(code).toContain('page=1')
    })

    it('includes bearer auth', () => {
      const code = generateCode('curl', makeRequest({
        authType: 'bearer',
        authToken: 'my-token',
      }))
      expect(code).toContain('Authorization: Bearer my-token')
    })
  })

  describe('python', () => {
    it('generates import and GET request', () => {
      const code = generateCode('python', makeRequest())
      expect(code).toContain('import requests')
      expect(code).toContain('requests.get(')
      expect(code).toContain("'https://api.example.com/users'")
    })

    it('includes headers dict', () => {
      const code = generateCode('python', makeRequest({
        headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
      }))
      expect(code).toContain('headers = {')
      expect(code).toContain("'Accept': 'application/json'")
      expect(code).toContain('headers=headers')
    })
  })

  describe('php', () => {
    it('generates Laravel HTTP facade code', () => {
      const code = generateCode('php', makeRequest())
      expect(code).toContain('Http')
      expect(code).toContain("get('https://api.example.com/users')")
    })
  })

  describe('javascript', () => {
    it('generates fetch code', () => {
      const code = generateCode('javascript', makeRequest())
      expect(code).toContain('fetch(')
      expect(code).toContain("method: 'GET'")
    })

    it('includes JSON body for POST', () => {
      const code = generateCode('javascript', makeRequest({
        method: 'POST',
        body: '{"data":"test"}',
        bodyType: 'json',
      }))
      expect(code).toContain('JSON.stringify(')
    })
  })

  describe('node', () => {
    it('generates axios code', () => {
      const code = generateCode('node', makeRequest())
      expect(code).toContain("import axios from 'axios'")
      expect(code).toContain('axios.get(')
    })
  })

  it('skips disabled headers and params', () => {
    const code = generateCode('curl', makeRequest({
      headers: [
        { key: 'X-Enabled', value: 'yes', enabled: true },
        { key: 'X-Disabled', value: 'no', enabled: false },
      ],
      queryParams: [
        { key: 'active', value: '1', enabled: true },
        { key: 'hidden', value: '2', enabled: false },
      ],
    }))
    expect(code).toContain('X-Enabled: yes')
    expect(code).not.toContain('X-Disabled')
    expect(code).toContain('active=1')
    expect(code).not.toContain('hidden=2')
  })
})
