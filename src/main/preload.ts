import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types/ipc'
import type { Workspace, Collection, Folder, Request, Environment, AppSetting, WindowState } from '../shared/types/models'
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
    activate: (id: string, workspaceId?: string): Promise<{ vaultFailed: boolean } | undefined> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_ACTIVATE, id, workspaceId),
    deactivate: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.ENVIRONMENTS_DEACTIVATE, id),
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
    testConnection: (workspaceId?: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.SYNC_TEST_CONNECTION, workspaceId),
    pull: (workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_PULL, workspaceId),
    pushCollection: (collectionId: string, sanitize?: boolean, workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_PUSH_COLLECTION, collectionId, sanitize, workspaceId),
    pushAll: (workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_PUSH_ALL, workspaceId),
    resolveConflict: (collectionId: string, resolution: 'keep-local' | 'keep-remote', workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_RESOLVE_CONFLICT, collectionId, resolution, workspaceId),
    deleteRemote: (collectionId: string, workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_DELETE_REMOTE, collectionId, workspaceId),
    scanSensitive: (collectionId: string): Promise<SensitiveFinding[]> =>
      ipcRenderer.invoke(IPC.SYNC_SCAN_SENSITIVE, collectionId),
    pushRequest: (collectionId: string, requestId: string, sanitize?: boolean, workspaceId?: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.SYNC_PUSH_REQUEST, collectionId, requestId, sanitize, workspaceId),
    pullCollection: (collectionId: string, workspaceId?: string): Promise<SyncResult> =>
      ipcRenderer.invoke(IPC.SYNC_PULL_COLLECTION, collectionId, workspaceId),
  },

  vault: {
    testConnection: (workspaceId?: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC.VAULT_TEST_CONNECTION, workspaceId),
    pull: (workspaceId?: string): Promise<{ success: boolean; message: string; pulled?: number; errors?: string[] }> =>
      ipcRenderer.invoke(IPC.VAULT_PULL, workspaceId),
    push: (environmentId: string, workspaceId?: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC.VAULT_PUSH, environmentId, workspaceId),
    pullAll: (workspaceId?: string): Promise<{ success: boolean; created: number; errors: string[] }> =>
      ipcRenderer.invoke(IPC.VAULT_PULL_ALL, workspaceId),
    fetchVariables: (environmentId: string, workspaceId?: string): Promise<EnvironmentVariable[]> =>
      ipcRenderer.invoke(IPC.VAULT_FETCH_VARIABLES, environmentId, workspaceId),
    pushVariables: (environmentId: string, variables: EnvironmentVariable[], workspaceId?: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC.VAULT_PUSH_VARIABLES, environmentId, variables, workspaceId),
    deleteSecrets: (environmentId: string, workspaceId?: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC.VAULT_DELETE_SECRETS, environmentId, workspaceId),
    migrate: (environmentId: string, oldPath: string, newPath: string, workspaceId?: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC.VAULT_MIGRATE, environmentId, oldPath, newPath, workspaceId),
  },

  data: {
    export: (type: 'all' | 'collections' | 'environments' | 'config', workspaceId?: string): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IPC.DATA_EXPORT, type, workspaceId),
    exportCollection: (collectionId: string): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IPC.DATA_EXPORT_COLLECTION, collectionId),
    pickAndRead: (): Promise<{ content: string; name: string } | null> =>
      ipcRenderer.invoke(IPC.DATA_PICK_AND_READ),
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

  updater: {
    check: (): Promise<void> =>
      ipcRenderer.invoke(IPC.UPDATE_CHECK),
    install: (): Promise<void> =>
      ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    installSource: (): Promise<'brew' | 'scoop' | 'standalone'> =>
      ipcRenderer.invoke(IPC.UPDATE_INSTALL_SOURCE),
  },

  settings: {
    get: (key: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET, key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),
    getAll: (): Promise<AppSetting[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
  },

  workspaceSettings: {
    get: (workspaceId: string, key: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC.WORKSPACE_SETTINGS_GET, workspaceId, key),
    set: (workspaceId: string, key: string, value: string): Promise<void> =>
      ipcRenderer.invoke(IPC.WORKSPACE_SETTINGS_SET, workspaceId, key, value),
    getAll: (workspaceId: string): Promise<Record<string, Record<string, unknown>>> =>
      ipcRenderer.invoke(IPC.WORKSPACE_SETTINGS_GET_ALL, workspaceId),
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
      ipcRenderer.on(IPC.MENU_NEW_REQUEST, handler)
      return () => ipcRenderer.removeListener(IPC.MENU_NEW_REQUEST, handler)
    },
    menuSaveRequest: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on(IPC.MENU_SAVE_REQUEST, handler)
      return () => ipcRenderer.removeListener(IPC.MENU_SAVE_REQUEST, handler)
    },
    menuOpenSettings: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on(IPC.MENU_OPEN_SETTINGS, handler)
      return () => ipcRenderer.removeListener(IPC.MENU_OPEN_SETTINGS, handler)
    },
    menuOpenManual: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on(IPC.MENU_OPEN_MANUAL, handler)
      return () => ipcRenderer.removeListener(IPC.MENU_OPEN_MANUAL, handler)
    },
    menuCheckUpdates: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on(IPC.MENU_CHECK_UPDATES, handler)
      return () => ipcRenderer.removeListener(IPC.MENU_CHECK_UPDATES, handler)
    },
    updateAvailable: (callback: (data: { version: string; releaseName: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string; releaseName: string }): void => {
        callback(data)
      }
      ipcRenderer.on(IPC.UPDATE_AVAILABLE, handler)
      return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, handler)
    },
    updateProgress: (callback: (data: { percent: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { percent: number }): void => {
        callback(data)
      }
      ipcRenderer.on(IPC.UPDATE_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, handler)
    },
    updateDownloaded: (callback: (data: { version: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { version: string }): void => {
        callback(data)
      }
      ipcRenderer.on(IPC.UPDATE_DOWNLOADED, handler)
      return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, handler)
    },
    updateError: (callback: (message: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string): void => {
        callback(message)
      }
      ipcRenderer.on(IPC.UPDATE_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC.UPDATE_ERROR, handler)
    },
  },
}

export type API = typeof api

contextBridge.exposeInMainWorld('api', api)
