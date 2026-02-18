import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as historiesRepo from '../database/repositories/request-histories'

export function registerHistoryHandlers(): void {
  ipcMain.handle(IPC.HISTORIES_LIST, (_event, requestId: string) => {
    return historiesRepo.findByRequest(requestId)
  })

  ipcMain.handle(IPC.HISTORIES_GET, (_event, id: string) => {
    return historiesRepo.findById(id)
  })

  ipcMain.handle(IPC.HISTORIES_DELETE, (_event, id: string) => {
    return historiesRepo.remove(id)
  })

  ipcMain.handle(IPC.HISTORIES_PRUNE, (_event, retentionDays: number) => {
    return historiesRepo.prune(retentionDays)
  })
}
