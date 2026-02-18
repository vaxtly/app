import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as environmentsRepo from '../database/repositories/environments'

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

  ipcMain.handle(IPC.ENVIRONMENTS_ACTIVATE, (_event, id: string, workspaceId?: string) => {
    environmentsRepo.activate(id, workspaceId)
  })

  ipcMain.handle(IPC.ENVIRONMENTS_DEACTIVATE, (_event, id: string) => {
    environmentsRepo.deactivate(id)
  })
}
