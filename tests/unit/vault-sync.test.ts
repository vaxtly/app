import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import {
  buildPath,
  isConfigured,
  resetProvider,
  getCachedVariables,
  setCachedVariables,
  clearCache,
} from '../../src/main/vault/vault-sync-service'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
  resetProvider()
})
afterEach(() => closeDatabase())

describe('buildPath', () => {
  it('uses vault_path when set', () => {
    expect(buildPath({ name: 'Production', vault_path: 'custom/path' })).toBe('custom/path')
  })

  it('slugifies name when vault_path is null', () => {
    expect(buildPath({ name: 'My Production Env', vault_path: null })).toBe('my-production-env')
  })

  it('handles special characters', () => {
    expect(buildPath({ name: 'Test (1) & Dev!', vault_path: null })).toBe('test-1-dev')
  })

  it('trims leading/trailing hyphens', () => {
    expect(buildPath({ name: '---test---', vault_path: null })).toBe('test')
  })
})

describe('isConfigured', () => {
  it('returns false when no settings', () => {
    expect(isConfigured()).toBe(false)
  })

  it('returns false when only provider is set', () => {
    settingsRepo.setSetting('vault.provider', 'hashicorp')
    expect(isConfigured()).toBe(false)
  })

  it('returns true when provider and url are set', () => {
    settingsRepo.setSetting('vault.provider', 'hashicorp')
    settingsRepo.setSetting('vault.url', 'https://vault.example.com')
    expect(isConfigured()).toBe(true)
  })

  it('isConfigured with workspace-scoped settings', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    workspacesRepo.setWorkspaceSetting(ws.id, 'vault.provider', 'hashicorp')
    workspacesRepo.setWorkspaceSetting(ws.id, 'vault.url', 'https://vault.ws.com')
    expect(isConfigured(ws.id)).toBe(true)
    // Global should still be false
    expect(isConfigured()).toBe(false)
  })

  it('returns true for AWS when region is set', () => {
    settingsRepo.setSetting('vault.provider', 'aws')
    settingsRepo.setSetting('vault.aws_region', 'us-east-1')
    expect(isConfigured()).toBe(true)
  })

  it('returns false for AWS without region', () => {
    settingsRepo.setSetting('vault.provider', 'aws')
    expect(isConfigured()).toBe(false)
  })

  it('resetProvider clears cached provider', () => {
    settingsRepo.setSetting('vault.provider', 'hashicorp')
    settingsRepo.setSetting('vault.url', 'https://vault.example.com')
    expect(isConfigured()).toBe(true)

    // After clearing settings and resetting, should be false
    settingsRepo.removeSetting('vault.provider')
    settingsRepo.removeSetting('vault.url')
    resetProvider()
    expect(isConfigured()).toBe(false)
  })
})

describe('in-memory secrets cache', () => {
  it('getCachedVariables returns null when nothing cached', () => {
    expect(getCachedVariables('nonexistent')).toBeNull()
  })

  it('setCachedVariables + getCachedVariables roundtrip', () => {
    const vars = [
      { key: 'DB_HOST', value: 'localhost', enabled: true },
      { key: 'DB_PASS', value: 'secret', enabled: true },
    ]
    setCachedVariables('env-1', vars)

    const cached = getCachedVariables('env-1')
    expect(cached).toEqual(vars)
  })

  it('clearCache removes specific environment entry', () => {
    setCachedVariables('env-a', [{ key: 'A', value: '1', enabled: true }])
    setCachedVariables('env-b', [{ key: 'B', value: '2', enabled: true }])

    clearCache('env-a')

    expect(getCachedVariables('env-a')).toBeNull()
    expect(getCachedVariables('env-b')).not.toBeNull()
  })

  it('resetProvider clears entire secrets cache', () => {
    setCachedVariables('env-1', [{ key: 'K', value: 'V', enabled: true }])
    setCachedVariables('env-2', [{ key: 'K2', value: 'V2', enabled: true }])

    resetProvider()

    expect(getCachedVariables('env-1')).toBeNull()
    expect(getCachedVariables('env-2')).toBeNull()
  })

  it('setCachedVariables overwrites previous cache entry', () => {
    setCachedVariables('env-1', [{ key: 'old', value: 'val', enabled: true }])
    setCachedVariables('env-1', [{ key: 'new', value: 'val2', enabled: true }])

    const cached = getCachedVariables('env-1')
    expect(cached).toHaveLength(1)
    expect(cached![0].key).toBe('new')
  })
})
