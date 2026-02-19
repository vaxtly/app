import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as settingsRepo from '../database/repositories/settings'
import * as workspacesRepo from '../database/repositories/workspaces'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (_event, key: string) => {
    return settingsRepo.getSetting(key)
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_event, key: string, value: string) => {
    settingsRepo.setSetting(key, value)
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
