import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as settingsRepo from '../database/repositories/settings'
import * as workspacesRepo from '../database/repositories/workspaces'
import { resetProvider as resetVaultProvider } from '../vault/vault-sync-service'

/** Keys that affect sync/vault provider configuration */
const PROVIDER_KEYS = new Set([
  'sync.provider', 'sync.repository', 'sync.token', 'sync.branch',
  'vault.provider', 'vault.url', 'vault.token', 'vault.auth_method',
  'vault.role_id', 'vault.secret_id', 'vault.namespace', 'vault.mount', 'vault.verify_ssl',
])

function invalidateCachesIfNeeded(key: string, workspaceId?: string): void {
  if (PROVIDER_KEYS.has(key)) {
    if (key.startsWith('vault.')) {
      resetVaultProvider(workspaceId)
    }
    // GitProvider is not cached (created fresh per call), so no sync cache to invalidate
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (_event, key: string) => {
    return settingsRepo.getSetting(key)
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_event, key: string, value: string) => {
    settingsRepo.setSetting(key, value)
    invalidateCachesIfNeeded(key)
  })

  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => {
    return settingsRepo.getAllSettings()
  })

  // Workspace-scoped settings
  ipcMain.handle(IPC.WORKSPACE_SETTINGS_GET, (_event, workspaceId: string, key: string) => {
    return workspacesRepo.getWorkspaceSetting(workspaceId, key)
  })

  ipcMain.handle(IPC.WORKSPACE_SETTINGS_SET, (_event, workspaceId: string, key: string, value: string) => {
    workspacesRepo.setWorkspaceSetting(workspaceId, key, value)
    invalidateCachesIfNeeded(key, workspaceId)
  })

  ipcMain.handle(IPC.WORKSPACE_SETTINGS_GET_ALL, (_event, workspaceId: string) => {
    return workspacesRepo.getWorkspaceSettings(workspaceId)
  })

  ipcMain.handle(IPC.WINDOW_GET_STATE, () => {
    return settingsRepo.getWindowState()
  })

  ipcMain.handle(IPC.WINDOW_SAVE_STATE, (_event, state) => {
    settingsRepo.saveWindowState(state)
  })
}
