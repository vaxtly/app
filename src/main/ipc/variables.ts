import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { getResolvedVariables, getResolvedVariablesWithSource } from '../services/variable-substitution'
import * as environmentsRepo from '../database/repositories/environments'
import { ensureLoaded } from '../vault/vault-sync-service'

async function ensureVaultCachePopulated(workspaceId?: string): Promise<void> {
  const activeEnv = environmentsRepo.findActive(workspaceId)
  if (activeEnv?.vault_synced === 1) {
    try {
      await ensureLoaded(activeEnv.id, workspaceId)
    } catch { /* vault unreachable — highlighting will show vars as missing */ }
  }
}

export function registerVariableHandlers(): void {
  ipcMain.handle(
    IPC.VARIABLES_RESOLVE,
    async (_event, workspaceId?: string, collectionId?: string) => {
      await ensureVaultCachePopulated(workspaceId)
      return getResolvedVariables(workspaceId, collectionId)
    },
  )

  ipcMain.handle(
    IPC.VARIABLES_RESOLVE_WITH_SOURCE,
    async (_event, workspaceId?: string, collectionId?: string) => {
      await ensureVaultCachePopulated(workspaceId)
      return getResolvedVariablesWithSource(workspaceId, collectionId)
    },
  )
}
