/**
 * Vault sync service — manages environment variable synchronization with HashiCorp Vault.
 * Reads config from app_settings, creates provider instances, handles fetch/push/pullAll/migrate.
 */

import type { SecretsProvider } from './secrets-provider.interface'
import { HashiCorpVaultProvider } from './hashicorp-vault-provider'
import * as settingsRepo from '../database/repositories/settings'
import * as workspacesRepo from '../database/repositories/workspaces'
import * as environmentsRepo from '../database/repositories/environments'
import type { EnvironmentVariable } from '../../shared/types/models'
import { logVault } from '../services/session-log'

// In-memory cache: environmentId → { data, expiresAt }
const secretsCache = new Map<string, { data: EnvironmentVariable[]; expiresAt: number }>()
const CACHE_TTL_MS = 60_000 // 60 seconds

// Provider cache keyed by workspaceId (or '__global__' for no workspace)
const providerCache = new Map<string, SecretsProvider>()

function getVaultSetting(key: string, workspaceId?: string): string | undefined {
  if (workspaceId) {
    const wsValue = workspacesRepo.getWorkspaceSetting(workspaceId, key)
    if (wsValue !== undefined) return wsValue
  }
  return settingsRepo.getSetting(key)
}

export async function getProvider(workspaceId?: string): Promise<SecretsProvider | null> {
  const cacheKey = workspaceId ?? '__global__'
  const cached = providerCache.get(cacheKey)
  if (cached) return cached

  const providerType = getVaultSetting('vault.provider', workspaceId)
  const url = getVaultSetting('vault.url', workspaceId)
  const authMethod = (getVaultSetting('vault.auth_method', workspaceId) ?? 'token') as 'token' | 'approle'
  const token = getVaultSetting('vault.token', workspaceId) ?? ''
  const roleId = getVaultSetting('vault.role_id', workspaceId)
  const secretId = getVaultSetting('vault.secret_id', workspaceId)
  const namespace = getVaultSetting('vault.namespace', workspaceId)
  const mount = getVaultSetting('vault.mount', workspaceId) ?? 'secret'
  const verifySslRaw = getVaultSetting('vault.verify_ssl', workspaceId)
  const verifySsl = verifySslRaw !== '0' && verifySslRaw !== 'false'

  if (!providerType || !url) return null
  if (authMethod === 'token' && !token) return null
  if (authMethod === 'approle' && (!roleId || !secretId)) return null

  if (providerType === 'hashicorp') {
    const provider = await HashiCorpVaultProvider.create({
      url: url.replace(/\/+$/, ''),
      token,
      namespace: namespace || null,
      mount,
      authMethod,
      roleId: roleId ?? undefined,
      secretId: secretId ?? undefined,
      verifySsl,
    })
    providerCache.set(cacheKey, provider)
    return provider
  }

  return null
}

/** Reset cached provider (call when settings change). */
export function resetProvider(workspaceId?: string): void {
  if (workspaceId) {
    providerCache.delete(workspaceId)
  } else {
    providerCache.clear()
  }
  secretsCache.clear()
}

export function isConfigured(workspaceId?: string): boolean {
  const providerType = getVaultSetting('vault.provider', workspaceId)
  const url = getVaultSetting('vault.url', workspaceId)
  return !!providerType && !!url
}

export async function testConnection(workspaceId?: string): Promise<boolean> {
  // Force fresh provider for connection test
  const cacheKey = workspaceId ?? '__global__'
  providerCache.delete(cacheKey)
  const provider = await getProvider(workspaceId)
  if (!provider) return false
  return provider.testConnection()
}

/**
 * Build the Vault path for an environment.
 * Uses vault_path if set, otherwise slugifies the name.
 */
export function buildPath(env: { name: string; vault_path: string | null }): string {
  if (env.vault_path) return env.vault_path
  return env.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Fetch variables from Vault for an environment.
 */
export async function fetchVariables(environmentId: string, workspaceId?: string): Promise<EnvironmentVariable[]> {
  // Check cache
  const cached = secretsCache.get(environmentId)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  const provider = await getProvider(workspaceId)
  if (!provider) throw new Error('Vault not configured')

  const env = environmentsRepo.findById(environmentId)
  if (!env) throw new Error(`Environment ${environmentId} not found`)

  const path = buildPath(env)
  const secrets = await provider.getSecrets(path)

  if (secrets === null) {
    const result: EnvironmentVariable[] = []
    secretsCache.set(environmentId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  }

  const variables: EnvironmentVariable[] = Object.entries(secrets).map(([key, value]) => ({
    key,
    value: String(value),
    enabled: true,
  }))

  secretsCache.set(environmentId, { data: variables, expiresAt: Date.now() + CACHE_TTL_MS })
  return variables
}

/**
 * Push variables to Vault for an environment.
 */
export async function pushVariables(environmentId: string, variables: EnvironmentVariable[], workspaceId?: string): Promise<void> {
  const provider = await getProvider(workspaceId)
  if (!provider) throw new Error('Vault not configured')

  const env = environmentsRepo.findById(environmentId)
  if (!env) throw new Error(`Environment ${environmentId} not found`)

  const data: Record<string, string> = {}
  for (const v of variables) {
    if (v.key && v.enabled !== false) {
      data[v.key] = v.value ?? ''
    }
  }

  const path = buildPath(env)
  await provider.putSecrets(path, data)
  clearCache(environmentId)
}

/**
 * Delete secrets from Vault for an environment.
 */
export async function deleteSecrets(environmentId: string, workspaceId?: string): Promise<void> {
  const provider = await getProvider(workspaceId)
  if (!provider) return

  const env = environmentsRepo.findById(environmentId)
  if (!env) return

  try {
    const path = buildPath(env)
    await provider.deleteSecrets(path)
  } catch (e) {
    logVault('delete', environmentId, `Failed: ${e instanceof Error ? e.message : String(e)}`, false)
  }

  clearCache(environmentId)
}

/**
 * Pull all secrets from Vault and create environment records for untracked paths.
 */
export async function pullAll(workspaceId?: string): Promise<{ created: number; errors: string[] }> {
  const result = { created: 0, errors: [] as string[] }

  const provider = await getProvider(workspaceId)
  if (!provider) {
    result.errors.push('Vault not configured')
    return result
  }

  let secretNames: string[]
  try {
    secretNames = await provider.listSecrets()
  } catch (e) {
    result.errors.push(`Failed to list secrets: ${e instanceof Error ? e.message : String(e)}`)
    return result
  }

  // Get existing vault-synced environments
  const allEnvs = workspaceId
    ? environmentsRepo.findByWorkspace(workspaceId)
    : environmentsRepo.findAll()

  const existingPaths = new Map<string, boolean>()
  for (const env of allEnvs) {
    if (env.vault_synced) {
      existingPaths.set(buildPath(env), true)
    }
  }

  for (const rawName of secretNames) {
    const name = rawName.replace(/\/+$/, '')
    if (existingPaths.has(name)) continue

    try {
      // Create a friendly name from the slug
      const friendlyName = name
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

      environmentsRepo.create({
        name: friendlyName,
        workspace_id: workspaceId,
        variables: '[]',
      })

      // Update the newly created environment with vault settings
      const created = environmentsRepo.findAll().find((e) => e.name === friendlyName)
      if (created) {
        environmentsRepo.update(created.id, {
          vault_synced: 1,
          vault_path: name,
        })
      }

      result.created++
    } catch (e) {
      result.errors.push(`Failed to create environment for '${name}': ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return result
}

/**
 * Migrate secrets when an environment is renamed — copies from old path to new, deletes old.
 */
export async function migrateEnvironment(
  environmentId: string,
  oldPath: string,
  newPath: string,
  workspaceId?: string,
): Promise<void> {
  if (oldPath === newPath) return

  const provider = await getProvider(workspaceId)
  if (!provider) return

  const secrets = await provider.getSecrets(oldPath)
  if (secrets !== null) {
    await provider.putSecrets(newPath, secrets)
    await provider.deleteSecrets(oldPath)
  }

  clearCache(environmentId)
}

export function clearCache(environmentId: string): void {
  secretsCache.delete(environmentId)
}

