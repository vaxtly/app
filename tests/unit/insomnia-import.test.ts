import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase, getDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import { importInsomnia } from '../../src/main/services/insomnia-import'

beforeEach(() => {
  initEncryptionForTesting()
  openTestDatabase()
})
afterEach(() => closeDatabase())

function makeExport(resources: Record<string, unknown>[]): string {
  return JSON.stringify({
    _type: 'export',
    __export_format: 4,
    __export_date: '2024-01-01T00:00:00.000Z',
    __export_source: 'insomnia.desktop.app:v2024.1.0',
    resources,
  })
}

describe('importInsomnia', () => {
  it('rejects invalid JSON', () => {
    const result = importInsomnia('not json')
    expect(result.errors).toContain('Invalid JSON file')
  })

  it('rejects non-Insomnia format', () => {
    const result = importInsomnia(JSON.stringify({ foo: 'bar' }))
    expect(result.errors).toContain('Not an Insomnia export file')
  })

  it('imports a workspace as a collection', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'My API', parentId: null },
    ])
    const result = importInsomnia(json)
    expect(result.collections).toBe(1)
    expect(result.errors).toHaveLength(0)

    const db = getDatabase()
    const coll = db.prepare('SELECT * FROM collections WHERE name = ?').get('My API') as any
    expect(coll).toBeDefined()
  })

  it('imports folders (request_groups)', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      { _id: 'fld_1', _type: 'request_group', name: 'Users', parentId: 'wrk_1' },
      { _id: 'fld_2', _type: 'request_group', name: 'Admin', parentId: 'fld_1' },
    ])
    const result = importInsomnia(json)
    expect(result.collections).toBe(1)
    expect(result.folders).toBe(2)

    const db = getDatabase()
    const folders = db.prepare('SELECT * FROM folders ORDER BY name').all() as any[]
    expect(folders).toHaveLength(2)
    expect(folders[0].name).toBe('Admin')
    expect(folders[1].name).toBe('Users')
    // Admin should be nested inside Users
    expect(folders[0].parent_id).toBe(folders[1].id)
  })

  it('imports requests with method, url, headers, query params', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1',
        _type: 'request',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: [
          { name: 'Accept', value: 'application/json', disabled: false },
          { name: 'X-Disabled', value: 'skip', disabled: true },
        ],
        parameters: [
          { name: 'page', value: '1', disabled: false },
        ],
        body: {},
        authentication: {},
        parentId: 'wrk_1',
      },
    ])
    const result = importInsomnia(json)
    expect(result.requests).toBe(1)

    const db = getDatabase()
    const req = db.prepare('SELECT * FROM requests WHERE name = ?').get('Get Users') as any
    expect(req.method).toBe('GET')
    expect(req.url).toBe('https://api.example.com/users')

    const headers = JSON.parse(req.headers)
    expect(headers).toHaveLength(2)
    expect(headers[0]).toEqual({ key: 'Accept', value: 'application/json', enabled: true })
    expect(headers[1]).toEqual({ key: 'X-Disabled', value: 'skip', enabled: false })

    const params = JSON.parse(req.query_params)
    expect(params).toHaveLength(1)
    expect(params[0]).toEqual({ key: 'page', value: '1', enabled: true })
  })

  it('imports JSON body', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', name: 'Create User',
        method: 'POST', url: 'https://api.example.com/users',
        headers: [], parameters: [],
        body: { mimeType: 'application/json', text: '{"name":"John"}' },
        authentication: {},
        parentId: 'wrk_1',
      },
    ])
    const result = importInsomnia(json)
    expect(result.requests).toBe(1)

    const db = getDatabase()
    const req = db.prepare('SELECT * FROM requests WHERE name = ?').get('Create User') as any
    expect(req.body_type).toBe('json')
    expect(req.body).toBe('{"name":"John"}')
  })

  it('imports form-data body', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', name: 'Upload',
        method: 'POST', url: 'https://api.example.com/upload',
        headers: [], parameters: [],
        body: {
          mimeType: 'multipart/form-data',
          params: [
            { name: 'file', value: 'test.txt', disabled: false },
            { name: 'desc', value: 'A file', disabled: false },
          ],
        },
        authentication: {},
        parentId: 'wrk_1',
      },
    ])
    const result = importInsomnia(json)
    expect(result.requests).toBe(1)

    const db = getDatabase()
    const req = db.prepare('SELECT * FROM requests WHERE name = ?').get('Upload') as any
    expect(req.body_type).toBe('form-data')
    const entries = JSON.parse(req.body)
    expect(entries).toHaveLength(2)
    expect(entries[0].key).toBe('file')
  })

  it('imports bearer auth', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', name: 'Auth Request',
        method: 'GET', url: 'https://api.example.com',
        headers: [], parameters: [], body: {},
        authentication: { type: 'bearer', token: 'my-secret-token' },
        parentId: 'wrk_1',
      },
    ])
    const result = importInsomnia(json)
    expect(result.requests).toBe(1)

    const db = getDatabase()
    const req = db.prepare('SELECT * FROM requests WHERE name = ?').get('Auth Request') as any
    const auth = JSON.parse(req.auth)
    expect(auth.type).toBe('bearer')
    // Token is encrypted, so check it starts with enc: prefix
    expect(auth.bearer_token).toMatch(/^enc:/)
  })

  it('imports basic auth', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', name: 'Basic Auth',
        method: 'GET', url: 'https://api.example.com',
        headers: [], parameters: [], body: {},
        authentication: { type: 'basic', username: 'admin', password: 'pass' },
        parentId: 'wrk_1',
      },
    ])
    const result = importInsomnia(json)
    expect(result.requests).toBe(1)

    const db = getDatabase()
    const req = db.prepare('SELECT * FROM requests WHERE name = ?').get('Basic Auth') as any
    const auth = JSON.parse(req.auth)
    expect(auth.type).toBe('basic')
  })

  it('imports environments (non-base)', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'env_1', _type: 'environment', name: 'Production',
        data: { base_url: 'https://api.example.com', token: 'abc123' },
        parentId: 'wrk_1',
      },
    ])
    const result = importInsomnia(json)
    expect(result.environments).toBe(1)

    const db = getDatabase()
    const env = db.prepare('SELECT * FROM environments WHERE name = ?').get('Production') as any
    expect(env).toBeDefined()
    const variables = JSON.parse(env.variables)
    expect(variables).toHaveLength(2)
    expect(variables[0].key).toBe('base_url')
    expect(variables[1].key).toBe('token')
  })

  it('skips base environments', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'env_base_env_1', _type: 'environment', name: 'Base Environment',
        data: { base_url: 'https://api.example.com' },
        parentId: 'wrk_1',
      },
      {
        _id: 'env_2', _type: 'environment', name: 'Base',
        data: {},
        parentId: '__BASE_ENVIRONMENT_ID__',
      },
    ])
    const result = importInsomnia(json)
    expect(result.environments).toBe(0)
  })

  it('skips unsupported resource types', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      { _id: 'jar_1', _type: 'cookie_jar', name: 'Cookies', parentId: 'wrk_1' },
      { _id: 'spec_1', _type: 'api_spec', name: 'Spec', parentId: 'wrk_1' },
    ])
    const result = importInsomnia(json)
    expect(result.collections).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('imports requests into correct folders', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      { _id: 'fld_1', _type: 'request_group', name: 'Users', parentId: 'wrk_1' },
      {
        _id: 'req_1', _type: 'request', name: 'In Folder',
        method: 'GET', url: 'https://api.example.com/users',
        headers: [], parameters: [], body: {}, authentication: {},
        parentId: 'fld_1',
      },
      {
        _id: 'req_2', _type: 'request', name: 'Root Level',
        method: 'GET', url: 'https://api.example.com',
        headers: [], parameters: [], body: {}, authentication: {},
        parentId: 'wrk_1',
      },
    ])
    const result = importInsomnia(json)
    expect(result.requests).toBe(2)
    expect(result.folders).toBe(1)

    const db = getDatabase()
    const inFolder = db.prepare('SELECT * FROM requests WHERE name = ?').get('In Folder') as any
    expect(inFolder.folder_id).not.toBeNull()

    const rootLevel = db.prepare('SELECT * FROM requests WHERE name = ?').get('Root Level') as any
    expect(rootLevel.folder_id).toBeNull()
  })

  it('generates unique names when duplicates exist', () => {
    // Import twice
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
    ])
    importInsomnia(json)
    const result = importInsomnia(json)
    expect(result.collections).toBe(1)

    const db = getDatabase()
    const colls = db.prepare('SELECT name FROM collections ORDER BY name').all() as { name: string }[]
    expect(colls.map((c) => c.name)).toEqual(['API', 'API (2)'])
  })
})
