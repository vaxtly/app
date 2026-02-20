import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import * as requestsRepo from '../database/repositories/requests'
import * as collectionsRepo from '../database/repositories/collections'

export function registerRequestHandlers(): void {
  ipcMain.handle(IPC.REQUESTS_LIST, (_event, collectionId: string) => {
    return requestsRepo.findByCollection(collectionId)
  })

  ipcMain.handle(IPC.REQUESTS_GET, (_event, id: string) => {
    return requestsRepo.findById(id)
  })

  ipcMain.handle(IPC.REQUESTS_CREATE, (_event, data: { collection_id: string; name: string; folder_id?: string; method?: string; url?: string; body_type?: string }) => {
    const result = requestsRepo.create(data)
    collectionsRepo.markDirty(data.collection_id)
    return result
  })

  ipcMain.handle(IPC.REQUESTS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    const existing = requestsRepo.findById(id)
    if (!existing) return null

    // Skip update + markDirty when nothing actually changed
    const changed = Object.keys(data).some(
      (key) => JSON.stringify((existing as Record<string, unknown>)[key]) !== JSON.stringify(data[key])
    )
    if (!changed) return existing

    const result = requestsRepo.update(id, data)
    if (result) collectionsRepo.markDirty(result.collection_id)
    return result
  })

  ipcMain.handle(IPC.REQUESTS_DELETE, (_event, id: string) => {
    const existing = requestsRepo.findById(id)
    const deleted = requestsRepo.remove(id)
    if (deleted && existing) collectionsRepo.markDirty(existing.collection_id)
    return deleted
  })

  ipcMain.handle(IPC.REQUESTS_MOVE, (_event, id: string, targetFolderId: string | null, targetCollectionId?: string) => {
    const before = requestsRepo.findById(id)
    const result = requestsRepo.move(id, targetFolderId, targetCollectionId)
    if (result) {
      collectionsRepo.markDirty(result.collection_id)
      // Also mark source collection dirty if request moved between collections
      if (before && before.collection_id !== result.collection_id) {
        collectionsRepo.markDirty(before.collection_id)
      }
    }
    return result
  })

  ipcMain.handle(IPC.REQUESTS_REORDER, (_event, ids: string[]) => {
    requestsRepo.reorder(ids)
    // Mark the collection dirty for the first request in the list
    if (ids.length > 0) {
      const req = requestsRepo.findById(ids[0])
      if (req) collectionsRepo.markDirty(req.collection_id)
    }
  })
}
