/**
 * IPC channel names and payload types for main↔renderer communication.
 * Pattern: 'domain:action'
 */

// --- Channel name constants ---

export const IPC = {
  // Workspaces
  WORKSPACES_LIST: 'workspaces:list',
  WORKSPACES_CREATE: 'workspaces:create',
  WORKSPACES_UPDATE: 'workspaces:update',
  WORKSPACES_DELETE: 'workspaces:delete',

  // Collections
  COLLECTIONS_LIST: 'collections:list',
  COLLECTIONS_CREATE: 'collections:create',
  COLLECTIONS_GET: 'collections:get',
  COLLECTIONS_UPDATE: 'collections:update',
  COLLECTIONS_DELETE: 'collections:delete',
  COLLECTIONS_REORDER: 'collections:reorder',

  // Folders
  FOLDERS_LIST: 'folders:list',
  FOLDERS_CREATE: 'folders:create',
  FOLDERS_GET: 'folders:get',
  FOLDERS_UPDATE: 'folders:update',
  FOLDERS_DELETE: 'folders:delete',
  FOLDERS_REORDER: 'folders:reorder',

  // Requests
  REQUESTS_LIST: 'requests:list',
  REQUESTS_CREATE: 'requests:create',
  REQUESTS_GET: 'requests:get',
  REQUESTS_UPDATE: 'requests:update',
  REQUESTS_DELETE: 'requests:delete',
  REQUESTS_REORDER: 'requests:reorder',
  REQUESTS_MOVE: 'requests:move',

  // Environments
  ENVIRONMENTS_LIST: 'environments:list',
  ENVIRONMENTS_CREATE: 'environments:create',
  ENVIRONMENTS_GET: 'environments:get',
  ENVIRONMENTS_UPDATE: 'environments:update',
  ENVIRONMENTS_DELETE: 'environments:delete',
  ENVIRONMENTS_REORDER: 'environments:reorder',
  ENVIRONMENTS_ACTIVATE: 'environments:activate',
  ENVIRONMENTS_DEACTIVATE: 'environments:deactivate',

  // Request Histories
  HISTORIES_LIST: 'histories:list',
  HISTORIES_GET: 'histories:get',
  HISTORIES_DELETE: 'histories:delete',
  HISTORIES_PRUNE: 'histories:prune',

  // Variables
  VARIABLES_RESOLVE: 'variables:resolve',
  VARIABLES_RESOLVE_WITH_SOURCE: 'variables:resolve-with-source',

  // HTTP Proxy
  PROXY_SEND: 'proxy:send',
  PROXY_CANCEL: 'proxy:cancel',
  PROXY_PICK_FILE: 'proxy:pick-file',

  // Sync
  SYNC_TEST_CONNECTION: 'sync:test-connection',
  SYNC_PULL: 'sync:pull',
  SYNC_PUSH_COLLECTION: 'sync:push-collection',
  SYNC_PUSH_ALL: 'sync:push-all',
  SYNC_RESOLVE_CONFLICT: 'sync:resolve-conflict',
  SYNC_DELETE_REMOTE: 'sync:delete-remote',
  SYNC_SCAN_SENSITIVE: 'sync:scan-sensitive',
  SYNC_PUSH_REQUEST: 'sync:push-request',

  // Vault
  VAULT_TEST_CONNECTION: 'vault:test-connection',
  VAULT_PULL: 'vault:pull',
  VAULT_PUSH: 'vault:push',
  VAULT_PULL_ALL: 'vault:pull-all',
  VAULT_FETCH_VARIABLES: 'vault:fetch-variables',
  VAULT_PUSH_VARIABLES: 'vault:push-variables',
  VAULT_DELETE_SECRETS: 'vault:delete-secrets',
  VAULT_MIGRATE: 'vault:migrate',

  // Data Import/Export
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  POSTMAN_IMPORT: 'postman:import',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // Window
  WINDOW_GET_STATE: 'window:get-state',
  WINDOW_SAVE_STATE: 'window:save-state',

  // Code Generator
  CODE_GENERATE: 'code:generate',

  // Session Log (main→renderer push)
  LOG_PUSH: 'log:push',
  LOG_LIST: 'log:list',
  LOG_CLEAR: 'log:clear',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
