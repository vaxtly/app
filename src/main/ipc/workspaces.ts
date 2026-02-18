import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as workspacesRepo from '../database/repositories/workspaces'

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(IPC.WORKSPACES_LIST, () => {
    return workspacesRepo.findAll()
  })

  ipcMain.handle(IPC.WORKSPACES_CREATE, (_event, data: { name: string; description?: string }) => {
    return workspacesRepo.create(data)
  })

  ipcMain.handle(IPC.WORKSPACES_UPDATE, (_event, id: string, data: { name?: string; description?: string; settings?: string; order?: number }) => {
    return workspacesRepo.update(id, data)
  })

  ipcMain.handle(IPC.WORKSPACES_DELETE, (_event, id: string) => {
    return workspacesRepo.remove(id)
  })
}
