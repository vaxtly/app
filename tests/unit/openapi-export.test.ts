import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import yaml from 'js-yaml'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as foldersRepo from '../../src/main/database/repositories/folders'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import { exportOpenAPI } from '../../src/main/services/openapi-export'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => closeDatabase())

/** Parse the YAML string returned by exportOpenAPI into an object. */
function exportDoc(collectionId: string): any {
  const yamlStr = exportOpenAPI(collectionId)
  expect(typeof yamlStr).toBe('string')
  return yaml.load(yamlStr)
}

describe('exportOpenAPI', () => {
  it('generates valid OpenAPI 3.0.3 YAML', () => {
    const col = collectionsRepo.create({ name: 'My API', description: 'A test API' })
    requestsRepo.create({ collection_id: col.id, name: 'Health Check', method: 'GET', url: 'https://api.example.com/health' })

    const yamlStr = exportOpenAPI(col.id)
    expect(yamlStr).toContain('openapi:')

    const doc = yaml.load(yamlStr) as any
    expect(String(doc.openapi)).toBe('3.0.3')
    expect(doc.info.title).toBe('My API')
    expect(doc.info.description).toBe('A test API')
    expect(doc.info.version).toBe('1.0.0')
  })

  it('extracts common base URL as server', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'List', method: 'GET', url: 'https://api.example.com/users' })
    requestsRepo.create({ collection_id: col.id, name: 'Create', method: 'POST', url: 'https://api.example.com/users' })

    const doc = exportDoc(col.id)

    expect(doc.servers).toHaveLength(1)
    expect(doc.servers[0].url).toBe('https://api.example.com')
  })

  it('extracts {{variable}} base URL', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'List', method: 'GET', url: '{{baseUrl}}/users' })
    requestsRepo.create({ collection_id: col.id, name: 'Get', method: 'GET', url: '{{baseUrl}}/users/1' })

    const doc = exportDoc(col.id)

    expect(doc.servers[0].url).toBe('{{baseUrl}}')
    expect(doc.paths['/users']).toBeDefined()
    expect(doc.paths['/users/1']).toBeDefined()
  })

  it('maps requests to paths with methods', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'List Users', method: 'GET', url: 'https://api.example.com/users' })
    requestsRepo.create({ collection_id: col.id, name: 'Create User', method: 'POST', url: 'https://api.example.com/users' })

    const doc = exportDoc(col.id)

    expect(doc.paths['/users']).toBeDefined()
    expect(doc.paths['/users'].get).toBeDefined()
    expect(doc.paths['/users'].post).toBeDefined()
    expect(doc.paths['/users'].get.summary).toBe('List Users')
    expect(doc.paths['/users'].post.summary).toBe('Create User')
  })

  it('generates unique operationIds', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'Get User', method: 'GET', url: 'https://api.example.com/users' })
    requestsRepo.create({ collection_id: col.id, name: 'Get User', method: 'GET', url: 'https://api.example.com/users/active' })

    const doc = exportDoc(col.id)

    const ids = Object.values(doc.paths).flatMap((methods: any) =>
      Object.values(methods).map((op: any) => op.operationId),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses folders as tags', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const folder = foldersRepo.create({ collection_id: col.id, name: 'Authentication' })
    requestsRepo.create({ collection_id: col.id, name: 'Login', method: 'POST', url: 'https://api.example.com/login', folder_id: folder.id })

    const doc = exportDoc(col.id)

    expect(doc.tags).toContainEqual({ name: 'Authentication' })
    expect(doc.paths['/login'].post.tags).toContain('Authentication')
  })

  it('uses top-level folder as tag for nested requests', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const parent = foldersRepo.create({ collection_id: col.id, name: 'Users' })
    const child = foldersRepo.create({ collection_id: col.id, name: 'Admin', parent_id: parent.id })
    requestsRepo.create({ collection_id: col.id, name: 'List Admins', method: 'GET', url: 'https://api.example.com/admins', folder_id: child.id })

    const doc = exportDoc(col.id)

    expect(doc.paths['/admins'].get.tags).toContain('Users')
  })

  it('converts {{variables}} to {variables} in paths', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'Get User', method: 'GET', url: '{{baseUrl}}/users/{{userId}}' })

    const doc = exportDoc(col.id)

    expect(doc.paths['/users/{userId}']).toBeDefined()
    const params = doc.paths['/users/{userId}'].get.parameters
    const pathParam = params.find((p: any) => p.in === 'path' && p.name === 'userId')
    expect(pathParam).toBeDefined()
    expect(pathParam.required).toBe(true)
  })

  it('includes query parameters', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Search', method: 'GET', url: 'https://api.example.com/search' })
    requestsRepo.update(req.id, {
      query_params: JSON.stringify([
        { key: 'q', value: 'test', enabled: true, description: 'Search query' },
        { key: 'page', value: '1', enabled: true },
        { key: 'disabled', value: 'x', enabled: false },
      ]),
    })

    const doc = exportDoc(col.id)
    const params = doc.paths['/search'].get.parameters

    const qParam = params.find((p: any) => p.in === 'query' && p.name === 'q')
    expect(qParam).toBeDefined()
    expect(qParam.description).toBe('Search query')

    const pageParam = params.find((p: any) => p.in === 'query' && p.name === 'page')
    expect(pageParam).toBeDefined()

    // Disabled params should be excluded
    const disabledParam = params.find((p: any) => p.name === 'disabled')
    expect(disabledParam).toBeUndefined()
  })

  it('includes custom headers (skips Content-Type, Authorization)', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Get', method: 'GET', url: 'https://api.example.com/data' })
    requestsRepo.update(req.id, {
      headers: JSON.stringify([
        { key: 'X-Custom', value: 'abc', enabled: true },
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'Authorization', value: 'Bearer xxx', enabled: true },
      ]),
    })

    const doc = exportDoc(col.id)
    const params = doc.paths['/data'].get.parameters

    expect(params.find((p: any) => p.name === 'X-Custom')).toBeDefined()
    expect(params.find((p: any) => p.name === 'Content-Type')).toBeUndefined()
    expect(params.find((p: any) => p.name === 'Authorization')).toBeUndefined()
  })

  it('maps JSON body to requestBody with example', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Create', method: 'POST', url: 'https://api.example.com/items', body_type: 'json' })
    requestsRepo.update(req.id, { body: '{"name":"Widget","price":9.99}' })

    const doc = exportDoc(col.id)
    const body = doc.paths['/items'].post.requestBody

    expect(body.required).toBe(true)
    expect(body.content['application/json']).toBeDefined()
    expect(body.content['application/json'].example).toEqual({ name: 'Widget', price: 9.99 })
  })

  it('maps form-data body to properties', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Upload', method: 'POST', url: 'https://api.example.com/upload', body_type: 'form-data' })
    requestsRepo.update(req.id, {
      body: JSON.stringify([
        { key: 'file', value: 'data', enabled: true },
        { key: 'name', value: 'test.txt', enabled: true },
      ]),
    })

    const doc = exportDoc(col.id)
    const body = doc.paths['/upload'].post.requestBody
    const schema = body.content['multipart/form-data'].schema

    expect(schema.properties.file).toBeDefined()
    expect(schema.properties.name.example).toBe('test.txt')
  })

  it('maps urlencoded body to properties', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Login', method: 'POST', url: 'https://api.example.com/login', body_type: 'urlencoded' })
    requestsRepo.update(req.id, {
      body: JSON.stringify([
        { key: 'username', value: 'admin', enabled: true },
        { key: 'password', value: 'secret', enabled: true },
      ]),
    })

    const doc = exportDoc(col.id)
    const body = doc.paths['/login'].post.requestBody
    const schema = body.content['application/x-www-form-urlencoded'].schema

    expect(schema.properties.username.example).toBe('admin')
  })

  it('does not include requestBody for body_type "none"', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'Get', method: 'GET', url: 'https://api.example.com/data' })

    const doc = exportDoc(col.id)

    expect(doc.paths['/data'].get.requestBody).toBeUndefined()
  })

  it('maps bearer auth to securityScheme', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Protected', method: 'GET', url: 'https://api.example.com/me' })
    requestsRepo.update(req.id, {
      auth: JSON.stringify({ type: 'bearer', bearer_token: 'my-secret-token' }),
    })

    const doc = exportDoc(col.id)

    expect(doc.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    expect(doc.paths['/me'].get.security).toEqual([{ bearerAuth: [] }])
  })

  it('maps basic auth to securityScheme', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Admin', method: 'GET', url: 'https://api.example.com/admin' })
    requestsRepo.update(req.id, {
      auth: JSON.stringify({ type: 'basic', basic_username: 'admin', basic_password: 'pass' }),
    })

    const doc = exportDoc(col.id)

    expect(doc.components.securitySchemes.basicAuth).toEqual({
      type: 'http',
      scheme: 'basic',
    })
  })

  it('maps API key auth to securityScheme', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'API', method: 'GET', url: 'https://api.example.com/data' })
    requestsRepo.update(req.id, {
      auth: JSON.stringify({ type: 'api-key', api_key_header: 'X-API-Key', api_key_value: 'secret' }),
    })

    const doc = exportDoc(col.id)

    expect(doc.components.securitySchemes.apiKeyAuth).toEqual({
      type: 'apiKey',
      name: 'X-API-Key',
      in: 'header',
    })
  })

  it('maps OAuth 2.0 auth to securityScheme', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'OAuth', method: 'GET', url: 'https://api.example.com/resource' })
    requestsRepo.update(req.id, {
      auth: JSON.stringify({
        type: 'oauth2',
        oauth2_grant_type: 'authorization_code',
        oauth2_authorization_url: 'https://auth.example.com/authorize',
        oauth2_access_token_url: 'https://auth.example.com/token',
        oauth2_scope: 'read write',
      }),
    })

    const doc = exportDoc(col.id)
    const scheme = doc.components.securitySchemes.oauth2Auth

    expect(scheme.type).toBe('oauth2')
    expect(scheme.flows.authorizationCode.authorizationUrl).toBe('https://auth.example.com/authorize')
    expect(scheme.flows.authorizationCode.tokenUrl).toBe('https://auth.example.com/token')
    expect(scheme.flows.authorizationCode.scopes).toEqual({ read: '', write: '' })
    expect(doc.paths['/resource'].get.security).toEqual([{ oauth2Auth: ['read', 'write'] }])
  })

  it('does not export sensitive auth values', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Secret', method: 'GET', url: 'https://api.example.com/secret' })
    requestsRepo.update(req.id, {
      auth: JSON.stringify({ type: 'bearer', bearer_token: 'super-secret-token' }),
    })

    const yamlStr = exportOpenAPI(col.id)

    expect(yamlStr).not.toContain('super-secret-token')
  })

  it('skips WebSocket requests', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'WS', method: 'WS', url: 'ws://localhost:8080' })
    requestsRepo.create({ collection_id: col.id, name: 'HTTP', method: 'GET', url: 'https://api.example.com/data' })

    const doc = exportDoc(col.id)

    expect(Object.keys(doc.paths)).toHaveLength(1)
    expect(doc.paths['/data']).toBeDefined()
  })

  it('handles empty collection', () => {
    const col = collectionsRepo.create({ name: 'Empty' })

    const doc = exportDoc(col.id)

    expect(doc.info.title).toBe('Empty')
    expect(Object.keys(doc.paths)).toHaveLength(0)
    expect(doc.servers).toHaveLength(0)
  })

  it('throws for non-existent collection', () => {
    expect(() => exportOpenAPI('nonexistent')).toThrow('Collection not found')
  })

  it('always includes 200 response', () => {
    const col = collectionsRepo.create({ name: 'Test' })
    requestsRepo.create({ collection_id: col.id, name: 'Get', method: 'GET', url: 'https://api.example.com/data' })

    const doc = exportDoc(col.id)

    expect(doc.paths['/data'].get.responses['200']).toEqual({ description: 'Successful response' })
  })
})
