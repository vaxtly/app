import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as foldersRepo from '../../src/main/database/repositories/folders'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import { importPostman } from '../../src/main/services/postman-import'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => closeDatabase())

describe('collection v2.1 format', () => {
  it('imports a basic collection with requests', () => {
    const postman = {
      info: {
        _postman_id: 'abc-123',
        name: 'My API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [
        {
          name: 'Get Users',
          request: {
            method: 'GET',
            url: 'https://api.example.com/users',
            header: [
              { key: 'Accept', value: 'application/json' },
            ],
          },
        },
        {
          name: 'Create User',
          request: {
            method: 'POST',
            url: 'https://api.example.com/users',
            body: {
              mode: 'raw',
              raw: '{"name": "test"}',
              options: { raw: { language: 'json' } },
            },
          },
        },
      ],
    }

    const result = importPostman(JSON.stringify(postman))

    expect(result.collections).toBe(1)
    expect(result.requests).toBe(2)
    expect(result.errors).toHaveLength(0)

    const collections = collectionsRepo.findAll()
    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('My API')

    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests).toHaveLength(2)
    expect(requests.find((r) => r.name === 'Get Users')?.method).toBe('GET')
    expect(requests.find((r) => r.name === 'Create User')?.method).toBe('POST')
  })

  it('imports nested folders', () => {
    const postman = {
      info: { _postman_id: 'abc', name: 'Nested', schema: '' },
      item: [
        {
          name: 'Auth',
          item: [
            {
              name: 'Login',
              request: { method: 'POST', url: 'https://api.com/login' },
            },
            {
              name: 'OAuth',
              item: [
                {
                  name: 'Token',
                  request: { method: 'POST', url: 'https://api.com/oauth/token' },
                },
              ],
            },
          ],
        },
      ],
    }

    const result = importPostman(JSON.stringify(postman))

    expect(result.collections).toBe(1)
    expect(result.folders).toBe(2) // Auth + OAuth
    expect(result.requests).toBe(2) // Login + Token

    const collections = collectionsRepo.findAll()
    const folders = foldersRepo.findByCollection(collections[0].id)

    expect(folders).toHaveLength(2)
    const authFolder = folders.find((f) => f.name === 'Auth')
    const oauthFolder = folders.find((f) => f.name === 'OAuth')
    expect(oauthFolder?.parent_id).toBe(authFolder?.id)
  })

  it('imports collection variables', () => {
    const postman = {
      info: { _postman_id: 'abc', name: 'With Vars' },
      item: [],
      variable: [
        { key: 'baseUrl', value: 'https://api.com', disabled: false },
        { key: 'token', value: 'secret', disabled: true },
      ],
    }

    const result = importPostman(JSON.stringify(postman))
    expect(result.collections).toBe(1)

    const collections = collectionsRepo.findAll()
    const vars = JSON.parse(collections[0].variables ?? '[]')
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('baseUrl')
    expect(vars[0].enabled).toBe(true)
    expect(vars[1].key).toBe('token')
    expect(vars[1].enabled).toBe(false)
  })

  it('handles body types correctly', () => {
    const postman = {
      info: { _postman_id: 'abc', name: 'Body Types' },
      item: [
        {
          name: 'JSON',
          request: {
            method: 'POST',
            url: 'https://api.com',
            body: { mode: 'raw', raw: '{"a":1}', options: { raw: { language: 'json' } } },
          },
        },
        {
          name: 'Form',
          request: {
            method: 'POST',
            url: 'https://api.com',
            body: {
              mode: 'urlencoded',
              urlencoded: [{ key: 'name', value: 'test' }],
            },
          },
        },
        {
          name: 'GraphQL',
          request: {
            method: 'POST',
            url: 'https://api.com/graphql',
            body: {
              mode: 'graphql',
              graphql: { query: '{ users { id } }', variables: '{}' },
            },
          },
        },
      ],
    }

    const result = importPostman(JSON.stringify(postman))
    expect(result.requests).toBe(3)

    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)

    const jsonReq = requests.find((r) => r.name === 'JSON')!
    expect(jsonReq.body_type).toBe('json')
    expect(jsonReq.body).toBe('{"a":1}')

    const formReq = requests.find((r) => r.name === 'Form')!
    expect(formReq.body_type).toBe('urlencoded')

    const gqlReq = requests.find((r) => r.name === 'GraphQL')!
    expect(gqlReq.body_type).toBe('graphql')
  })
})

describe('environment format', () => {
  it('imports a Postman environment', () => {
    const postman = {
      name: 'Production',
      _postman_variable_scope: 'environment',
      values: [
        { key: 'base_url', value: 'https://api.prod.com', enabled: true },
        { key: 'api_key', value: 'sk-prod', enabled: true },
      ],
    }

    const result = importPostman(JSON.stringify(postman))

    expect(result.environments).toBe(1)
    expect(result.errors).toHaveLength(0)

    const envs = environmentsRepo.findAll()
    expect(envs).toHaveLength(1)
    expect(envs[0].name).toBe('Production')

    const vars = JSON.parse(envs[0].variables)
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('base_url')
  })
})

describe('workspace dump format', () => {
  it('imports collections and environments from dump', () => {
    const postman = {
      version: 1,
      collections: [
        {
          name: 'Dump Collection',
          folders: [],
          requests: [
            {
              name: 'Simple Request',
              method: 'GET',
              url: 'https://api.com/test',
            },
          ],
        },
      ],
      environments: [
        {
          name: 'Staging',
          values: [
            { key: 'host', value: 'staging.api.com', enabled: true },
          ],
        },
      ],
    }

    const result = importPostman(JSON.stringify(postman))

    expect(result.collections).toBe(1)
    expect(result.requests).toBe(1)
    expect(result.environments).toBe(1)
  })

  it('imports dump with nested folders', () => {
    const postman = {
      version: 1,
      collections: [
        {
          name: 'Dump With Folders',
          folders: [
            { id: 'f1', name: 'Root Folder' },
            { id: 'f2', name: 'Child Folder', folder: 'f1' },
          ],
          requests: [
            { name: 'In Root', method: 'GET', url: 'https://api.com', folder: 'f1' },
            { name: 'In Child', method: 'POST', url: 'https://api.com', folder: 'f2' },
          ],
        },
      ],
    }

    const result = importPostman(JSON.stringify(postman))

    expect(result.collections).toBe(1)
    expect(result.folders).toBe(2)
    expect(result.requests).toBe(2)

    const collections = collectionsRepo.findAll()
    const folders = foldersRepo.findByCollection(collections[0].id)
    const rootFolder = folders.find((f) => f.name === 'Root Folder')!
    const childFolder = folders.find((f) => f.name === 'Child Folder')!

    expect(childFolder.parent_id).toBe(rootFolder.id)
  })
})

describe('error handling', () => {
  it('rejects invalid JSON', () => {
    const result = importPostman('not json')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Invalid JSON')
  })

  it('rejects unknown format', () => {
    const result = importPostman(JSON.stringify({ random: 'data' }))
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Unknown Postman format')
  })

  it('generates unique names for duplicate collections', () => {
    collectionsRepo.create({ name: 'My API' })

    const postman = {
      info: { _postman_id: 'abc', name: 'My API' },
      item: [],
    }

    const result = importPostman(JSON.stringify(postman))
    expect(result.collections).toBe(1)

    const collections = collectionsRepo.findAll()
    expect(collections).toHaveLength(2)
    expect(collections.map((c) => c.name).sort()).toEqual(['My API', 'My API (2)'])
  })
})

describe('additional body types and formats', () => {
  it('imports form-data body from v2.1 format', () => {
    const postman = {
      info: { _postman_id: 'abc', name: 'FormData' },
      item: [{
        name: 'Upload',
        request: {
          method: 'POST',
          url: 'https://api.com/upload',
          body: {
            mode: 'formdata',
            formdata: [
              { key: 'field1', value: 'value1', type: 'text' },
              { key: 'field2', value: 'value2', type: 'text' },
            ],
          },
        },
      }],
    }

    const result = importPostman(JSON.stringify(postman))
    expect(result.requests).toBe(1)

    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].body_type).toBe('form-data')
    const body = JSON.parse(requests[0].body!)
    expect(body).toHaveLength(2)
    expect(body[0].key).toBe('field1')
  })

  it('imports URL-as-object format (protocol/host/path arrays)', () => {
    const postman = {
      info: { _postman_id: 'abc', name: 'URL Object' },
      item: [{
        name: 'Object URL',
        request: {
          method: 'GET',
          url: {
            protocol: 'https',
            host: ['api', 'example', 'com'],
            path: ['v1', 'users'],
            port: '',
          },
        },
      }],
    }

    const result = importPostman(JSON.stringify(postman))
    expect(result.requests).toBe(1)

    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].url).toBe('https://api.example.com/v1/users')
  })

  it('imports raw XML body', () => {
    const postman = {
      info: { _postman_id: 'abc', name: 'XML' },
      item: [{
        name: 'XML Req',
        request: {
          method: 'POST',
          url: 'https://api.com',
          body: {
            mode: 'raw',
            raw: '<root><item>1</item></root>',
            options: { raw: { language: 'xml' } },
          },
        },
      }],
    }

    const result = importPostman(JSON.stringify(postman))
    expect(result.requests).toBe(1)

    const collections = collectionsRepo.findAll()
    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests[0].body_type).toBe('xml')
    expect(requests[0].body).toContain('<root>')
  })

  it('workspace-scoped import assigns workspace_id', () => {
    const ws = workspacesRepo.create({ name: 'Test WS' })
    const postman = {
      info: { _postman_id: 'abc', name: 'WS Import' },
      item: [{ name: 'R', request: { method: 'GET', url: 'https://api.com' } }],
    }

    const result = importPostman(JSON.stringify(postman), ws.id)
    expect(result.collections).toBe(1)

    const cols = collectionsRepo.findAll()
    expect(cols.find((c) => c.name === 'WS Import')!.workspace_id).toBe(ws.id)
  })
})
