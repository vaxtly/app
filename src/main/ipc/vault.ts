import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as vaultService from '../vault/vault-sync-service'
import * as environmentsRepo from '../database/repositories/environments'
import { formatFetchError } from '../services/fetch-error'
import type { EnvironmentVariable } from '../../shared/types/models'

function errorMessage(e: unknown): string {
  return formatFetchError(e)
}

export function registerVaultHandlers(): void {
  ipcMain.handle(IPC.VAULT_TEST_CONNECTION, async (_event, workspaceId?: string) => {
    try {
      const ok = await vaultService.testConnection(workspaceId)
      return { success: ok, message: ok ? 'Connected' : 'Connection failed' }
    } catch (e) {
      return { success: false, message: errorMessage(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_PULL, async (_event, workspaceId?: string) => {
    try {
      const result = await vaultService.pullAll(workspaceId)
      const parts: string[] = []
      if (result.created) parts.push(`created ${result.created}`)
      if (result.refreshed) parts.push(`refreshed ${result.refreshed}`)
      const message = parts.length > 0 ? `Pulled: ${parts.join(', ')} environment(s)` : 'No changes'
      return {
        success: result.errors.length === 0,
        message,
        pulled: result.created,
        errors: result.errors,
      }
    } catch (e) {
      return { success: false, message: errorMessage(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_PUSH, async (_event, environmentId: string, workspaceId?: string) => {
    try {
      const env = environmentsRepo.findById(environmentId)
      if (!env) return { success: false, message: 'Environment not found' }

      // For vault-synced envs, DB variables is '[]' — read from in-memory cache
      const cached = vaultService.getCachedVariables(environmentId)
      const variables: EnvironmentVariable[] = cached ?? (env.variables ? JSON.parse(env.variables) : [])
      await vaultService.pushVariables(environmentId, variables, workspaceId)
      return { success: true, message: 'Pushed to Vault' }
    } catch (e) {
      return { success: false, message: errorMessage(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_PULL_ALL, async (_event, workspaceId?: string) => {
    try {
      const result = await vaultService.pullAll(workspaceId)
      return {
        success: result.errors.length === 0,
        created: result.created,
        refreshed: result.refreshed,
        errors: result.errors,
      }
    } catch (e) {
      return { success: false, created: 0, errors: [errorMessage(e)] }
    }
  })

  ipcMain.handle(IPC.VAULT_FETCH_VARIABLES, async (_event, environmentId: string, workspaceId?: string) => {
    try {
      return await vaultService.fetchVariables(environmentId, workspaceId)
    } catch (e) {
      throw new Error(errorMessage(e))
    }
  })

  ipcMain.handle(IPC.VAULT_PUSH_VARIABLES, async (_event, environmentId: string, variables: EnvironmentVariable[], workspaceId?: string) => {
    try {
      await vaultService.pushVariables(environmentId, variables, workspaceId)
      return { success: true }
    } catch (e) {
      return { success: false, message: errorMessage(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_DELETE_SECRETS, async (_event, environmentId: string, workspaceId?: string) => {
    try {
      await vaultService.deleteSecrets(environmentId, workspaceId)
      return { success: true }
    } catch (e) {
      return { success: false, message: errorMessage(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_MIGRATE, async (_event, environmentId: string, oldPath: string, newPath: string, workspaceId?: string) => {
    // Validate paths don't contain traversal sequences
    if ([oldPath, newPath].some((p) => !p || p.includes('..') || p.startsWith('/'))) {
      return { success: false, message: 'Invalid vault path' }
    }
    try {
      await vaultService.migrateEnvironment(environmentId, oldPath, newPath, workspaceId)
      return { success: true }
    } catch (e) {
      return { success: false, message: errorMessage(e) }
    }
  })
}
