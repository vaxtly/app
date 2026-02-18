import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as collectionsRepo from '../database/repositories/collections'

export function registerCollectionHandlers(): void {
  ipcMain.handle(IPC.COLLECTIONS_LIST, (_event, workspaceId?: string) => {
    return workspaceId ? collectionsRepo.findByWorkspace(workspaceId) : collectionsRepo.findAll()
  })

  ipcMain.handle(IPC.COLLECTIONS_GET, (_event, id: string) => {
    return collectionsRepo.findById(id)
  })

  ipcMain.handle(IPC.COLLECTIONS_CREATE, (_event, data: { name: string; workspace_id?: string; description?: string }) => {
    return collectionsRepo.create(data)
  })

  ipcMain.handle(IPC.COLLECTIONS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    return collectionsRepo.update(id, data)
  })

  ipcMain.handle(IPC.COLLECTIONS_DELETE, (_event, id: string) => {
    return collectionsRepo.remove(id)
  })

  ipcMain.handle(IPC.COLLECTIONS_REORDER, (_event, ids: string[]) => {
    collectionsRepo.reorder(ids)
  })
}
