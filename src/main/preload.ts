import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types/ipc'
import type { Workspace, Collection, Folder, Request, Environment, RequestHistory, AppSetting, WindowState } from '../shared/types/models'
import type { RequestConfig, ResponseData } from '../shared/types/http'
import type { SyncResult, SessionLogEntry } from '../shared/types/sync'
import type { SensitiveFinding } from './services/sensitive-data-scanner'
import type { CodeLanguage, CodeGenRequest } from './services/code-generator'
import type { EnvironmentVariable } from '../shared/types/models'
import type { PostmanImportResult } from './services/postman-import'

const api = {
  workspaces: {
    list: (): Promise<Workspace[]> =>
      ipcRenderer.invoke(IPC.WORKSPACES_LIST),
    create: (data: { name: string; description?: string }): Promise<Workspace> =>
      ipcRenderer.invoke(IPC.WORKSPACES_CREATE, data),
    update: (id: string, data: Partial<Workspace>): Promise<Workspace | undefined> =>
      ipcRenderer.invoke(IPC.WORKSPACES_UPDATE, id, data),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.WORKSPACES_DELETE, id),
  },

  collections: {
    list: (workspaceId?: string): Promise<Collection[]> =>
      ipcRenderer.invoke(IPC.COLLECTIONS_LIST, workspaceId),
    get: (id: string): Promise<Collection | undefined> =>
      ipcRenderer.invoke(IPC.COLLECTIONS_GET, id),
    create: (data: { name: string; workspace_id?: string; description?: string }): Promise<Collection> =>
      ipcRenderer.invoke(IPC.COLLECTIONS_CREATE, data),
    update: (id: string, data: Partial<Collection>): Promise<Collection | undefined> =>
      ipcRenderer.invoke(IPC.COLLECTIONS_UPDATE, id, data),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.COLLECTIONS_DELETE, id),
    reorder: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.COLLECTIONS_REORDER, ids),
  },

  folders: {
    list: (collectionId: string): Promise<Folder[]> =>
      ipcRenderer.invoke(IPC.FOLDERS_LIST, collectionId),
    get: (id: string): Promise<Folder | undefined> =>
      ipcRenderer.invoke(IPC.FOLDERS_GET, id),
    create: (data: { collection_id: string; name: string; parent_id?: string }): Promise<Folder> =>
      ipcRenderer.invoke(IPC.FOLDERS_CREATE, data),
    update: (id: string, data: Partial<Folder>): Promise<Folder | undefined> =>
      ipcRenderer.invoke(IPC.FOLDERS_UPDATE, id, data),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.FOLDERS_DELETE, id),
    reorder: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.FOLDERS_REORDER, ids),
  },

  requests: {
    list: (collectionId: string): Promise<Request[]> =>
      ipcRenderer.invoke(IPC.REQUESTS_LIST, collectionId),
    get: (id: string): Promise<Request | undefined> =>
      ipcRenderer.invoke(IPC.REQUESTS_GET, id),
    create: (data: { collection_id: string; name: string; folder_id?: string; method?: string; url?: string; body_type?: string }): Promise<Request> =>
      ipcRenderer.invoke(IPC.REQUESTS_CREATE, data),
    update: (id: string, data: Partial<Request>): Promise<Request | undefined> =>
      ipcRenderer.invoke(IPC.REQUESTS_UPDATE, id, data),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.REQUESTS_DELETE, id),
    move: (id: string, targetFolderId: string | null, targetCollectionId?: string): Promise<Request | undefined> =>
      ipcRenderer.invoke(IPC.REQUESTS_MOVE, id, targetFolderId, targetCollectionId),
    reorder: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.REQUESTS_REORDER, ids),
  },

  environments: {
    list: (workspaceId?: string): Promise<Environment[]> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_LIST, workspaceId),
    get: (id: string): Promise<Environment | undefined> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_GET, id),
    create: (data: { name: string; workspace_id?: string; variables?: string }): Promise<Environment> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_CREATE, data),
    update: (id: string, data: Partial<Environment>): Promise<Environment | undefined> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_UPDATE, id, data),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_DELETE, id),
    reorder: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_REORDER, ids),
    activate: (id: string, workspaceId?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_ACTIVATE, id, workspaceId),
    deactivate: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_DEACTIVATE, id),
  },

  histories: {
    list: (requestId: string): Promise<RequestHistory[]> =>
      ipcRenderer.invoke(IPC.HISTORIES_LIST, requestId),
    get: (id: string): Promise<RequestHistory | undefined> =>
      ipcRenderer.invoke(IPC.HISTORIES_GET, id),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.HISTORIES_DELETE, id),
    prune: (retentionDays: number): Promise<number> =>
      ipcRenderer.invoke(IPC.HISTORIES_PRUNE, retentionDays),
  },

  variables: {
    resolve: (workspaceId?: string, collectionId?: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke(IPC.VARIABLES_RESOLVE, workspaceId, collectionId),
    resolveWithSource: (workspaceId?: string, collectionId?: string): Promise<Record<string, { value: string; source: string }>> =>
      ipcRenderer.invoke(IPC.VARIABLES_RESOLVE_WITH_SOURCE, workspaceId, collectionId),
  },

  proxy: {
    send: (requestId: string, config: RequestConfig): Promise<ResponseData> =>
      ipcRenderer.invoke(IPC.PROXY_SEND, requestId, config),
    cancel: (requestId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.PROXY_CANCEL, requestId),
    pickFile: (): Promise<{ path: string; name: string } | null> =>
      ipcRenderer.invoke(IPC.PROXY_PICK_FILE),
  },

  sync: {
    testConnection: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC.SYNC_TEST_CONNECTION),
    pull: (workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_PULL, workspaceId),
    pushCollection: (collectionId: string, sanitize?: boolean): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_PUSH_COLLECTION, collectionId, sanitize),
    pushAll: (workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_PUSH_ALL, workspaceId),
    resolveConflict: (collectionId: string, resolution: 'keep-local' | 'keep-remote', workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_RESOLVE_CONFLICT, collectionId, resolution, workspaceId),
    deleteRemote: (collectionId: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_DELETE_REMOTE, collectionId),
    scanSensitive: (collectionId: string): Promise<SensitiveFinding[]> =>
      ipcRenderer.invoke(IPC.SYNC_SCAN_SENSITIVE, collectionId),
    pushRequest: (collectionId: string, requestId: string, sanitize?: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.SYNC_PUSH_REQUEST, collectionId, requestId, sanitize),
  },

  vault: {
    testConnection: (): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC.VAULT_TEST_CONNECTION),
    pull: (): Promise<{ success: boolean; message: string; pulled?: number; errors?: string[] }> =>
      ipcRenderer.invoke(IPC.VAULT_PULL),
    push: (environmentId: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC.VAULT_PUSH, environmentId),
    pullAll: (workspaceId?: string): Promise<{ success: boolean; created: number; errors: string[] }> =>
      ipcRenderer.invoke(IPC.VAULT_PULL_ALL, workspaceId),
    fetchVariables: (environmentId: string): Promise<EnvironmentVariable[]> =>
      ipcRenderer.invoke(IPC.VAULT_FETCH_VARIABLES, environmentId),
    pushVariables: (environmentId: string, variables: EnvironmentVariable[]): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC.VAULT_PUSH_VARIABLES, environmentId, variables),
    deleteSecrets: (environmentId: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC.VAULT_DELETE_SECRETS, environmentId),
    migrate: (environmentId: string, oldPath: string, newPath: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC.VAULT_MIGRATE, environmentId, oldPath, newPath),
  },

  data: {
    export: (type: 'all' | 'collections' | 'environments' | 'config', workspaceId?: string): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IPC.DATA_EXPORT, type, workspaceId),
    readFile: (filePath: string): Promise<string> =>
      ipcRenderer.invoke(IPC.DATA_READ_FILE, filePath),
    import: (json: string, workspaceId?: string): Promise<{ collections: number; environments: number; config: boolean; errors: string[] }> =>
      ipcRenderer.invoke(IPC.DATA_IMPORT, json, workspaceId),
    importPostman: (json: string, workspaceId?: string): Promise<PostmanImportResult> =>
      ipcRenderer.invoke(IPC.POSTMAN_IMPORT, json, workspaceId),
  },

  codeGenerator: {
    generate: (language: CodeLanguage, data: CodeGenRequest, workspaceId?: string, collectionId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC.CODE_GENERATE, language, data, workspaceId, collectionId),
  },

  log: {
    list: (): Promise<SessionLogEntry[]> =>
      ipcRenderer.invoke(IPC.LOG_LIST),
    clear: (): Promise<void> =>
      ipcRenderer.invoke(IPC.LOG_CLEAR),
  },

  settings: {
    get: (key: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET, key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),
    getAll: (): Promise<AppSetting[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
  },

  window: {
    getState: (): Promise<WindowState> =>
      ipcRenderer.invoke(IPC.WINDOW_GET_STATE),
    saveState: (state: WindowState): Promise<void> =>
      ipcRenderer.invoke(IPC.WINDOW_SAVE_STATE, state),
  },

  // Event listeners for main→renderer pushes
  on: {
    logPush: (callback: (entry: SessionLogEntry) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: SessionLogEntry): void => {
        callback(entry)
      }
      ipcRenderer.on(IPC.LOG_PUSH, handler)
      return () => ipcRenderer.removeListener(IPC.LOG_PUSH, handler)
    },
    menuNewRequest: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:new-request', handler)
      return () => ipcRenderer.removeListener('menu:new-request', handler)
    },
    menuSaveRequest: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:save-request', handler)
      return () => ipcRenderer.removeListener('menu:save-request', handler)
    },
    menuOpenSettings: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:open-settings', handler)
      return () => ipcRenderer.removeListener('menu:open-settings', handler)
    },
    menuOpenManual: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:open-manual', handler)
      return () => ipcRenderer.removeListener('menu:open-manual', handler)
    },
    menuCheckUpdates: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:check-updates', handler)
      return () => ipcRenderer.removeListener('menu:check-updates', handler)
    },
  },
}

export type API = typeof api

contextBridge.exposeInMainWorld('api', api)
