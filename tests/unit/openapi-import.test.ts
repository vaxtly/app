import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import yaml from 'js-yaml'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as foldersRepo from '../../src/main/database/repositories/folders'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import { importOpenAPI, isOpenAPIFormat } from '../../src/main/services/openapi-import'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => closeDatabase())

function makeSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: { title: 'Test API', description: 'A test API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    tags: [],
    paths: {},
    ...overrides,
  }
}

function toJson(spec: Record<string, unknown>): string {
  return JSON.stringify(spec)
}

function toYaml(spec: Record<string, unknown>): string {
  return yaml.dump(spec)
}

describe('isOpenAPIFormat', () => {
  it('detects OpenAPI 3.x', () => {
    expect(isOpenAPIFormat({ openapi: '3.0.3', info: { title: 'Test' } })).toBe(true)
  })

  it('detects Swagger 2.x', () => {
    expect(isOpenAPIFormat({ swagger: '2.0', info: { title: 'Test' } })).toBe(true)
  })

  it('rejects non-OpenAPI', () => {
    expect(isOpenAPIFormat({ vaxtly_export: true })).toBe(false)
    expect(isOpenAPIFormat({ _type: 'export' })).toBe(false)
  })
})

describe('importOpenAPI', () => {
  it('creates collection from info', () => {
    const spec = makeSpec()
    const result = importOpenAPI(toJson(spec))

    expect(result.collections).toBe(1)
    expect(result.errors).toHaveLength(0)

    const collections = collectionsRepo.findAll()
    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('Test API')
    expect(collections[0].description).toBe('A test API')
  })

  it('accepts YAML input', () => {
    const spec = makeSpec()
    const result = importOpenAPI(toYaml(spec))

    expect(result.collections).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('creates requests from paths', () => {
    const spec = makeSpec({
      paths: {
        '/users': {
          get: { summary: 'List Users', operationId: 'listUsers', responses: { '200': { description: 'OK' } } },
          post: { summary: 'Create User', operationId: 'createUser', responses: { '200': { description: 'OK' } } },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))

    expect(result.requests).toBe(2)
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests).toHaveLength(2)

    const get = requests.find((r) => r.method === 'GET')!
    expect(get.name).toBe('List Users')
    expect(get.url).toBe('https://api.example.com/users')

    const post = requests.find((r) => r.method === 'POST')!
    expect(post.name).toBe('Create User')
  })

  it('creates folders from tags', () => {
    const spec = makeSpec({
      tags: [{ name: 'Users' }, { name: 'Auth' }],
      paths: {
        '/users': {
          get: { summary: 'List Users', tags: ['Users'], responses: {} },
        },
        '/login': {
          post: { summary: 'Login', tags: ['Auth'], responses: {} },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))

    expect(result.folders).toBe(2)
    expect(result.requests).toBe(2)

    const collections = collectionsRepo.findAll()
    const folders = foldersRepo.findByCollection(collections[0].id)
    expect(folders.map((f) => f.name).sort()).toEqual(['Auth', 'Users'])
  })

  it('creates folder on-the-fly for undeclared tags', () => {
    const spec = makeSpec({
      paths: {
        '/data': {
          get: { summary: 'Get Data', tags: ['Misc'], responses: {} },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))

    expect(result.requests).toBe(1)
    const collections = collectionsRepo.findAll()
    const folders = foldersRepo.findByCollection(collections[0].id)
    expect(folders).toHaveLength(1)
    expect(folders[0].name).toBe('Misc')
  })

  it('converts {variable} to {{variable}} in URLs', () => {
    const spec = makeSpec({
      paths: {
        '/users/{userId}/posts/{postId}': {
          get: { summary: 'Get Post', responses: {} },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    expect(result.requests).toBe(1)

    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].url).toBe('https://api.example.com/users/{{userId}}/posts/{{postId}}')
  })

  it('imports query parameters', () => {
    const spec = makeSpec({
      paths: {
        '/search': {
          get: {
            summary: 'Search',
            parameters: [
              { name: 'q', in: 'query', description: 'Search term' },
              { name: 'page', in: 'query', description: 'Page number' },
            ],
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    expect(result.requests).toBe(1)

    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    const params = JSON.parse(requests[0].query_params!)
    expect(params).toHaveLength(2)
    expect(params[0].key).toBe('q')
    expect(params[0].description).toBe('Search term')
  })

  it('imports header parameters', () => {
    const spec = makeSpec({
      paths: {
        '/data': {
          get: {
            summary: 'Get Data',
            parameters: [
              { name: 'X-Custom', in: 'header', description: 'Custom header' },
            ],
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    const headers = JSON.parse(requests[0].headers!)
    expect(headers).toHaveLength(1)
    expect(headers[0].key).toBe('X-Custom')
  })

  it('imports JSON body with example', () => {
    const spec = makeSpec({
      paths: {
        '/items': {
          post: {
            summary: 'Create Item',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object' },
                  example: { name: 'Widget', price: 9.99 },
                },
              },
            },
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].body_type).toBe('json')
    const body = JSON.parse(requests[0].body!)
    expect(body).toEqual({ name: 'Widget', price: 9.99 })
  })

  it('imports form-data body from schema properties', () => {
    const spec = makeSpec({
      paths: {
        '/upload': {
          post: {
            summary: 'Upload',
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      file: { type: 'string', format: 'binary' },
                      name: { type: 'string', example: 'test.txt' },
                    },
                  },
                },
              },
            },
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].body_type).toBe('form-data')
    const entries = JSON.parse(requests[0].body!)
    expect(entries).toHaveLength(2)
    expect(entries.find((e: any) => e.key === 'name').value).toBe('test.txt')
  })

  it('imports urlencoded body', () => {
    const spec = makeSpec({
      paths: {
        '/login': {
          post: {
            summary: 'Login',
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: {
                      username: { type: 'string', example: 'admin' },
                      password: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].body_type).toBe('urlencoded')
  })

  it('imports bearer auth from securitySchemes', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      paths: {
        '/me': {
          get: {
            summary: 'Get Profile',
            security: [{ bearerAuth: [] }],
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    const auth = JSON.parse(requests[0].auth!)
    expect(auth.type).toBe('bearer')
  })

  it('imports basic auth', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          basicAuth: { type: 'http', scheme: 'basic' },
        },
      },
      paths: {
        '/admin': {
          get: {
            summary: 'Admin',
            security: [{ basicAuth: [] }],
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    const auth = JSON.parse(requests[0].auth!)
    expect(auth.type).toBe('basic')
  })

  it('imports API key auth', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' },
        },
      },
      paths: {
        '/data': {
          get: {
            summary: 'Get Data',
            security: [{ apiKey: [] }],
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    const auth = JSON.parse(requests[0].auth!)
    expect(auth.type).toBe('api-key')
    expect(auth.api_key_header).toBe('X-API-Key')
  })

  it('imports OAuth 2.0 auth', () => {
    const spec = makeSpec({
      components: {
        securitySchemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                scopes: { read: 'Read access', write: 'Write access' },
              },
            },
          },
        },
      },
      paths: {
        '/resource': {
          get: {
            summary: 'Get Resource',
            security: [{ oauth2: ['read', 'write'] }],
            responses: {},
          },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    const auth = JSON.parse(requests[0].auth!)
    expect(auth.type).toBe('oauth2')
    expect(auth.oauth2_grant_type).toBe('authorization_code')
    expect(auth.oauth2_authorization_url).toBe('https://auth.example.com/authorize')
    expect(auth.oauth2_scope).toBe('read write')
  })

  it('uses operationId as name when summary is missing', () => {
    const spec = makeSpec({
      paths: {
        '/users': {
          get: { operationId: 'getUsers', responses: {} },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].name).toBe('getUsers')
  })

  it('falls back to method + path as name', () => {
    const spec = makeSpec({
      paths: {
        '/users': {
          get: { responses: {} },
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].name).toBe('GET /users')
  })

  it('handles empty paths', () => {
    const spec = makeSpec({ paths: {} })
    const result = importOpenAPI(toJson(spec))
    expect(result.collections).toBe(1)
    expect(result.requests).toBe(0)
  })

  it('handles no servers', () => {
    const spec = makeSpec({ servers: [] })
    spec.paths = {
      '/users': { get: { summary: 'List', responses: {} } },
    }
    const result = importOpenAPI(toJson(spec))
    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].url).toBe('/users')
  })

  it('generates unique collection name', () => {
    collectionsRepo.create({ name: 'Test API' })
    const spec = makeSpec()
    const result = importOpenAPI(toJson(spec))

    expect(result.collections).toBe(1)
    const all = collectionsRepo.findAll()
    expect(all.map((c) => c.name).sort()).toEqual(['Test API', 'Test API (2)'])
  })

  it('rejects invalid input', () => {
    const result = importOpenAPI('not valid at all {{{}}}')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.collections).toBe(0)
  })

  it('rejects non-OpenAPI JSON', () => {
    const result = importOpenAPI(JSON.stringify({ foo: 'bar' }))
    expect(result.errors[0]).toContain('Not a valid OpenAPI')
  })

  it('skips non-HTTP-method keys in paths', () => {
    const spec = makeSpec({
      paths: {
        '/users': {
          summary: 'Users endpoint',
          description: 'CRUD for users',
          get: { summary: 'List Users', responses: {} },
          parameters: [{ name: 'shared', in: 'query' }],
        },
      },
    })

    const result = importOpenAPI(toJson(spec))
    expect(result.requests).toBe(1)
  })
})
