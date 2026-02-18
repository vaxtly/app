import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import { getLogs, clearLogs } from '../services/session-log'

export function registerSessionLogHandlers(): void {
  ipcMain.handle(IPC.LOG_LIST, () => {
    return getLogs()
  })

  ipcMain.handle(IPC.LOG_CLEAR, () => {
    clearLogs()
  })
}
