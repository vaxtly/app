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
      expect(code).toContain("body: '{\"data\":\"test\"}")
    })
  })

  describe('node', () => {
    it('generates axios code', () => {
      const code = generateCode('node', makeRequest())
      expect(code).toContain("import axios from 'axios'")
      expect(code).toContain('axios.get(')
    })
  })

  describe('go', () => {
    it('generates net/http GET', () => {
      const code = generateCode('go', makeRequest())
      expect(code).toContain('package main')
      expect(code).toContain('net/http')
      expect(code).toContain('http.NewRequest("GET"')
      expect(code).toContain('http.DefaultClient.Do(req)')
    })

    it('generates POST with JSON body', () => {
      const code = generateCode('go', makeRequest({
        method: 'POST',
        body: '{"name":"test"}',
        bodyType: 'json',
      }))
      expect(code).toContain('"strings"')
      expect(code).toContain('strings.NewReader')
      expect(code).toContain('http.NewRequest("POST"')
      expect(code).toContain('Content-Type')
      expect(code).toContain('application/json')
    })

    it('includes custom headers', () => {
      const code = generateCode('go', makeRequest({
        headers: [{ key: 'X-Custom', value: 'hello', enabled: true }],
      }))
      expect(code).toContain('req.Header.Set("X-Custom", "hello")')
    })
  })

  describe('ruby', () => {
    it('generates Net::HTTP GET', () => {
      const code = generateCode('ruby', makeRequest())
      expect(code).toContain("require 'net/http'")
      expect(code).toContain("URI('https://api.example.com/users')")
      expect(code).toContain('Net::HTTP::Get.new(uri)')
      expect(code).toContain('http.request(request)')
    })

    it('generates POST with JSON body', () => {
      const code = generateCode('ruby', makeRequest({
        method: 'POST',
        body: '{"name":"test"}',
        bodyType: 'json',
      }))
      expect(code).toContain('Net::HTTP::Post.new(uri)')
      expect(code).toContain('request.body')
      expect(code).toContain('application/json')
    })

    it('includes custom headers', () => {
      const code = generateCode('ruby', makeRequest({
        headers: [{ key: 'Accept', value: 'text/html', enabled: true }],
      }))
      expect(code).toContain("request['Accept'] = 'text/html'")
    })
  })

  describe('csharp', () => {
    it('generates HttpClient GET', () => {
      const code = generateCode('csharp', makeRequest())
      expect(code).toContain('using System.Net.Http')
      expect(code).toContain('new HttpClient()')
      expect(code).toContain('GetAsync("https://api.example.com/users")')
      expect(code).toContain('ReadAsStringAsync()')
    })

    it('generates POST with JSON body', () => {
      const code = generateCode('csharp', makeRequest({
        method: 'POST',
        body: '{"name":"test"}',
        bodyType: 'json',
      }))
      expect(code).toContain('new StringContent(')
      expect(code).toContain('application/json')
      expect(code).toContain('PostAsync(')
    })

    it('includes custom headers', () => {
      const code = generateCode('csharp', makeRequest({
        headers: [{ key: 'X-Custom', value: 'hello', enabled: true }],
      }))
      expect(code).toContain('DefaultRequestHeaders.Add("X-Custom", "hello")')
    })
  })

  describe('java', () => {
    it('generates HttpClient GET', () => {
      const code = generateCode('java', makeRequest())
      expect(code).toContain('import java.net.http.HttpClient')
      expect(code).toContain('HttpClient.newHttpClient()')
      expect(code).toContain('URI.create("https://api.example.com/users")')
      expect(code).toContain('.GET()')
      expect(code).toContain('client.send(request')
    })

    it('generates POST with JSON body', () => {
      const code = generateCode('java', makeRequest({
        method: 'POST',
        body: '{"name":"test"}',
        bodyType: 'json',
      }))
      expect(code).toContain('.POST(HttpRequest.BodyPublishers.ofString(')
      expect(code).toContain('application/json')
    })

    it('includes custom headers', () => {
      const code = generateCode('java', makeRequest({
        headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
      }))
      expect(code).toContain('.header("Accept", "application/json")')
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

  describe('curl — auth types', () => {
    it('generates basic auth header', () => {
      const code = generateCode('curl', makeRequest({
        authType: 'basic',
        authUsername: 'admin',
        authPassword: 'secret',
      }))
      expect(code).toContain('Authorization: Basic')
      // Base64 of admin:secret
      expect(code).toContain(btoa('admin:secret'))
    })

    it('generates api-key as custom header', () => {
      const code = generateCode('curl', makeRequest({
        authType: 'api-key',
        apiKeyName: 'X-Api-Key',
        apiKeyValue: 'my-key-123',
      }))
      expect(code).toContain('X-Api-Key: my-key-123')
    })
  })

  describe('curl — body types', () => {
    it('generates XML body with content-type', () => {
      const code = generateCode('curl', makeRequest({
        method: 'POST',
        body: '<root><item>1</item></root>',
        bodyType: 'xml',
      }))
      expect(code).toContain('Content-Type: application/xml')
      expect(code).toContain('-d')
    })

    it('generates form-data with -F flags', () => {
      const code = generateCode('curl', makeRequest({
        method: 'POST',
        bodyType: 'form-data',
        formData: [
          { key: 'name', value: 'test', enabled: true },
          { key: 'file', value: 'data.txt', enabled: true },
        ],
      }))
      expect(code).toContain('-F')
      expect(code).toContain('name=test')
    })

    it('generates urlencoded with --data-urlencode', () => {
      const code = generateCode('curl', makeRequest({
        method: 'POST',
        bodyType: 'urlencoded',
        formData: [
          { key: 'username', value: 'admin', enabled: true },
          { key: 'password', value: 'secret', enabled: true },
        ],
      }))
      expect(code).toContain('--data-urlencode')
      expect(code).toContain('username=admin')
    })
  })
})
