import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import * as collectionsRepo from '../../src/main/database/repositories/collections'
import * as environmentsRepo from '../../src/main/database/repositories/environments'
import {
  getResolvedVariables,
  getResolvedVariablesWithSource,
  substitute,
  substituteRecord,
} from '../../src/main/services/variable-substitution'
import { setCachedVariables, resetProvider } from '../../src/main/vault/vault-sync-service'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})

afterEach(() => {
  resetProvider()
  closeDatabase()
})

function createEnvWithVars(
  name: string,
  vars: { key: string; value: string; enabled: boolean }[],
  workspaceId?: string,
): ReturnType<typeof environmentsRepo.create> {
  return environmentsRepo.create({
    name,
    workspace_id: workspaceId,
    variables: JSON.stringify(vars),
  })
}

describe('variable substitution', () => {
  it('returns empty when no env or collection', () => {
    const vars = getResolvedVariables()
    expect(vars).toEqual({})
  })

  it('resolves active environment variables', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Production', [
      { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
      { key: 'token', value: 'abc123', enabled: true },
      { key: 'disabled', value: 'nope', enabled: false },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    const vars = getResolvedVariables(ws.id)
    expect(vars.baseUrl).toBe('https://api.example.com')
    expect(vars.token).toBe('abc123')
    expect(vars.disabled).toBeUndefined()
  })

  it('collection variables override environment variables', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Prod', [
      { key: 'baseUrl', value: 'https://prod.example.com', enabled: true },
      { key: 'token', value: 'env-token', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    const col = collectionsRepo.create({ name: 'My API', workspace_id: ws.id })
    collectionsRepo.update(col.id, { variables: JSON.stringify({ baseUrl: 'https://override.example.com' }) })

    const vars = getResolvedVariables(ws.id, col.id)
    expect(vars.baseUrl).toBe('https://override.example.com')
    expect(vars.token).toBe('env-token')
  })

  it('substitutes {{variables}} in text', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Dev', [
      { key: 'host', value: 'localhost:3000', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    const result = substitute('http://{{host}}/api/users', ws.id)
    expect(result).toBe('http://localhost:3000/api/users')
  })

  it('leaves unresolved variables as-is', () => {
    const result = substitute('http://{{host}}/api/{{version}}')
    expect(result).toBe('http://{{host}}/api/{{version}}')
  })

  it('handles nested variable references', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Env', [
      { key: 'protocol', value: 'https', enabled: true },
      { key: 'domain', value: 'api.example.com', enabled: true },
      { key: 'baseUrl', value: '{{protocol}}://{{domain}}', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    const result = substitute('{{baseUrl}}/users', ws.id)
    expect(result).toBe('https://api.example.com/users')
  })

  it('handles deeply nested references up to max depth', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Env', [
      { key: 'a', value: '{{b}}', enabled: true },
      { key: 'b', value: '{{c}}', enabled: true },
      { key: 'c', value: 'final', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    expect(substitute('{{a}}', ws.id)).toBe('final')
  })

  it('substitutes variables in both keys and values of a record', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Env', [
      { key: 'headerName', value: 'X-Custom', enabled: true },
      { key: 'token', value: 'secret', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    const result = substituteRecord(
      { '{{headerName}}': 'Bearer {{token}}' },
      ws.id,
    )
    expect(result).toEqual({ 'X-Custom': 'Bearer secret' })
  })

  it('returns empty string when substituting null/empty', () => {
    expect(substitute('')).toBe('')
  })

  it('getResolvedVariablesWithSource returns source labels', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Staging', [
      { key: 'host', value: 'staging.example.com', enabled: true },
      { key: 'token', value: 'env-tok', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    const col = collectionsRepo.create({ name: 'Col', workspace_id: ws.id })
    collectionsRepo.update(col.id, { variables: JSON.stringify({ token: 'col-tok' }) })

    const resolved = getResolvedVariablesWithSource(ws.id, col.id)
    expect(resolved.host.value).toBe('staging.example.com')
    expect(resolved.host.source).toBe('Env: Staging')
    expect(resolved.token.value).toBe('col-tok')
    expect(resolved.token.source).toBe('Collection')
  })

  it('getResolvedVariablesWithSource resolves nested refs in values', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Env', [
      { key: 'protocol', value: 'https', enabled: true },
      { key: 'baseUrl', value: '{{protocol}}://api.test', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    const resolved = getResolvedVariablesWithSource(ws.id)
    expect(resolved.baseUrl.value).toBe('https://api.test')
    expect(resolved.baseUrl.source).toBe('Env: Env')
  })

  it('handles collection variables stored as EnvironmentVariable[]', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const col = collectionsRepo.create({ name: 'Col', workspace_id: ws.id })
    collectionsRepo.update(col.id, {
      variables: JSON.stringify([
        { key: 'apiKey', value: 'from-array', enabled: true },
        { key: 'disabled', value: 'skip', enabled: false },
      ]),
    })

    const vars = getResolvedVariables(ws.id, col.id)
    expect(vars.apiKey).toBe('from-array')
    expect(vars.disabled).toBeUndefined()
  })
})

describe('vault-synced variable resolution', () => {
  function createVaultSyncedEnv(name: string, workspaceId?: string) {
    const env = environmentsRepo.create({
      name,
      workspace_id: workspaceId,
      variables: '[]', // empty — secrets live in-memory only
    })
    environmentsRepo.update(env.id, { vault_synced: 1, vault_path: name.toLowerCase() })
    return environmentsRepo.findById(env.id)!
  }

  it('getResolvedVariables reads from cache when vault_synced=1', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createVaultSyncedEnv('Production', ws.id)
    environmentsRepo.activate(env.id, ws.id)

    // DB has no variables, but cache does
    setCachedVariables(env.id, [
      { key: 'API_KEY', value: 'vault-secret', enabled: true },
      { key: 'DB_HOST', value: 'db.prod.internal', enabled: true },
    ])

    const vars = getResolvedVariables(ws.id)
    expect(vars.API_KEY).toBe('vault-secret')
    expect(vars.DB_HOST).toBe('db.prod.internal')
  })

  it('getResolvedVariables returns empty for vault env with no cache', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createVaultSyncedEnv('Empty', ws.id)
    environmentsRepo.activate(env.id, ws.id)

    // No cache set
    const vars = getResolvedVariables(ws.id)
    expect(vars).toEqual({})
  })

  it('getResolvedVariables filters disabled cached variables', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createVaultSyncedEnv('Mixed', ws.id)
    environmentsRepo.activate(env.id, ws.id)

    setCachedVariables(env.id, [
      { key: 'enabled_var', value: 'yes', enabled: true },
      { key: 'disabled_var', value: 'no', enabled: false },
    ])

    const vars = getResolvedVariables(ws.id)
    expect(vars.enabled_var).toBe('yes')
    expect(vars.disabled_var).toBeUndefined()
  })

  it('collection variables override vault-cached variables', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createVaultSyncedEnv('Staging', ws.id)
    environmentsRepo.activate(env.id, ws.id)

    setCachedVariables(env.id, [
      { key: 'baseUrl', value: 'https://vault-url.com', enabled: true },
      { key: 'token', value: 'vault-token', enabled: true },
    ])

    const col = collectionsRepo.create({ name: 'Col', workspace_id: ws.id })
    collectionsRepo.update(col.id, { variables: JSON.stringify({ baseUrl: 'https://override.com' }) })

    const vars = getResolvedVariables(ws.id, col.id)
    expect(vars.baseUrl).toBe('https://override.com')
    expect(vars.token).toBe('vault-token')
  })

  it('substitute resolves vault-cached variables in text', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createVaultSyncedEnv('Dev', ws.id)
    environmentsRepo.activate(env.id, ws.id)

    setCachedVariables(env.id, [
      { key: 'host', value: 'api.vault.dev', enabled: true },
    ])

    const result = substitute('https://{{host}}/v1/users', ws.id)
    expect(result).toBe('https://api.vault.dev/v1/users')
  })

  it('getResolvedVariablesWithSource labels vault-cached vars correctly', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createVaultSyncedEnv('Prod Vault', ws.id)
    environmentsRepo.activate(env.id, ws.id)

    setCachedVariables(env.id, [
      { key: 'secret', value: 'vault-value', enabled: true },
    ])

    const resolved = getResolvedVariablesWithSource(ws.id)
    expect(resolved.secret.value).toBe('vault-value')
    expect(resolved.secret.source).toBe('Env: Prod Vault')
  })

  it('getResolvedVariablesWithSource resolves nested refs from vault cache', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createVaultSyncedEnv('Nested', ws.id)
    environmentsRepo.activate(env.id, ws.id)

    setCachedVariables(env.id, [
      { key: 'protocol', value: 'https', enabled: true },
      { key: 'baseUrl', value: '{{protocol}}://api.vault.io', enabled: true },
    ])

    const resolved = getResolvedVariablesWithSource(ws.id)
    expect(resolved.baseUrl.value).toBe('https://api.vault.io')
  })

  it('non-vault env still reads from DB (not cache)', () => {
    const ws = workspacesRepo.create({ name: 'WS' })
    const env = createEnvWithVars('Local', [
      { key: 'db', value: 'local-db', enabled: true },
    ], ws.id)
    environmentsRepo.activate(env.id, ws.id)

    // Even if there's a cache entry, it should not be used for non-vault envs
    setCachedVariables(env.id, [
      { key: 'db', value: 'cache-db', enabled: true },
    ])

    const vars = getResolvedVariables(ws.id)
    expect(vars.db).toBe('local-db')
  })
})
