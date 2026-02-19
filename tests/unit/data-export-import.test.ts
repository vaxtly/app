import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as foldersRepo from '../../src/main/database/repositories/folders'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import {
  exportAll,
  exportCollections,
  exportEnvironments,
  exportConfig,
  importData,
} from '../../src/main/services/data-export-import'

beforeEach(() => openTestDatabase())
afterEach(() => closeDatabase())

describe('export', () => {
  it('exports all data with correct wrapper format', () => {
    collectionsRepo.create({ name: 'Test Collection' })
    environmentsRepo.create({ name: 'Test Env', variables: JSON.stringify([{ key: 'a', value: '1', enabled: true }]) })

    const result = exportAll()

    expect(result.vaxtly_export).toBe(true)
    expect(result.version).toBe(1)
    expect(result.type).toBe('all')
    expect(result.exported_at).toBeTruthy()
    expect(result.data).toHaveProperty('collections')
    expect(result.data).toHaveProperty('environments')
    expect(result.data).toHaveProperty('config')
  })

  it('exports collections with folders and requests', () => {
    const collection = collectionsRepo.create({ name: 'My API' })
    const folder = foldersRepo.create({ collection_id: collection.id, name: 'Auth' })
    requestsRepo.create({ collection_id: collection.id, name: 'Root Request', method: 'GET' })
    requestsRepo.create({ collection_id: collection.id, name: 'Login', folder_id: folder.id, method: 'POST' })

    const result = exportCollections()
    const collections = result.data.collections as any[]

    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('My API')
    expect(collections[0].requests).toHaveLength(1)
    expect(collections[0].requests[0].name).toBe('Root Request')
    expect(collections[0].folders).toHaveLength(1)
    expect(collections[0].folders[0].name).toBe('Auth')
    expect(collections[0].folders[0].requests).toHaveLength(1)
    expect(collections[0].folders[0].requests[0].name).toBe('Login')
  })

  it('exports environments, skipping variables for vault-synced', () => {
    environmentsRepo.create({ name: 'Local Env', variables: JSON.stringify([{ key: 'a', value: '1', enabled: true }]) })
    const vaultEnv = environmentsRepo.create({ name: 'Vault Env', variables: JSON.stringify([{ key: 'b', value: '2', enabled: true }]) })
    environmentsRepo.update(vaultEnv.id, { vault_synced: 1, vault_path: 'vault-env' })

    const result = exportEnvironments()
    const environments = result.data.environments as any[]

    expect(environments).toHaveLength(2)
    const local = environments.find((e: any) => e.name === 'Local Env')
    const vault = environments.find((e: any) => e.name === 'Vault Env')

    expect(local.variables).toHaveLength(1)
    expect(vault.variables).toHaveLength(0) // vault-synced → empty
  })

  it('exports config settings', () => {
    settingsRepo.setSetting('sync.provider', 'github')
    settingsRepo.setSetting('sync.repository', 'user/repo')
    settingsRepo.setSetting('vault.url', 'https://vault.example.com')

    const result = exportConfig()
    const config = result.data.config as any

    expect(config.remote.provider).toBe('github')
    expect(config.remote.repository).toBe('user/repo')
    expect(config.vault.url).toBe('https://vault.example.com')
  })
})

describe('import', () => {
  it('imports collections with folders and requests', () => {
    const exportData = exportAll()

    // Create some data to export
    const collection = collectionsRepo.create({ name: 'Export Me' })
    foldersRepo.create({ collection_id: collection.id, name: 'Folder1' })
    requestsRepo.create({ collection_id: collection.id, name: 'Req1', method: 'POST' })

    const exported = exportCollections()

    // Clear everything
    collectionsRepo.remove(collection.id)

    const result = importData(JSON.stringify(exported))

    expect(result.collections).toBe(1)
    expect(result.errors).toHaveLength(0)

    const collections = collectionsRepo.findAll()
    expect(collections).toHaveLength(1)
    expect(collections[0].name).toBe('Export Me')

    const requests = requestsRepo.findByCollection(collections[0].id)
    expect(requests).toHaveLength(1)
    expect(requests[0].name).toBe('Req1')
  })

  it('imports environments', () => {
    environmentsRepo.create({ name: 'My Env', variables: JSON.stringify([{ key: 'x', value: 'y', enabled: true }]) })
    const exported = exportEnvironments()

    // Clear
    const all = environmentsRepo.findAll()
    for (const e of all) environmentsRepo.remove(e.id)

    const result = importData(JSON.stringify(exported))

    expect(result.environments).toBe(1)
    const envs = environmentsRepo.findAll()
    expect(envs).toHaveLength(1)
    expect(envs[0].name).toBe('My Env')
  })

  it('imports config settings', () => {
    settingsRepo.setSetting('sync.provider', 'gitlab')
    settingsRepo.setSetting('sync.repository', 'group/project')
    const exported = exportConfig()

    // Clear settings
    settingsRepo.setSetting('sync.provider', '')
    settingsRepo.setSetting('sync.repository', '')

    const result = importData(JSON.stringify(exported))

    expect(result.config).toBe(true)
    expect(settingsRepo.getSetting('sync.provider')).toBe('gitlab')
    expect(settingsRepo.getSetting('sync.repository')).toBe('group/project')
  })

  it('generates unique names for duplicate collections', () => {
    collectionsRepo.create({ name: 'API' })

    const exported = {
      vaxtly_export: true,
      version: 1,
      type: 'collections',
      exported_at: new Date().toISOString(),
      data: {
        collections: [{ name: 'API', folders: [], requests: [] }],
      },
    }

    const result = importData(JSON.stringify(exported))
    expect(result.collections).toBe(1)

    const collections = collectionsRepo.findAll()
    expect(collections).toHaveLength(2)
    expect(collections.map((c) => c.name).sort()).toEqual(['API', 'API (2)'])
  })

  it('rejects invalid JSON', () => {
    const result = importData('not json')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Invalid JSON')
  })

  it('rejects invalid export format', () => {
    const result = importData(JSON.stringify({ foo: 'bar' }))
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Invalid Vaxtly export format')
  })

  it('rejects unsupported version', () => {
    const result = importData(JSON.stringify({
      vaxtly_export: true,
      version: 99,
      data: {},
    }))
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Unsupported export version')
  })
})
