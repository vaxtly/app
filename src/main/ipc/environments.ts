import { ipcMain, dialog } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { IPC } from '../../shared/types/ipc'
import * as environmentsRepo from '../database/repositories/environments'
import { ensureLoadedChain } from '../vault/vault-sync-service'
import { logVault } from '../services/session-log'
import { parseDotenv } from '../services/dotenv-parser'

export function registerEnvironmentHandlers(): void {
  ipcMain.handle(IPC.ENVIRONMENTS_LIST, (_event, workspaceId?: string) => {
    return workspaceId ? environmentsRepo.findByWorkspace(workspaceId) : environmentsRepo.findAll()
  })

  ipcMain.handle(IPC.ENVIRONMENTS_GET, (_event, id: string) => {
    return environmentsRepo.findById(id)
  })

  ipcMain.handle(IPC.ENVIRONMENTS_CREATE, (_event, data: { name: string; workspace_id?: string; variables?: string }) => {
    return environmentsRepo.create(data)
  })

  ipcMain.handle(IPC.ENVIRONMENTS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    return environmentsRepo.update(id, data)
  })

  ipcMain.handle(IPC.ENVIRONMENTS_DELETE, (_event, id: string) => {
    return environmentsRepo.remove(id)
  })

  ipcMain.handle(IPC.ENVIRONMENTS_REORDER, (_event, ids: string[]) => {
    environmentsRepo.reorder(ids)
  })

  ipcMain.handle(IPC.ENVIRONMENTS_ACTIVATE, async (_event, id: string, workspaceId?: string) => {
    environmentsRepo.activate(id, workspaceId)

    // Pre-fetch vault secrets across the parent chain so resolution sees both
    // the child's own secrets and any inherited ones.
    const chain = environmentsRepo.findChain(id)
    const hasVaultInChain = chain.some((e) => e.vault_synced === 1)
    if (!hasVaultInChain) return

    const { failures } = await ensureLoadedChain(id, workspaceId)
    for (const env of chain) {
      if (env.vault_synced !== 1) continue
      const failure = failures.find((f) => f.envId === env.id)
      if (failure) {
        logVault('fetch', env.name, `Failed to load secrets: ${failure.reason}`, false)
      } else {
        logVault('fetch', env.name, 'Loaded secrets from Vault')
      }
    }
    return { vaultFailed: failures.length > 0, failures }
  })

  ipcMain.handle(IPC.ENVIRONMENTS_DEACTIVATE, (_event, id: string) => {
    environmentsRepo.deactivate(id)
  })

  ipcMain.handle(IPC.ENVIRONMENTS_IMPORT_DOTENV, async (_event, workspaceId?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Environment Files', extensions: ['env'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf-8')
    const variables = parseDotenv(content)

    // Derive environment name from filename (e.g. ".env.production" → "production", ".env" → "dotenv")
    const fileName = basename(filePath)
    const name = fileName.startsWith('.env.')
      ? fileName.slice(5)
      : fileName === '.env'
        ? 'dotenv'
        : fileName.replace(/\.env$/, '') || fileName

    return environmentsRepo.create({
      name,
      workspace_id: workspaceId,
      variables: JSON.stringify(variables),
    })
  })
}
