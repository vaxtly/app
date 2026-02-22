import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Capture IPC handlers
const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Function) => { handlers.set(ch, fn) } },
  BrowserWindow: { getAllWindows: () => [] },
}))

// Mock vault service entirely
vi.mock('../../src/main/vault/vault-sync-service', () => ({
  testConnection: vi.fn(),
  pullAll: vi.fn(),
  pushVariables: vi.fn(),
  fetchVariables: vi.fn(),
  deleteSecrets: vi.fn(),
  migrateEnvironment: vi.fn(),
  getCachedVariables: vi.fn().mockReturnValue(null),
  clearCache: vi.fn(),
}))

// Mock session-log (logVault is called by fetch-variables handler)
vi.mock('../../src/main/services/session-log', () => ({
  logVault: vi.fn(),
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import { registerVaultHandlers } from '../../src/main/ipc/vault'
import * as vaultService from '../../src/main/vault/vault-sync-service'
import * as environmentsRepo from '../../src/main/database/repositories/environments'

beforeEach(() => {
  handlers.clear()
  openTestDatabase()
  initEncryptionForTesting()
  registerVaultHandlers()
  vi.clearAllMocks()
})
afterEach(() => closeDatabase())

function invoke(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler for ${channel}`)
  return handler(null, ...args)
}

describe('vault:test-connection', () => {
  it('returns success when connection succeeds', async () => {
    vi.mocked(vaultService.testConnection).mockResolvedValue(true)
    const result = await invoke('vault:test-connection', 'ws-1')
    expect(vaultService.testConnection).toHaveBeenCalledWith('ws-1')
    expect(result.success).toBe(true)
    expect(result.message).toBe('Connected')
  })

  it('returns failure when connection fails', async () => {
    vi.mocked(vaultService.testConnection).mockResolvedValue(false)
    const result = await invoke('vault:test-connection')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Connection failed')
  })

  it('returns error message on exception', async () => {
    vi.mocked(vaultService.testConnection).mockRejectedValue(new Error('Network error'))
    const result = await invoke('vault:test-connection')
    expect(result.success).toBe(false)
    expect(result.message).toContain('Network error')
  })
})

describe('vault:pull', () => {
  it('returns success with created count', async () => {
    vi.mocked(vaultService.pullAll).mockResolvedValue({ created: 3, errors: [] })
    const result = await invoke('vault:pull', 'ws-1')
    expect(result.success).toBe(true)
    expect(result.message).toContain('3')
    expect(result.pulled).toBe(3)
  })

  it('returns error on exception', async () => {
    vi.mocked(vaultService.pullAll).mockRejectedValue(new Error('Vault unreachable'))
    const result = await invoke('vault:pull')
    expect(result.success).toBe(false)
    expect(result.message).toContain('Vault unreachable')
  })
})

describe('vault:push', () => {
  it('returns not found when environment missing', async () => {
    const result = await invoke('vault:push', 'nonexistent')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Environment not found')
  })

  it('parses variables and pushes', async () => {
    const env = environmentsRepo.create({
      name: 'Dev',
      variables: JSON.stringify([{ key: 'api_key', value: 'secret', enabled: true }]),
    })
    vi.mocked(vaultService.pushVariables).mockResolvedValue(undefined)
    const result = await invoke('vault:push', env.id, 'ws-1')
    expect(vaultService.pushVariables).toHaveBeenCalledWith(
      env.id,
      [{ key: 'api_key', value: 'secret', enabled: true }],
      'ws-1',
    )
    expect(result.success).toBe(true)
    expect(result.message).toBe('Pushed to Vault')
  })

  it('returns error on exception', async () => {
    const env = environmentsRepo.create({ name: 'Dev', variables: '[]' })
    vi.mocked(vaultService.pushVariables).mockRejectedValue(new Error('Write denied'))
    const result = await invoke('vault:push', env.id)
    expect(result.success).toBe(false)
    expect(result.message).toContain('Write denied')
  })

  it('uses cached variables over DB variables when cache exists', async () => {
    const env = environmentsRepo.create({
      name: 'Vault Env',
      variables: '[]', // DB has empty variables (vault-synced)
    })
    const cachedVars = [{ key: 'secret', value: 'from-cache', enabled: true }]
    vi.mocked(vaultService.getCachedVariables).mockReturnValue(cachedVars)
    vi.mocked(vaultService.pushVariables).mockResolvedValue(undefined)

    const result = await invoke('vault:push', env.id, 'ws-1')

    expect(vaultService.pushVariables).toHaveBeenCalledWith(env.id, cachedVars, 'ws-1')
    expect(result.success).toBe(true)
  })

  it('falls back to DB variables when cache is null', async () => {
    const dbVars = [{ key: 'local', value: 'from-db', enabled: true }]
    const env = environmentsRepo.create({
      name: 'Local Env',
      variables: JSON.stringify(dbVars),
    })
    vi.mocked(vaultService.getCachedVariables).mockReturnValue(null)
    vi.mocked(vaultService.pushVariables).mockResolvedValue(undefined)

    const result = await invoke('vault:push', env.id)

    expect(vaultService.pushVariables).toHaveBeenCalledWith(env.id, dbVars, undefined)
    expect(result.success).toBe(true)
  })
})

describe('vault:pull-all', () => {
  it('returns success with created count', async () => {
    vi.mocked(vaultService.pullAll).mockResolvedValue({ created: 2, errors: [] })
    const result = await invoke('vault:pull-all')
    expect(result.success).toBe(true)
    expect(result.created).toBe(2)
    expect(result.errors).toEqual([])
  })

  it('returns errors array on exception', async () => {
    vi.mocked(vaultService.pullAll).mockRejectedValue(new Error('Connection lost'))
    const result = await invoke('vault:pull-all')
    expect(result.success).toBe(false)
    expect(result.created).toBe(0)
    expect(result.errors).toContainEqual(expect.stringContaining('Connection lost'))
  })
})

describe('vault:fetch-variables', () => {
  it('returns variables from service', async () => {
    const vars = [{ key: 'DB_HOST', value: 'localhost', enabled: true }]
    vi.mocked(vaultService.fetchVariables).mockResolvedValue(vars)
    const result = await invoke('vault:fetch-variables', 'env-1', 'ws-1')
    expect(vaultService.clearCache).toHaveBeenCalledWith('env-1')
    expect(vaultService.fetchVariables).toHaveBeenCalledWith('env-1', 'ws-1')
    expect(result).toEqual(vars)
  })

  it('throws formatted error on failure', async () => {
    vi.mocked(vaultService.fetchVariables).mockRejectedValue(new Error('Not found'))
    await expect(invoke('vault:fetch-variables', 'env-1')).rejects.toThrow('Not found')
  })
})

describe('vault:push-variables', () => {
  it('returns success on push', async () => {
    vi.mocked(vaultService.pushVariables).mockResolvedValue(undefined)
    const vars = [{ key: 'K', value: 'V', enabled: true }]
    const result = await invoke('vault:push-variables', 'env-1', vars, 'ws-1')
    expect(vaultService.pushVariables).toHaveBeenCalledWith('env-1', vars, 'ws-1')
    expect(result.success).toBe(true)
  })

  it('returns failure on error', async () => {
    vi.mocked(vaultService.pushVariables).mockRejectedValue(new Error('Denied'))
    const result = await invoke('vault:push-variables', 'env-1', [])
    expect(result.success).toBe(false)
    expect(result.message).toContain('Denied')
  })
})

describe('vault:delete-secrets', () => {
  it('returns success on delete', async () => {
    vi.mocked(vaultService.deleteSecrets).mockResolvedValue(undefined)
    const result = await invoke('vault:delete-secrets', 'env-1')
    expect(vaultService.deleteSecrets).toHaveBeenCalledWith('env-1', undefined)
    expect(result.success).toBe(true)
  })
})

describe('vault:migrate', () => {
  it('rejects paths with .. traversal', async () => {
    const result = await invoke('vault:migrate', 'env-1', 'old/../etc', 'new/path')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Invalid vault path')
  })

  it('rejects paths starting with /', async () => {
    const result = await invoke('vault:migrate', 'env-1', '/absolute/path', 'new/path')
    expect(result.success).toBe(false)
    expect(result.message).toBe('Invalid vault path')
  })

  it('calls migrateEnvironment on valid paths', async () => {
    vi.mocked(vaultService.migrateEnvironment).mockResolvedValue(undefined)
    const result = await invoke('vault:migrate', 'env-1', 'old/path', 'new/path', 'ws-1')
    expect(vaultService.migrateEnvironment).toHaveBeenCalledWith('env-1', 'old/path', 'new/path', 'ws-1')
    expect(result.success).toBe(true)
  })
})
