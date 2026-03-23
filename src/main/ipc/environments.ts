import { ipcMain, dialog } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { IPC } from '../../shared/types/ipc'
import * as environmentsRepo from '../database/repositories/environments'
import { ensureLoaded } from '../vault/vault-sync-service'
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

    // Pre-fetch vault secrets so they're cached before the first request
    const env = environmentsRepo.findById(id)
    if (env?.vault_synced === 1) {
      try {
        await ensureLoaded(id, workspaceId)
        logVault('fetch', env.name, `Loaded secrets from Vault`)
        return { vaultFailed: false }
      } catch (e) {
        logVault('fetch', env.name, `Failed to load secrets: ${e instanceof Error ? e.message : String(e)}`, false)
        return { vaultFailed: true }
      }
    }
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
