import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as settingsRepo from '../database/repositories/settings'

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

  ipcMain.handle(IPC.WINDOW_GET_STATE, () => {
    return settingsRepo.getWindowState()
  })

  ipcMain.handle(IPC.WINDOW_SAVE_STATE, (_event, state) => {
    settingsRepo.saveWindowState(state)
  })
}
