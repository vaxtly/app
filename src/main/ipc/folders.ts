import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as foldersRepo from '../database/repositories/folders'

export function registerFolderHandlers(): void {
  ipcMain.handle(IPC.FOLDERS_LIST, (_event, collectionId: string) => {
    return foldersRepo.findByCollection(collectionId)
  })

  ipcMain.handle(IPC.FOLDERS_GET, (_event, id: string) => {
    return foldersRepo.findById(id)
  })

  ipcMain.handle(IPC.FOLDERS_CREATE, (_event, data: { collection_id: string; name: string; parent_id?: string }) => {
    return foldersRepo.create(data)
  })

  ipcMain.handle(IPC.FOLDERS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    return foldersRepo.update(id, data)
  })

  ipcMain.handle(IPC.FOLDERS_DELETE, (_event, id: string) => {
    return foldersRepo.remove(id)
  })

  ipcMain.handle(IPC.FOLDERS_REORDER, (_event, ids: string[]) => {
    foldersRepo.reorder(ids)
  })
}
