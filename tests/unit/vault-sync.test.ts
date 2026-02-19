import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import { buildPath, isConfigured, resetProvider } from '../../src/main/vault/vault-sync-service'

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
