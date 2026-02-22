/**
 * Vault in-memory secrets — end-to-end integration tests.
 *
 * These tests exercise the full flow through real code (vault-sync-service,
 * variable-substitution, script-execution) with only the external boundary
 * mocked (HashiCorpVaultProvider → fake in-memory provider).
 *
 * Two scenarios:
 *   1. Fresh install: configure vault → pull → variables resolve → send request
 *   2. Normal use: app reopens with vault already configured → auto-sync → variables work
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock electron (needed by session-log → BrowserWindow)
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

// --- Fake Vault Provider ---
// Simulates a remote HashiCorp Vault with an in-memory store.
import type { SecretsProvider } from '../../src/main/vault/secrets-provider.interface'

function createFakeVaultProvider(initialSecrets: Record<string, Record<string, string>> = {}): SecretsProvider & { store: Record<string, Record<string, string>> } {
  const store: Record<string, Record<string, string>> = { ...initialSecrets }
  return {
    store,
    async listSecrets() {
      return Object.keys(store)
    },
    async getSecrets(path: string) {
      return store[path] ?? null
    },
    async putSecrets(path: string, data: Record<string, string>) {
      store[path] = { ...data }
    },
    async deleteSecrets(path: string) {
      delete store[path]
    },
    async testConnection() {
      return true
    },
  }
}

// Mock HashiCorpVaultProvider.create to return our fake provider
let fakeProvider: ReturnType<typeof createFakeVaultProvider>

vi.mock('../../src/main/vault/hashicorp-vault-provider', () => ({
  HashiCorpVaultProvider: {
    create: vi.fn(async () => fakeProvider),
  },
}))

vi.mock('../../src/main/vault/aws-secrets-manager-provider', () => ({
  AwsSecretsManagerProvider: {
    create: vi.fn(async () => fakeProvider),
  },
}))

import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as settingsRepo from '../../src/main/database/repositories/settings'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as requestsRepo from '../../src/main/database/repositories/requests'
import * as vaultSyncService from '../../src/main/vault/vault-sync-service'
import { getResolvedVariables, getResolvedVariablesWithSource, substitute } from '../../src/main/services/variable-substitution'
import { executePostResponseScripts } from '../../src/main/services/script-execution'
import type { ResponseData } from '../../src/shared/types/http'

function configureVault(workspaceId?: string): void {
  const set = (key: string, value: string) => {
    if (workspaceId) {
      workspacesRepo.setWorkspaceSetting(workspaceId, key, value)
    } else {
      settingsRepo.setSetting(key, value)
    }
  }
  set('vault.provider', 'hashicorp')
  set('vault.url', 'https://vault.fake.test')
  set('vault.token', 'test-root-token')
}

function configureAwsVault(workspaceId?: string): void {
  const set = (key: string, value: string) => {
    if (workspaceId) {
      workspacesRepo.setWorkspaceSetting(workspaceId, key, value)
    } else {
      settingsRepo.setSetting(key, value)
    }
  }
  set('vault.provider', 'aws')
  set('vault.aws_auth_method', 'keys')
  set('vault.aws_region', 'us-east-1')
  set('vault.aws_access_key_id', 'AKIATEST')
  set('vault.aws_secret_access_key', 'testsecret')
}

function makeResponse(overrides: Partial<ResponseData> = {}): ResponseData {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '{}',
    size: 0,
    timing: { start: 0, ttfb: 0, total: 0 },
    cookies: [],
    ...overrides,
  }
}

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
  vaultSyncService.resetProvider()
})

afterEach(() => {
  vaultSyncService.resetProvider()
  closeDatabase()
})

// ────────────────────────────────────────────────────────────────────────
// Scenario 1: Fresh install — user configures Vault, pulls, uses variables
// ────────────────────────────────────────────────────────────────────────

describe('fresh install: configure → pull → use', () => {
  it('full flow: pullAll creates envs, caches secrets, DB stays clean, variables resolve', async () => {
    const ws = workspacesRepo.create({ name: 'My Workspace' })

    // Vault has two secret paths
    fakeProvider = createFakeVaultProvider({
      'production': { API_KEY: 'prod-key-123', DB_HOST: 'db.prod.internal' },
      'staging': { API_KEY: 'staging-key-456', DB_HOST: 'db.staging.internal' },
    })
    configureVault(ws.id)

    // --- Pull All ---
    const result = await vaultSyncService.pullAll(ws.id)
    expect(result.created).toBe(2)
    expect(result.errors).toEqual([])

    // --- Verify DB records ---
    const envs = environmentsRepo.findByWorkspace(ws.id).filter(e => e.vault_synced === 1)
    expect(envs).toHaveLength(2)

    const prodEnv = envs.find(e => e.vault_path === 'production')!
    const stagingEnv = envs.find(e => e.vault_path === 'staging')!
    expect(prodEnv).toBeDefined()
    expect(stagingEnv).toBeDefined()

    // DB variables must be empty — secrets are in-memory only
    expect(JSON.parse(prodEnv.variables)).toEqual([])
    expect(JSON.parse(stagingEnv.variables)).toEqual([])

    // --- Verify in-memory cache ---
    const prodCached = vaultSyncService.getCachedVariables(prodEnv.id)!
    expect(prodCached).toHaveLength(2)
    expect(prodCached.find(v => v.key === 'API_KEY')!.value).toBe('prod-key-123')
    expect(prodCached.find(v => v.key === 'DB_HOST')!.value).toBe('db.prod.internal')

    // --- Activate env and resolve variables ---
    environmentsRepo.activate(prodEnv.id, ws.id)

    const vars = getResolvedVariables(ws.id)
    expect(vars.API_KEY).toBe('prod-key-123')
    expect(vars.DB_HOST).toBe('db.prod.internal')

    // --- Substitute in a URL template ---
    const resolved = substitute('https://{{DB_HOST}}/api?key={{API_KEY}}', ws.id)
    expect(resolved).toBe('https://db.prod.internal/api?key=prod-key-123')
  })

  it('getResolvedVariablesWithSource shows correct source label for vault envs', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    fakeProvider = createFakeVaultProvider({
      'my-env': { TOKEN: 'abc' },
    })
    configureVault(ws.id)

    await vaultSyncService.pullAll(ws.id)
    const envs = environmentsRepo.findByWorkspace(ws.id).filter(e => e.vault_synced === 1)
    environmentsRepo.activate(envs[0].id, ws.id)

    const resolved = getResolvedVariablesWithSource(ws.id)
    expect(resolved.TOKEN.value).toBe('abc')
    expect(resolved.TOKEN.source).toBe(`Env: ${envs[0].name}`)
  })

  it('collection variables override vault-cached variables', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    fakeProvider = createFakeVaultProvider({
      'dev': { BASE_URL: 'https://vault-dev.com', TOKEN: 'vault-tok' },
    })
    configureVault(ws.id)

    await vaultSyncService.pullAll(ws.id)
    const env = environmentsRepo.findByWorkspace(ws.id).find(e => e.vault_synced === 1)!
    environmentsRepo.activate(env.id, ws.id)

    const col = collectionsRepo.create({ name: 'API', workspace_id: ws.id })
    collectionsRepo.update(col.id, { variables: JSON.stringify({ BASE_URL: 'https://override.com' }) })

    const vars = getResolvedVariables(ws.id, col.id)
    expect(vars.BASE_URL).toBe('https://override.com')  // collection wins
    expect(vars.TOKEN).toBe('vault-tok')  // vault provides
  })

  it('push updates both Vault and in-memory cache', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    fakeProvider = createFakeVaultProvider({
      'env-a': { KEY: 'original' },
    })
    configureVault(ws.id)

    await vaultSyncService.pullAll(ws.id)
    const env = environmentsRepo.findByWorkspace(ws.id).find(e => e.vault_synced === 1)!

    // Push new variables
    const newVars = [
      { key: 'KEY', value: 'updated', enabled: true },
      { key: 'NEW_KEY', value: 'added', enabled: true },
    ]
    await vaultSyncService.pushVariables(env.id, newVars, ws.id)

    // Verify the fake Vault got the update
    expect(fakeProvider.store['env-a']).toEqual({ KEY: 'updated', NEW_KEY: 'added' })

    // Verify cache was updated (not cleared)
    const cached = vaultSyncService.getCachedVariables(env.id)!
    expect(cached).toHaveLength(2)
    expect(cached.find(v => v.key === 'KEY')!.value).toBe('updated')

    // Verify DB still has empty variables
    const dbEnv = environmentsRepo.findById(env.id)!
    expect(JSON.parse(dbEnv.variables)).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────
// Scenario 2: Normal use — app reopens with vault already configured
// ────────────────────────────────────────────────────────────────────────

describe('normal use: app reopens → auto-sync → use', () => {
  it('pullAll refreshes cache for existing vault-synced envs without touching DB', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })

    // Simulate prior install: env exists in DB with vault metadata
    const env = environmentsRepo.create({ name: 'Production', workspace_id: ws.id, variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'production' })

    // Vault has updated secrets
    fakeProvider = createFakeVaultProvider({
      'production': { API_KEY: 'refreshed-key', SECRET: 'new-secret' },
    })
    configureVault(ws.id)

    // Auto-sync on startup
    const result = await vaultSyncService.pullAll(ws.id)
    expect(result.refreshed).toBe(1)
    expect(result.created).toBe(0)

    // Cache is populated
    const cached = vaultSyncService.getCachedVariables(env.id)!
    expect(cached).toHaveLength(2)
    expect(cached.find(v => v.key === 'API_KEY')!.value).toBe('refreshed-key')

    // DB variables still empty
    const dbEnv = environmentsRepo.findById(env.id)!
    expect(JSON.parse(dbEnv.variables)).toEqual([])

    // Variables resolve
    environmentsRepo.activate(env.id, ws.id)
    const vars = getResolvedVariables(ws.id)
    expect(vars.API_KEY).toBe('refreshed-key')
    expect(vars.SECRET).toBe('new-secret')
  })

  it('pullAll picks up new vault paths and refreshes existing ones', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })

    // Existing env from prior session
    const existing = environmentsRepo.create({ name: 'Staging', workspace_id: ws.id, variables: '[]' })
    environmentsRepo.update(existing.id, { vault_synced: 1, vault_path: 'staging' })

    // Vault now has the existing path + a new one
    fakeProvider = createFakeVaultProvider({
      'staging': { DB: 'staging-db' },
      'qa': { DB: 'qa-db' },
    })
    configureVault(ws.id)

    const result = await vaultSyncService.pullAll(ws.id)
    expect(result.refreshed).toBe(1)
    expect(result.created).toBe(1)

    // Both are cached
    expect(vaultSyncService.getCachedVariables(existing.id)).not.toBeNull()

    const allEnvs = environmentsRepo.findByWorkspace(ws.id).filter(e => e.vault_synced === 1)
    const qaEnv = allEnvs.find(e => e.vault_path === 'qa')!
    expect(vaultSyncService.getCachedVariables(qaEnv.id)).not.toBeNull()

    // Switch active env to QA and verify
    environmentsRepo.activate(qaEnv.id, ws.id)
    expect(getResolvedVariables(ws.id).DB).toBe('qa-db')
  })
})

// ────────────────────────────────────────────────────────────────────────
// Cold cache — ensureLoaded fetches on demand
// ────────────────────────────────────────────────────────────────────────

describe('cold cache: ensureLoaded fetches on demand', () => {
  it('ensureLoaded populates cache from Vault when empty', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = environmentsRepo.create({ name: 'Dev', workspace_id: ws.id, variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'dev' })
    environmentsRepo.activate(env.id, ws.id)

    fakeProvider = createFakeVaultProvider({
      'dev': { TOKEN: 'fetched-on-demand' },
    })
    configureVault(ws.id)

    // Cache is cold — no pullAll yet
    expect(vaultSyncService.getCachedVariables(env.id)).toBeNull()
    expect(getResolvedVariables(ws.id)).toEqual({})

    // ensureLoaded triggers fetch
    await vaultSyncService.ensureLoaded(env.id, ws.id)

    // Now cache is populated and variables resolve
    expect(vaultSyncService.getCachedVariables(env.id)).not.toBeNull()
    expect(getResolvedVariables(ws.id).TOKEN).toBe('fetched-on-demand')
  })

  it('ensureLoaded is idempotent — does not re-fetch if already cached', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = environmentsRepo.create({ name: 'Prod', workspace_id: ws.id, variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'prod' })

    fakeProvider = createFakeVaultProvider({
      'prod': { KEY: 'first-fetch' },
    })
    configureVault(ws.id)

    await vaultSyncService.ensureLoaded(env.id, ws.id)
    expect(vaultSyncService.getCachedVariables(env.id)![0].value).toBe('first-fetch')

    // Update vault (simulates external change), but ensureLoaded should NOT re-fetch
    fakeProvider.store['prod'] = { KEY: 'second-fetch' }

    await vaultSyncService.ensureLoaded(env.id, ws.id)
    expect(vaultSyncService.getCachedVariables(env.id)![0].value).toBe('first-fetch')
  })

  it('fetchVariables forces a fresh fetch (unlike ensureLoaded)', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = environmentsRepo.create({ name: 'Prod', workspace_id: ws.id, variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'prod' })

    fakeProvider = createFakeVaultProvider({
      'prod': { KEY: 'initial' },
    })
    configureVault(ws.id)

    await vaultSyncService.fetchVariables(env.id, ws.id)
    expect(vaultSyncService.getCachedVariables(env.id)![0].value).toBe('initial')

    // fetchVariables returns cached on subsequent calls (session-lifetime cache)
    fakeProvider.store['prod'] = { KEY: 'updated' }
    const result = await vaultSyncService.fetchVariables(env.id, ws.id)
    expect(result[0].value).toBe('initial') // still cached

    // clearCache + fetchVariables forces re-fetch
    vaultSyncService.clearCache(env.id)
    const fresh = await vaultSyncService.fetchVariables(env.id, ws.id)
    expect(fresh[0].value).toBe('updated')
  })
})

// ────────────────────────────────────────────────────────────────────────
// Script execution mirroring for vault-synced envs
// ────────────────────────────────────────────────────────────────────────

describe('script execution: mirror to vault-synced active env', () => {
  it('post-response script updates cache, not DB, for vault-synced env', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })

    fakeProvider = createFakeVaultProvider({
      'auth-env': { TOKEN: 'old-jwt', REGION: 'us-east' },
    })
    configureVault(ws.id)

    // Pull to populate cache
    await vaultSyncService.pullAll(ws.id)
    const env = environmentsRepo.findByWorkspace(ws.id).find(e => e.vault_synced === 1)!
    environmentsRepo.activate(env.id, ws.id)

    // Set up collection with request that has post-response script
    const col = collectionsRepo.create({ name: 'API', workspace_id: ws.id })
    const req = requestsRepo.create({ collection_id: col.id, name: 'Login' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.token', target: 'TOKEN' }],
      }),
    })

    // Execute post-response — this should update cache, not DB
    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ token: 'new-jwt-refreshed' }),
    }), ws.id)

    // Cache was updated
    const cached = vaultSyncService.getCachedVariables(env.id)!
    expect(cached.find(v => v.key === 'TOKEN')!.value).toBe('new-jwt-refreshed')
    expect(cached.find(v => v.key === 'REGION')!.value).toBe('us-east') // untouched

    // DB still has empty variables
    const dbEnv = environmentsRepo.findById(env.id)!
    expect(JSON.parse(dbEnv.variables)).toEqual([])

    // Subsequent variable resolution uses the updated value
    expect(getResolvedVariables(ws.id).TOKEN).toBe('new-jwt-refreshed')

    // The fake vault also got the push (fire-and-forget, give it a tick)
    await new Promise(r => setTimeout(r, 50))
    expect(fakeProvider.store['auth-env'].TOKEN).toBe('new-jwt-refreshed')
  })

  it('post-response script does NOT create new keys in vault cache', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })

    fakeProvider = createFakeVaultProvider({
      'env': { EXISTING: 'val' },
    })
    configureVault(ws.id)

    await vaultSyncService.pullAll(ws.id)
    const env = environmentsRepo.findByWorkspace(ws.id).find(e => e.vault_synced === 1)!
    environmentsRepo.activate(env.id, ws.id)

    const col = collectionsRepo.create({ name: 'Col', workspace_id: ws.id })
    const req = requestsRepo.create({ collection_id: col.id, name: 'R' })
    requestsRepo.update(req.id, {
      scripts: JSON.stringify({
        post_response: [{ action: 'set_variable', source: 'body.new_key', target: 'NEW_KEY' }],
      }),
    })

    executePostResponseScripts(req.id, col.id, makeResponse({
      body: JSON.stringify({ new_key: 'injected' }),
    }), ws.id)

    // Cache should still only have the original key
    const cached = vaultSyncService.getCachedVariables(env.id)!
    expect(cached).toHaveLength(1)
    expect(cached[0].key).toBe('EXISTING')
  })
})

// ────────────────────────────────────────────────────────────────────────
// Vault delete and environment cleanup
// ────────────────────────────────────────────────────────────────────────

describe('vault delete clears cache', () => {
  it('deleteSecrets removes entry from cache and vault', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })

    fakeProvider = createFakeVaultProvider({
      'to-delete': { SECRET: 'value' },
    })
    configureVault(ws.id)

    await vaultSyncService.pullAll(ws.id)
    const env = environmentsRepo.findByWorkspace(ws.id).find(e => e.vault_synced === 1)!

    expect(vaultSyncService.getCachedVariables(env.id)).not.toBeNull()

    await vaultSyncService.deleteSecrets(env.id, ws.id)

    // Cache cleared
    expect(vaultSyncService.getCachedVariables(env.id)).toBeNull()
    // Vault cleared
    expect(fakeProvider.store['to-delete']).toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────────────────
// AWS Secrets Manager — configure → pullAll → fetch → push
// ────────────────────────────────────────────────────────────────────────

describe('AWS Secrets Manager: configure → pull → use', () => {
  it('full flow: pullAll creates envs, caches secrets, push updates', async () => {
    const ws = workspacesRepo.create({ name: 'AWS Workspace' })

    fakeProvider = createFakeVaultProvider({
      'production': { API_KEY: 'aws-prod-key', DB_HOST: 'rds.prod.internal' },
      'staging': { API_KEY: 'aws-staging-key' },
    })
    configureAwsVault(ws.id)

    // Pull All
    const result = await vaultSyncService.pullAll(ws.id)
    expect(result.created).toBe(2)
    expect(result.errors).toEqual([])

    // Verify DB records
    const envs = environmentsRepo.findByWorkspace(ws.id).filter(e => e.vault_synced === 1)
    expect(envs).toHaveLength(2)

    const prodEnv = envs.find(e => e.vault_path === 'production')!
    expect(prodEnv).toBeDefined()
    expect(JSON.parse(prodEnv.variables)).toEqual([])

    // Verify in-memory cache
    const prodCached = vaultSyncService.getCachedVariables(prodEnv.id)!
    expect(prodCached).toHaveLength(2)
    expect(prodCached.find(v => v.key === 'API_KEY')!.value).toBe('aws-prod-key')

    // Activate and resolve variables
    environmentsRepo.activate(prodEnv.id, ws.id)
    const vars = getResolvedVariables(ws.id)
    expect(vars.API_KEY).toBe('aws-prod-key')
    expect(vars.DB_HOST).toBe('rds.prod.internal')

    // Push updated variables
    const newVars = [
      { key: 'API_KEY', value: 'aws-updated-key', enabled: true },
      { key: 'NEW_KEY', value: 'new-value', enabled: true },
    ]
    await vaultSyncService.pushVariables(prodEnv.id, newVars, ws.id)

    expect(fakeProvider.store['production']).toEqual({ API_KEY: 'aws-updated-key', NEW_KEY: 'new-value' })
  })

  it('fetchVariables works with AWS provider', async () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = environmentsRepo.create({ name: 'Dev', workspace_id: ws.id, variables: '[]' })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: 'dev' })

    fakeProvider = createFakeVaultProvider({
      'dev': { TOKEN: 'aws-fetched-token' },
    })
    configureAwsVault(ws.id)

    await vaultSyncService.ensureLoaded(env.id, ws.id)

    const cached = vaultSyncService.getCachedVariables(env.id)!
    expect(cached).toHaveLength(1)
    expect(cached[0].value).toBe('aws-fetched-token')
  })
})
