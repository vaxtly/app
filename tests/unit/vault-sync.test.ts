import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import { buildPath, isConfigured, resetProvider } from '../../src/main/vault/vault-sync-service'

beforeEach(() => {
  openTestDatabase()
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
})
