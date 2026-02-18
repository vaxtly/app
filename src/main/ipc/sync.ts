import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import type { SyncResult } from '../../shared/types/sync'
import type { SensitiveFinding } from '../services/sensitive-data-scanner'
import * as syncService from '../sync/remote-sync-service'
import * as collectionsRepo from '../database/repositories/collections'
import { scanCollection } from '../services/sensitive-data-scanner'
import { getDatabase } from '../database/connection'
import type { Request, KeyValueEntry } from '../../shared/types/models'

export function registerSyncHandlers(): void {
  ipcMain.handle(IPC.SYNC_TEST_CONNECTION, async (): Promise<boolean> => {
    return syncService.testConnection()
  })

  ipcMain.handle(IPC.SYNC_PULL, async (_event, workspaceId?: string): Promise<SyncResult> => {
    return syncService.pull(workspaceId)
  })

  ipcMain.handle(
    IPC.SYNC_PUSH_COLLECTION,
    async (_event, collectionId: string, sanitize?: boolean): Promise<SyncResult> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      try {
        await syncService.pushCollection(collection, sanitize ?? false)
        return { success: true, message: 'Pushed successfully', pulled: 0, pushed: 1 }
      } catch (e) {
        if (e instanceof syncService.SyncConflictError) {
          return {
            success: false,
            message: 'Conflict detected',
            pulled: 0,
            pushed: 0,
            conflicts: [{
              collectionId: collection.id,
              collectionName: collection.name,
              localUpdatedAt: collection.updated_at,
            }],
          }
        }
        return { success: false, message: (e as Error).message, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(IPC.SYNC_PUSH_ALL, async (_event, workspaceId?: string): Promise<SyncResult> => {
    return syncService.pushAll(workspaceId)
  })

  ipcMain.handle(
    IPC.SYNC_RESOLVE_CONFLICT,
    async (_event, collectionId: string, resolution: 'keep-local' | 'keep-remote', workspaceId?: string): Promise<SyncResult> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      try {
        if (resolution === 'keep-local') {
          await syncService.forceKeepLocal(collection)
        } else {
          await syncService.forceKeepRemote(collection, workspaceId)
        }
        return { success: true, message: `Conflict resolved (${resolution})`, pulled: 0, pushed: 0 }
      } catch (e) {
        return { success: false, message: (e as Error).message, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(
    IPC.SYNC_DELETE_REMOTE,
    async (_event, collectionId: string): Promise<SyncResult> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      try {
        await syncService.deleteRemoteCollection(collection)
        return { success: true, message: 'Deleted from remote', pulled: 0, pushed: 0 }
      } catch (e) {
        return { success: false, message: (e as Error).message, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(
    IPC.SYNC_SCAN_SENSITIVE,
    async (_event, collectionId: string): Promise<SensitiveFinding[]> => {
      const db = getDatabase()
      const requests = db
        .prepare('SELECT * FROM requests WHERE collection_id = ?')
        .all(collectionId) as Request[]

      const collection = collectionsRepo.findById(collectionId)
      if (!collection) return []

      // Parse requests for scanning
      const parsedRequests = requests.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        headers: r.headers ? JSON.parse(r.headers) : [],
        query_params: r.query_params ? JSON.parse(r.query_params) : [],
        body: r.body,
        body_type: r.body_type,
        auth: r.auth ? JSON.parse(r.auth) : null,
      }))

      const variables: KeyValueEntry[] = collection.variables ? JSON.parse(collection.variables) : []

      return scanCollection(parsedRequests, variables)
    },
  )

  ipcMain.handle(
    IPC.SYNC_PUSH_REQUEST,
    async (_event, collectionId: string, requestId: string, sanitize?: boolean): Promise<boolean> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) return false

      return syncService.pushSingleRequest(collection, requestId, sanitize ?? false)
    },
  )
}
