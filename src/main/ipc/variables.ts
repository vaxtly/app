import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { getResolvedVariables, getResolvedVariablesWithSource } from '../services/variable-substitution'
import * as environmentsRepo from '../database/repositories/environments'
import { ensureLoadedChain } from '../vault/vault-sync-service'

async function ensureVaultCachePopulated(workspaceId?: string): Promise<void> {
  const activeEnv = environmentsRepo.findActive(workspaceId)
  if (!activeEnv) return
  // Prime every vault-synced env in the chain so resolved-with-source data
  // includes inherited parent secrets, not just the active env's own.
  await ensureLoadedChain(activeEnv.id, workspaceId)
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
