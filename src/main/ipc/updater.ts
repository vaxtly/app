import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { checkForUpdates, quitAndInstall, getInstallSource } from '../services/updater'

export function registerUpdaterHandlers(): void {
  ipcMain.handle(IPC.UPDATE_CHECK, () => {
    checkForUpdates()
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    quitAndInstall()
  })

  ipcMain.handle(IPC.UPDATE_INSTALL_SOURCE, () => {
    return getInstallSource()
  })
}
