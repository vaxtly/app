import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as vaultService from '../vault/vault-sync-service'
import * as environmentsRepo from '../database/repositories/environments'
import type { EnvironmentVariable } from '../../shared/types/models'

export function registerVaultHandlers(): void {
  ipcMain.handle(IPC.VAULT_TEST_CONNECTION, async () => {
    try {
      const ok = await vaultService.testConnection()
      return { success: ok, message: ok ? 'Connected' : 'Connection failed' }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_PULL, async () => {
    // Legacy pull — same as pull-all
    try {
      const result = await vaultService.pullAll()
      return {
        success: result.errors.length === 0,
        message: `Created ${result.created} environment(s)`,
        pulled: result.created,
        errors: result.errors,
      }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_PUSH, async (_event, environmentId: string) => {
    try {
      const env = environmentsRepo.findById(environmentId)
      if (!env) return { success: false, message: 'Environment not found' }

      const variables: EnvironmentVariable[] = env.variables ? JSON.parse(env.variables) : []
      await vaultService.pushVariables(environmentId, variables)
      return { success: true, message: 'Pushed to Vault' }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_PULL_ALL, async (_event, workspaceId?: string) => {
    try {
      const result = await vaultService.pullAll(workspaceId)
      return {
        success: result.errors.length === 0,
        created: result.created,
        errors: result.errors,
      }
    } catch (e) {
      return { success: false, created: 0, errors: [e instanceof Error ? e.message : String(e)] }
    }
  })

  ipcMain.handle(IPC.VAULT_FETCH_VARIABLES, async (_event, environmentId: string) => {
    try {
      return await vaultService.fetchVariables(environmentId)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipcMain.handle(IPC.VAULT_PUSH_VARIABLES, async (_event, environmentId: string, variables: EnvironmentVariable[]) => {
    try {
      await vaultService.pushVariables(environmentId, variables)
      return { success: true }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_DELETE_SECRETS, async (_event, environmentId: string) => {
    try {
      await vaultService.deleteSecrets(environmentId)
      return { success: true }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC.VAULT_MIGRATE, async (_event, environmentId: string, oldPath: string, newPath: string) => {
    try {
      await vaultService.migrateEnvironment(environmentId, oldPath, newPath)
      return { success: true }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
}
