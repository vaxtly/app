import { ipcMain } from 'electron'
import { IPC } from '../../shared/types/ipc'
import type { SyncResult } from '../../shared/types/sync'
import type { SensitiveFinding } from '../services/sensitive-data-scanner'
import * as syncService from '../sync/remote-sync-service'
import * as collectionsRepo from '../database/repositories/collections'
import * as foldersRepo from '../database/repositories/folders'
import * as requestsRepo from '../database/repositories/requests'
import * as mcpServersRepo from '../database/repositories/mcp-servers'
import { scanCollection, scanMcpServer } from '../services/sensitive-data-scanner'
import { logSync } from '../services/session-log'
import type { KeyValueEntry } from '../../shared/types/models'

export function registerSyncHandlers(): void {
  ipcMain.handle(IPC.SYNC_TEST_CONNECTION, async (_event, workspaceId?: string): Promise<boolean> => {
    return syncService.testConnection(workspaceId)
  })

  ipcMain.handle(IPC.SYNC_PULL, async (event, workspaceId?: string): Promise<SyncResult> => {
    const result = await syncService.pull(workspaceId)
    if (result.conflicts && result.conflicts.length > 0) {
      event.sender.send(IPC.SYNC_CONFLICT, result.conflicts)
    }
    if (result.orphaned && result.orphaned.length > 0) {
      event.sender.send(IPC.SYNC_ORPHANED_COLLECTIONS, result.orphaned)
    }
    if (result.orphanedMcpServers && result.orphanedMcpServers.length > 0) {
      event.sender.send(IPC.SYNC_ORPHANED_MCP_SERVERS, result.orphanedMcpServers)
    }
    return result
  })

  ipcMain.handle(
    IPC.SYNC_PUSH_COLLECTION,
    async (event, collectionId: string, sanitize?: boolean, workspaceId?: string): Promise<SyncResult> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      try {
        await syncService.pushCollection(collection, sanitize ?? false, workspaceId)
        return { success: true, message: 'Pushed successfully', pulled: 0, pushed: 1 }
      } catch (e) {
        if (e instanceof syncService.SyncConflictError) {
          logSync('push', collection.name, 'Conflict detected — both sides changed', false)
          const conflicts = [{
            collectionId: collection.id,
            collectionName: collection.name,
            localUpdatedAt: collection.updated_at,
          }]
          // Push conflict to renderer so the modal appears regardless of caller
          event.sender.send(IPC.SYNC_CONFLICT, conflicts)
          return {
            success: false,
            message: 'Conflict detected',
            pulled: 0,
            pushed: 0,
            conflicts,
          }
        }
        const msg = (e as Error).message
        logSync('push', collection.name, `Push failed: ${msg}`, false)
        return { success: false, message: msg, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(IPC.SYNC_PUSH_ALL, async (event, workspaceId?: string): Promise<SyncResult> => {
    const result = await syncService.pushAll(workspaceId)
    if (result.conflicts && result.conflicts.length > 0) {
      event.sender.send(IPC.SYNC_CONFLICT, result.conflicts)
    }
    return result
  })

  ipcMain.handle(
    IPC.SYNC_RESOLVE_CONFLICT,
    async (_event, collectionId: string, resolution: 'keep-local' | 'keep-remote', workspaceId?: string): Promise<SyncResult> => {
      if (resolution !== 'keep-local' && resolution !== 'keep-remote') {
        return { success: false, message: 'Invalid resolution strategy', pulled: 0, pushed: 0 }
      }
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      try {
        if (resolution === 'keep-local') {
          await syncService.forceKeepLocal(collection, workspaceId)
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
    async (_event, collectionId: string, workspaceId?: string): Promise<SyncResult> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      try {
        await syncService.deleteRemoteCollection(collection, workspaceId)
        return { success: true, message: 'Deleted from remote', pulled: 0, pushed: 0 }
      } catch (e) {
        return { success: false, message: (e as Error).message, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(
    IPC.SYNC_RESOLVE_ORPHAN,
    async (_event, collectionId: string, resolution: 'delete' | 'keep'): Promise<SyncResult> => {
      if (resolution !== 'delete' && resolution !== 'keep') {
        return { success: false, message: 'Invalid resolution', pulled: 0, pushed: 0 }
      }
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      if (resolution === 'delete') {
        collectionsRepo.remove(collectionId)
      } else {
        collectionsRepo.unlinkSync(collectionId)
      }
      return { success: true, message: `Orphan resolved (${resolution})`, pulled: 0, pushed: 0 }
    },
  )

  ipcMain.handle(
    IPC.SYNC_SCAN_SENSITIVE,
    async (_event, collectionId: string): Promise<SensitiveFinding[]> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) return []

      // Use the repository (which decrypts auth fields) instead of raw DB query
      const requests = requestsRepo.findByCollection(collectionId)
      const folders = foldersRepo.findByCollection(collectionId)

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

      const collectionAuth = collection.auth ? JSON.parse(collection.auth) : null
      const folderData = folders
        .filter((f) => f.auth)
        .map((f) => ({ id: f.id, name: f.name, auth: JSON.parse(f.auth!) }))

      const variables: KeyValueEntry[] = collection.variables ? JSON.parse(collection.variables) : []

      return scanCollection(parsedRequests, variables, collectionAuth, folderData)
    },
  )

  ipcMain.handle(
    IPC.SYNC_PUSH_REQUEST,
    async (_event, collectionId: string, requestId: string, sanitize?: boolean, workspaceId?: string): Promise<boolean> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) return false

      return syncService.pushSingleRequest(collection, requestId, sanitize ?? false, workspaceId)
    },
  )

  ipcMain.handle(
    IPC.SYNC_PULL_COLLECTION,
    async (_event, collectionId: string, workspaceId?: string): Promise<SyncResult> => {
      const collection = collectionsRepo.findById(collectionId)
      if (!collection) {
        return { success: false, message: 'Collection not found', pulled: 0, pushed: 0 }
      }

      try {
        const updated = await syncService.pullSingleCollection(collection, workspaceId)
        return { success: true, message: updated ? 'Pulled successfully' : 'Already up to date', pulled: updated ? 1 : 0, pushed: 0 }
      } catch (e) {
        const msg = (e as Error).message
        logSync('pull', collection.name, `Pull failed: ${msg}`, false)
        return { success: false, message: msg, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(
    IPC.SYNC_PUSH_MCP_SERVER,
    async (_event, serverId: string, sanitize?: boolean, workspaceId?: string): Promise<SyncResult> => {
      const server = mcpServersRepo.findById(serverId)
      if (!server) {
        return { success: false, message: 'MCP server not found', pulled: 0, pushed: 0 }
      }

      try {
        await syncService.pushMcpServer(server, sanitize ?? false, workspaceId)
        return { success: true, message: 'Pushed successfully', pulled: 0, pushed: 1 }
      } catch (e) {
        const msg = (e as Error).message
        logSync('push', server.name, `Push failed: ${msg}`, false)
        return { success: false, message: msg, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(
    IPC.SYNC_PULL_MCP_SERVER,
    async (_event, serverId: string, workspaceId?: string): Promise<SyncResult> => {
      const server = mcpServersRepo.findById(serverId)
      if (!server) {
        return { success: false, message: 'MCP server not found', pulled: 0, pushed: 0 }
      }

      try {
        const updated = await syncService.pullSingleMcpServer(server, workspaceId)
        return { success: true, message: updated ? 'Pulled successfully' : 'Already up to date', pulled: updated ? 1 : 0, pushed: 0 }
      } catch (e) {
        const msg = (e as Error).message
        logSync('pull', server.name, `Pull failed: ${msg}`, false)
        return { success: false, message: msg, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(
    IPC.SYNC_SCAN_MCP_SENSITIVE,
    async (_event, serverId: string): Promise<SensitiveFinding[]> => {
      const server = mcpServersRepo.findById(serverId)
      if (!server) return []

      const env = server.env ? JSON.parse(server.env) as Record<string, string> : undefined
      const headers = server.headers ? JSON.parse(server.headers) as Record<string, string> : undefined

      return scanMcpServer({
        id: server.id,
        name: server.name,
        env,
        headers,
      })
    },
  )

  ipcMain.handle(
    IPC.SYNC_DELETE_MCP_SERVER_REMOTE,
    async (_event, serverId: string, workspaceId?: string): Promise<SyncResult> => {
      const server = mcpServersRepo.findById(serverId)
      if (!server) {
        return { success: false, message: 'MCP server not found', pulled: 0, pushed: 0 }
      }

      try {
        await syncService.deleteMcpServerRemote(server, workspaceId)
        return { success: true, message: 'Deleted from remote', pulled: 0, pushed: 0 }
      } catch (e) {
        return { success: false, message: (e as Error).message, pulled: 0, pushed: 0 }
      }
    },
  )

  ipcMain.handle(
    IPC.SYNC_RESOLVE_MCP_ORPHAN,
    async (_event, serverId: string, resolution: 'delete' | 'keep'): Promise<SyncResult> => {
      if (resolution !== 'delete' && resolution !== 'keep') {
        return { success: false, message: 'Invalid resolution', pulled: 0, pushed: 0 }
      }

      if (resolution === 'delete') {
        mcpServersRepo.remove(serverId)
      } else {
        mcpServersRepo.unlinkSync(serverId)
      }
      return { success: true, message: `Orphan resolved (${resolution})`, pulled: 0, pushed: 0 }
    },
  )
}
