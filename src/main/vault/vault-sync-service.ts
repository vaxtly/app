/**
 * Vault sync service — manages environment variable synchronization with HashiCorp Vault.
 * Reads config from app_settings, creates provider instances, handles fetch/push/pullAll/migrate.
 *
 * Secrets are held in-memory only — never persisted to the local SQLite DB.
 * The DB stores vault metadata (vault_synced, vault_path, name) but variables = '[]'.
 */

import type { SecretsProvider } from './secrets-provider.interface'
import { HashiCorpVaultProvider } from './hashicorp-vault-provider'
import { AwsSecretsManagerProvider } from './aws-secrets-manager-provider'
import * as settingsRepo from '../database/repositories/settings'
import * as workspacesRepo from '../database/repositories/workspaces'
import * as environmentsRepo from '../database/repositories/environments'
import type { EnvironmentVariable } from '../../shared/types/models'
import { logVault } from '../services/session-log'

// In-memory cache: environmentId → variables (session-lifetime, no TTL)
const secretsCache = new Map<string, EnvironmentVariable[]>()

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
  if (!providerType) return null

  let provider: SecretsProvider | null = null

  if (providerType === 'hashicorp') {
    const url = getVaultSetting('vault.url', workspaceId)
    if (!url) return null
    const authMethod = (getVaultSetting('vault.auth_method', workspaceId) ?? 'token') as 'token' | 'approle'
    const token = getVaultSetting('vault.token', workspaceId) ?? ''
    const roleId = getVaultSetting('vault.role_id', workspaceId)
    const secretId = getVaultSetting('vault.secret_id', workspaceId)
    const namespace = getVaultSetting('vault.namespace', workspaceId)
    const mount = getVaultSetting('vault.mount', workspaceId) ?? 'secret'
    const verifySslRaw = getVaultSetting('vault.verify_ssl', workspaceId)
    const verifySsl = verifySslRaw !== '0' && verifySslRaw !== 'false'

    if (authMethod === 'token' && !token) return null
    if (authMethod === 'approle' && (!roleId || !secretId)) return null

    provider = await HashiCorpVaultProvider.create({
      url: url.replace(/\/+$/, ''),
      token,
      namespace: namespace || null,
      mount,
      authMethod,
      roleId: roleId ?? undefined,
      secretId: secretId ?? undefined,
      verifySsl,
    })
  } else if (providerType === 'aws') {
    const region = getVaultSetting('vault.aws_region', workspaceId)
    if (!region) return null

    const authMethod = getVaultSetting('vault.aws_auth_method', workspaceId) as 'keys' | 'profile' | 'default' | undefined
    if (!authMethod) return null

    const accessKeyId = getVaultSetting('vault.aws_access_key_id', workspaceId)
    const secretAccessKey = getVaultSetting('vault.aws_secret_access_key', workspaceId)
    const profile = getVaultSetting('vault.aws_profile', workspaceId)

    // Validate required fields per auth method
    if (authMethod === 'keys' && (!accessKeyId || !secretAccessKey)) return null
    if (authMethod === 'profile' && !profile) return null

    provider = await AwsSecretsManagerProvider.create({
      region,
      authMethod,
      accessKeyId: accessKeyId || undefined,
      secretAccessKey: secretAccessKey || undefined,
      profile: profile || undefined,
    })
  }

  if (provider) {
    providerCache.set(cacheKey, provider)
  }

  return provider
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
  if (!providerType) return false

  if (providerType === 'hashicorp') {
    return !!getVaultSetting('vault.url', workspaceId)
  }
  if (providerType === 'aws') {
    const region = getVaultSetting('vault.aws_region', workspaceId)
    const authMethod = getVaultSetting('vault.aws_auth_method', workspaceId)
    return !!region && !!authMethod
  }

  return false
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

/** Read cached variables for an environment. Returns null if not cached. */
export function getCachedVariables(environmentId: string): EnvironmentVariable[] | null {
  return secretsCache.get(environmentId) ?? null
}

/** Set cached variables for an environment (e.g. after script-execution mirror). */
export function setCachedVariables(environmentId: string, variables: EnvironmentVariable[]): void {
  secretsCache.set(environmentId, variables)
}

/**
 * Ensure variables are loaded in the in-memory cache.
 * Fetches from Vault if not already cached.
 */
export async function ensureLoaded(environmentId: string, workspaceId?: string): Promise<void> {
  if (secretsCache.has(environmentId)) return
  await fetchVariables(environmentId, workspaceId)
}

/**
 * Fetch variables from Vault for an environment.
 * Populates in-memory cache only — never writes to the DB.
 */
export async function fetchVariables(environmentId: string, workspaceId?: string): Promise<EnvironmentVariable[]> {
  // Check cache (session-lifetime, no TTL)
  const cached = secretsCache.get(environmentId)
  if (cached) return cached

  const provider = await getProvider(workspaceId)
  if (!provider) throw new Error('Vault not configured')

  const env = environmentsRepo.findById(environmentId)
  if (!env) throw new Error(`Environment ${environmentId} not found`)

  const path = buildPath(env)
  const secrets = await provider.getSecrets(path)

  if (secrets === null) {
    const result: EnvironmentVariable[] = []
    secretsCache.set(environmentId, result)
    return result
  }

  const variables: EnvironmentVariable[] = Object.entries(secrets).map(([key, value]) => ({
    key,
    value: String(value),
    enabled: true,
  }))

  secretsCache.set(environmentId, variables)
  return variables
}

/**
 * Push variables to Vault for an environment.
 * Updates the in-memory cache with the pushed values.
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

  // Update cache with pushed values
  secretsCache.set(environmentId, variables)

  // Ensure DB variables are cleared — secrets live in-memory only for vault-synced envs
  if (env.vault_synced === 1 && env.variables !== '[]') {
    environmentsRepo.update(environmentId, { variables: '[]' })
  }
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
 * Pull all secrets from Vault — refreshes in-memory cache for existing environments
 * and creates new environment records (with empty variables) for untracked paths.
 * Secrets are only held in-memory, never written to DB.
 */
export async function pullAll(workspaceId?: string): Promise<{ created: number; refreshed: number; errors: string[] }> {
  const result = { created: 0, refreshed: 0, errors: [] as string[] }

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

  logVault('pull-all', '/', `Found ${secretNames.length} secret(s) in Vault`)

  // Get existing vault-synced environments
  const allEnvs = workspaceId
    ? environmentsRepo.findByWorkspace(workspaceId)
    : environmentsRepo.findAll()

  const existingPaths = new Map<string, string>()
  for (const env of allEnvs) {
    if (env.vault_synced) {
      existingPaths.set(buildPath(env), env.id)
    }
  }

  logVault('pull-all', '/', `${existingPaths.size} existing vault-synced env(s), ${secretNames.length - existingPaths.size} new`)

  for (const rawName of secretNames) {
    const name = rawName.replace(/\/+$/, '')
    const existingId = existingPaths.get(name)

    // Refresh in-memory cache for existing vault-synced environments
    if (existingId) {
      try {
        const secrets = await provider.getSecrets(name)
        if (secrets && Object.keys(secrets).length > 0) {
          const vars: EnvironmentVariable[] = Object.entries(secrets).map(([key, value]) => ({
            key,
            value: String(value),
            enabled: true,
          }))
          secretsCache.set(existingId, vars)
          result.refreshed++
          logVault('pull-all', name, `Refreshed ${vars.length} variable(s) (in-memory)`)
        }
      } catch (e) {
        logVault('pull-all', name, `Failed to refresh variables: ${e instanceof Error ? e.message : String(e)}`, false)
      }
      continue
    }

    try {
      // Create a friendly name from the slug
      const friendlyName = name
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

      // Fetch secrets from Vault into in-memory cache
      let vars: EnvironmentVariable[] = []
      try {
        const secrets = await provider.getSecrets(name)
        if (secrets) {
          vars = Object.entries(secrets).map(([key, value]) => ({
            key,
            value: String(value),
            enabled: true,
          }))
        }
      } catch (e) {
        logVault('pull-all', name, `Created environment but failed to fetch variables: ${e instanceof Error ? e.message : String(e)}`, false)
      }

      // Create DB record with empty variables — secrets stay in-memory only
      const created = environmentsRepo.create({
        name: friendlyName,
        workspace_id: workspaceId,
        variables: '[]',
      })

      // Update the newly created environment with vault settings
      environmentsRepo.update(created.id, {
        vault_synced: 1,
        vault_path: name,
      })

      // Cache secrets in memory
      if (vars.length > 0) {
        secretsCache.set(created.id, vars)
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
