# Vaxtly Next — Architecture Reference

> Pure Electron + TypeScript + Svelte 5 rewrite of Vaxtly (API client).
> This document is the single source of truth. **Update it with every phase.**

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Electron | 35 |
| Build | electron-vite | 3 |
| UI | Svelte 5 (runes) | 5 |
| CSS | Tailwind CSS | 4 |
| Editor | CodeMirror | 6 |
| Database | better-sqlite3 (SQLite WAL) | 12 |
| HTTP | undici (custom TLS Agent) | 7 |
| Encryption | Electron safeStorage + AES-256-CBC | — |
| Tests | Vitest (unit) | 4 |
| Types | TypeScript strict | 5.7 |

## Project Structure

```
vaxtly/
├── src/
│   ├── shared/                          # Types shared main↔renderer
│   │   ├── types/
│   │   │   ├── models.ts               # All entity interfaces
│   │   │   ├── ipc.ts                  # IPC channel constants
│   │   │   ├── http.ts                 # RequestConfig, ResponseData, etc.
│   │   │   └── sync.ts                 # SyncConfig, VaultConfig, etc.
│   │   └── constants.ts                # HTTP_METHODS, BODY_TYPES, AUTH_TYPES, SENSITIVE_*
│   ├── main/
│   │   ├── index.ts                    # App lifecycle, window, boot sequence
│   │   ├── menu.ts                     # Native menu + accelerators
│   │   ├── preload.ts                  # contextBridge typed API
│   │   ├── database/
│   │   │   ├── connection.ts           # SQLite open/close + migration runner
│   │   │   ├── migrations/
│   │   │   │   ├── types.ts            # MigrationFile interface
│   │   │   │   └── 001_initial_schema.ts
│   │   │   └── repositories/
│   │   │       ├── workspaces.ts
│   │   │       ├── collections.ts
│   │   │       ├── folders.ts
│   │   │       ├── requests.ts
│   │   │       ├── environments.ts
│   │   │       ├── request-histories.ts
│   │   │       └── settings.ts
│   │   ├── ipc/                        # IPC handler registration per domain
│   │   │   ├── workspaces.ts
│   │   │   ├── collections.ts
│   │   │   ├── folders.ts
│   │   │   ├── requests.ts
│   │   │   ├── environments.ts
│   │   │   ├── proxy.ts               # HTTP proxy + var substitution + pre/post scripts + history save
│   │   │   ├── variables.ts           # Variable resolution IPC (resolve, resolveWithSource)
│   │   │   ├── histories.ts           # Request history CRUD + prune
│   │   │   ├── session-log.ts         # Session log list + clear
│   │   │   ├── code-generator.ts      # Code snippet generation
│   │   │   ├── sync.ts                # Git sync: test, pull, push, resolve, scan
│   │   │   ├── vault.ts               # Vault: test, pull, push, fetch/push vars, delete, migrate
│   │   │   ├── data-import-export.ts  # Data export/import + Postman import
│   │   │   └── settings.ts
│   │   ├── services/
│   │   │   ├── encryption.ts           # safeStorage master key + AES-256-CBC
│   │   │   ├── variable-substitution.ts # {{var}} resolution, nested refs, env+collection merge
│   │   │   ├── script-execution.ts     # Pre/post-request scripts, dependent request chains
│   │   │   ├── code-generator.ts       # Code snippet generation (5 languages)
│   │   │   ├── session-log.ts          # In-memory ring buffer, push to renderer
│   │   │   ├── yaml-serializer.ts      # Collection ↔ YAML directory serialization/import
│   │   │   ├── sensitive-data-scanner.ts # Scan/sanitize sensitive data in requests & variables
│   │   │   ├── data-export-import.ts  # Export/import collections, environments, config
│   │   │   └── postman-import.ts      # Import Postman collections/environments (3 formats)
│   │   ├── vault/
│   │   │   ├── secrets-provider.interface.ts # SecretsProvider interface
│   │   │   ├── hashicorp-vault-provider.ts   # HashiCorp Vault KV v2 provider
│   │   │   └── vault-sync-service.ts         # Vault sync: fetch/push vars, pullAll, migrate
│   │   └── sync/
│   │       ├── git-provider.interface.ts # GitProvider interface (list, get, commit, delete)
│   │       ├── github-provider.ts      # GitHub Git Data API provider
│   │       ├── gitlab-provider.ts      # GitLab Repository API v4 provider
│   │       └── remote-sync-service.ts  # 3-way merge, pull/push, conflict detection/resolution
│   └── renderer/
│       ├── index.html
│       ├── main.ts                     # Svelte mount point
│       ├── App.svelte                  # Root: sidebar + tabs + content + session persistence + auto-reveal + default env
│       ├── env.d.ts                    # window.api type declaration
│       ├── styles/app.css              # Tailwind + theme + scrollbars + CodeMirror
│       ├── lib/
│       │   ├── types.ts                # Re-exports from @shared
│       │   ├── ipc.ts                  # `export const api = window.api`
│       │   ├── stores/
│       │   │   ├── app.svelte.ts       # Tabs, sidebar, workspace state, settings modal
│       │   │   ├── collections.svelte.ts # Tree, CRUD, expand/collapse
│       │   │   ├── environments.svelte.ts # Environment list, activation
│       │   │   ├── settings.svelte.ts  # App settings with typed keys + IPC persistence
│       │   │   └── drag.svelte.ts      # Drag-and-drop state for sidebar items
│       │   └── utils/
│       │       ├── http-colors.ts      # METHOD_COLORS, status color helpers
│       │       ├── formatters.ts       # formatSize, formatTime, detectLanguage, formatBody
│       │       └── variable-highlight.ts # CodeMirror {{var}} decoration + hover tooltip
│       └── components/
│           ├── CodeEditor.svelte       # CodeMirror 6 wrapper + optional variable highlight
│           ├── layout/
│           │   ├── Sidebar.svelte      # Mode tabs (Collections/Environments) + search + tree
│           │   ├── TabBar.svelte       # Horizontal tabs + env icon for environment tabs
│           │   └── SystemLog.svelte    # Collapsible bottom panel: logs + request history
│           ├── sidebar/
│           │   ├── CollectionTree.svelte # Recursive tree with search filter
│           │   ├── CollectionItem.svelte # Expand/collapse, rename, sync, drag-drop target
│           │   ├── FolderItem.svelte    # Same pattern, self-recursive, drag-drop target
│           │   ├── RequestItem.svelte   # Method badge, active state, draggable
│           │   ├── EnvironmentList.svelte # Env list + active toggle + context menu
│           │   └── WorkspaceSwitcher.svelte # Dropdown workspace selector + rename/delete/create
│           ├── request/
│           │   ├── RequestBuilder.svelte # Container: URL + sub-tabs + response split
│           │   ├── UrlBar.svelte        # Method select + URL input + Send/Cancel
│           │   ├── ParamsEditor.svelte   # Query params ↔ URL sync
│           │   ├── HeadersEditor.svelte  # Implicit headers + custom headers
│           │   ├── BodyEditor.svelte     # 7 body types: none/json/xml/form-data/urlencoded/raw/graphql
│           │   ├── AuthEditor.svelte     # 4 auth types: none/bearer/basic/api-key
│           │   └── ScriptsEditor.svelte  # Pre-request + post-response script config
│           ├── environment/
│           │   └── EnvironmentEditor.svelte # Name, active toggle, variables, vault sync
│           ├── response/
│           │   ├── ResponseViewer.svelte  # Status bar + Body/Headers/Cookies/Preview tabs
│           │   ├── ResponseBody.svelte    # Read-only CodeMirror, auto-detect language
│           │   ├── ResponseHeaders.svelte # Key-value list
│           │   ├── ResponseCookies.svelte # Cookie cards with attributes
│           │   └── HtmlPreview.svelte     # Sandboxed iframe HTML response preview
│           ├── settings/
│           │   ├── SettingsModal.svelte   # 4-tab bespoke modal (General/Data/Remote/Vault)
│           │   ├── GeneralTab.svelte      # Layout, timeout, SSL, redirects, retention, about
│           │   ├── DataTab.svelte         # Export (type pills) + Import (Vaxtly/Postman)
│           │   ├── RemoteSyncTab.svelte   # Git provider config, test/pull/push + conflict modal
│           │   └── VaultTab.svelte        # Vault URL, auth, namespace, actions
│           ├── modals/
│           │   ├── CodeSnippetModal.svelte # Language tabs + generated code + copy
│           │   ├── ConflictModal.svelte    # 2-card sync conflict resolution
│           │   ├── SensitiveDataModal.svelte # Sensitive data findings before push
│           │   ├── EnvironmentAssociationModal.svelte # Env checkbox list + default star + reloads store on save
│           │   └── WelcomeGuide.svelte    # 5-step onboarding modal
│           ├── help/
│           │   └── UserManual.svelte     # Comprehensive in-app user manual (F1 shortcut)
│           └── shared/
│               ├── KeyValueEditor.svelte  # Reusable checkbox + key + value + delete rows
│               ├── ContextMenu.svelte     # Right-click menu with position correction
│               ├── Modal.svelte           # Generic modal with backdrop + Escape
│               ├── Toggle.svelte          # Pill-shaped sliding switch (settings)
│               └── Checkbox.svelte        # Square checkbox with checkmark animation
├── tests/
│   └── unit/
│       ├── repositories.test.ts        # 26 tests covering all repositories
│       ├── variable-substitution.test.ts # 12 tests for variable resolution
│       ├── script-execution.test.ts    # 17 tests for extractValue + extractJsonPath
│       ├── code-generator.test.ts      # 12 tests for 5 language generators
│       ├── sensitive-data-scanner.test.ts # 20 tests for scan + sanitize
│       ├── yaml-serializer.test.ts     # 8 tests for serialize + import
│       ├── remote-sync.test.ts         # 12 tests for file state helpers
│       ├── vault-sync.test.ts          # 7 tests for buildPath + isConfigured
│       ├── data-export-import.test.ts  # 11 tests for export + import
│       └── postman-import.test.ts      # 10 tests for 3 Postman formats
├── electron.vite.config.ts             # 3-target build (main, preload, renderer)
├── vitest.config.ts                    # @shared alias, globals: true
├── tsconfig.json                       # Project references
├── tsconfig.node.json                  # main + shared
├── tsconfig.web.json                   # renderer + shared
├── svelte.config.js                    # vitePreprocess only
├── package.json
└── tailwind.config.js                  # (not present — Tailwind v4 uses CSS @theme)
```

---

## Database Schema

SQLite WAL mode. All primary keys are UUID TEXT. Foreign keys enforced via `PRAGMA foreign_keys = ON`.

### Entity Relationship Diagram

```
workspaces 1──N collections
workspaces 1──N environments
collections 1──N folders
collections 1──N requests
folders 1──N folders (self-referential, max ~3 levels)
folders 1──N requests (ON DELETE SET NULL)
requests 1──N request_histories
```

### Tables

#### `workspaces`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | uuid | |
| name | TEXT NOT NULL | | |
| description | TEXT | NULL | |
| order | INTEGER | 0 | |
| settings | TEXT | NULL | JSON |
| created_at | TEXT | datetime('now') | |
| updated_at | TEXT | datetime('now') | |

#### `collections`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | uuid | |
| workspace_id | TEXT | NULL | FK → workspaces ON DELETE CASCADE |
| name | TEXT NOT NULL | | |
| description | TEXT | NULL | |
| order | INTEGER | 0 | |
| variables | TEXT | NULL | JSON `Record<string,string>` — collection-level vars |
| remote_sha | TEXT | NULL | Git blob SHA for sync |
| remote_synced_at | TEXT | NULL | |
| is_dirty | INTEGER | 0 | 1 = needs push |
| sync_enabled | INTEGER | 0 | |
| environment_ids | TEXT | NULL | JSON `string[]` — associated envs |
| default_environment_id | TEXT | NULL | |
| file_shas | TEXT | NULL | JSON `{path: {content_hash, remote_sha, commit_sha}}` |
| created_at | TEXT | datetime('now') | |
| updated_at | TEXT | datetime('now') | |

#### `folders`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | uuid | |
| collection_id | TEXT NOT NULL | | FK → collections ON DELETE CASCADE |
| parent_id | TEXT | NULL | FK → folders ON DELETE CASCADE (self-ref) |
| name | TEXT NOT NULL | | |
| order | INTEGER | 0 | Scoped to (collection_id, parent_id) |
| environment_ids | TEXT | NULL | JSON |
| default_environment_id | TEXT | NULL | |
| created_at | TEXT | datetime('now') | |
| updated_at | TEXT | datetime('now') | |

#### `requests`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | uuid | |
| collection_id | TEXT NOT NULL | | FK → collections ON DELETE CASCADE |
| folder_id | TEXT | NULL | FK → folders ON DELETE SET NULL |
| name | TEXT NOT NULL | | |
| url | TEXT | '' | |
| method | TEXT | 'GET' | |
| headers | TEXT | NULL | JSON `KeyValueEntry[]` |
| query_params | TEXT | NULL | JSON `KeyValueEntry[]` |
| body | TEXT | NULL | String or JSON (form-data: serialized `FormDataEntry[]`) |
| body_type | TEXT | 'json' | none\|json\|xml\|form-data\|urlencoded\|raw\|graphql |
| auth | TEXT | NULL | JSON `AuthConfig` — sensitive fields encrypted with `enc:` prefix |
| scripts | TEXT | NULL | JSON `ScriptsConfig` |
| order | INTEGER | 0 | |
| created_at | TEXT | datetime('now') | |
| updated_at | TEXT | datetime('now') | |

#### `environments`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | uuid | |
| workspace_id | TEXT | NULL | FK → workspaces ON DELETE CASCADE |
| name | TEXT NOT NULL | | |
| variables | TEXT NOT NULL | '[]' | JSON `EnvironmentVariable[]` — values encrypted with `enc:` prefix |
| is_active | INTEGER | 0 | Only 1 active per workspace (enforced in code) |
| order | INTEGER | 0 | |
| vault_synced | INTEGER | 0 | |
| vault_path | TEXT | NULL | |
| created_at | TEXT | datetime('now') | |
| updated_at | TEXT | datetime('now') | |

#### `request_histories`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | TEXT PK | uuid | |
| request_id | TEXT NOT NULL | | FK → requests ON DELETE CASCADE |
| method | TEXT | 'GET' | |
| url | TEXT | '' | |
| status_code | INTEGER | NULL | |
| request_headers | TEXT | NULL | JSON |
| request_body | TEXT | NULL | |
| request_query_params | TEXT | NULL | JSON |
| response_body | TEXT | NULL | |
| response_headers | TEXT | NULL | JSON |
| duration_ms | INTEGER | NULL | |
| executed_at | TEXT NOT NULL | datetime('now') | Indexed for prune queries |
| created_at | TEXT | datetime('now') | |
| updated_at | TEXT | datetime('now') | |

#### `app_settings`
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | |
| value | TEXT NOT NULL | Sensitive keys (`vault.token`, `vault.role_id`, `vault.secret_id`, `sync.token`) stored as AES-256-CBC encrypted base64 |

#### `window_state`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | INTEGER PK | 1 | Singleton (CHECK id=1) |
| x | INTEGER | NULL | |
| y | INTEGER | NULL | |
| width | INTEGER | 1200 | |
| height | INTEGER | 800 | |
| is_maximized | INTEGER | 0 | |

---

## IPC Architecture

Pattern: `ipcMain.handle('domain:action', handler)` in main, `ipcRenderer.invoke('domain:action', ...args)` in preload.

### Full Channel Map

| Channel | Handler File | Repository Method | Preload API |
|---------|-------------|-------------------|-------------|
| `workspaces:list` | ipc/workspaces.ts | `findAll()` | `api.workspaces.list()` |
| `workspaces:create` | ipc/workspaces.ts | `create(data)` | `api.workspaces.create(data)` |
| `workspaces:update` | ipc/workspaces.ts | `update(id, data)` | `api.workspaces.update(id, data)` |
| `workspaces:delete` | ipc/workspaces.ts | `remove(id)` | `api.workspaces.delete(id)` |
| `collections:list` | ipc/collections.ts | `findByWorkspace(wsId)` | `api.collections.list(wsId?)` |
| `collections:get` | ipc/collections.ts | `findById(id)` | `api.collections.get(id)` |
| `collections:create` | ipc/collections.ts | `create(data)` | `api.collections.create(data)` |
| `collections:update` | ipc/collections.ts | `update(id, data)` | `api.collections.update(id, data)` |
| `collections:delete` | ipc/collections.ts | `remove(id)` | `api.collections.delete(id)` |
| `collections:reorder` | ipc/collections.ts | `reorder(ids)` | `api.collections.reorder(ids)` |
| `folders:list` | ipc/folders.ts | `findByCollection(colId)` | `api.folders.list(colId)` |
| `folders:get` | ipc/folders.ts | `findById(id)` | `api.folders.get(id)` |
| `folders:create` | ipc/folders.ts | `create(data)` | `api.folders.create(data)` |
| `folders:update` | ipc/folders.ts | `update(id, data)` | `api.folders.update(id, data)` |
| `folders:delete` | ipc/folders.ts | `remove(id)` | `api.folders.delete(id)` |
| `folders:reorder` | ipc/folders.ts | `reorder(ids)` | `api.folders.reorder(ids)` |
| `requests:list` | ipc/requests.ts | `findByCollection(colId)` | `api.requests.list(colId)` |
| `requests:get` | ipc/requests.ts | `findById(id)` | `api.requests.get(id)` |
| `requests:create` | ipc/requests.ts | `create(data)` | `api.requests.create(data)` |
| `requests:update` | ipc/requests.ts | `update(id, data)` | `api.requests.update(id, data)` |
| `requests:delete` | ipc/requests.ts | `remove(id)` | `api.requests.delete(id)` |
| `requests:move` | ipc/requests.ts | `move(id, folderId, colId?)` | `api.requests.move(...)` |
| `requests:reorder` | ipc/requests.ts | `reorder(ids)` | `api.requests.reorder(ids)` |
| `environments:list` | ipc/environments.ts | `findByWorkspace(wsId)` | `api.environments.list(wsId?)` |
| `environments:get` | ipc/environments.ts | `findById(id)` | `api.environments.get(id)` |
| `environments:create` | ipc/environments.ts | `create(data)` | `api.environments.create(data)` |
| `environments:update` | ipc/environments.ts | `update(id, data)` | `api.environments.update(id, data)` |
| `environments:delete` | ipc/environments.ts | `remove(id)` | `api.environments.delete(id)` |
| `environments:reorder` | ipc/environments.ts | `reorder(ids)` | `api.environments.reorder(ids)` |
| `environments:activate` | ipc/environments.ts | `activate(id, wsId?)` | `api.environments.activate(id, wsId?)` |
| `environments:deactivate` | ipc/environments.ts | `deactivate(id)` | `api.environments.deactivate(id)` |
| `proxy:send` | ipc/proxy.ts | native fetch + var substitution | `api.proxy.send(reqId, config)` |
| `proxy:cancel` | ipc/proxy.ts | AbortController | `api.proxy.cancel(reqId)` |
| `proxy:pick-file` | ipc/proxy.ts | dialog.showOpenDialog | `api.proxy.pickFile()` |
| `variables:resolve` | ipc/variables.ts | `getResolvedVariables()` | `api.variables.resolve(wsId?, colId?)` |
| `variables:resolve-with-source` | ipc/variables.ts | `getResolvedVariablesWithSource()` | `api.variables.resolveWithSource(wsId?, colId?)` |
| `histories:list` | ipc/histories.ts | `findByRequest(reqId)` | `api.histories.list(reqId)` |
| `histories:get` | ipc/histories.ts | `findById(id)` | `api.histories.get(id)` |
| `histories:delete` | ipc/histories.ts | `remove(id)` | `api.histories.delete(id)` |
| `histories:prune` | ipc/histories.ts | `prune(days)` | `api.histories.prune(days)` |
| `code:generate` | ipc/code-generator.ts | `generateCode(lang, data, ...)` | `api.codeGenerator.generate(...)` |
| `log:list` | ipc/session-log.ts | `getLogs()` | `api.log.list()` |
| `log:clear` | ipc/session-log.ts | `clearLogs()` | `api.log.clear()` |
| `log:push` | — (main→renderer push) | — | `api.on.logPush(cb)` |
| `sync:test-connection` | ipc/sync.ts | `syncService.testConnection()` | `api.sync.testConnection()` |
| `sync:pull` | ipc/sync.ts | `syncService.pull(wsId?)` | `api.sync.pull(wsId?)` |
| `sync:push-collection` | ipc/sync.ts | `syncService.pushCollection(col, sanitize?)` | `api.sync.pushCollection(id, sanitize?)` |
| `sync:push-all` | ipc/sync.ts | `syncService.pushAll(wsId?)` | `api.sync.pushAll(wsId?)` |
| `sync:resolve-conflict` | ipc/sync.ts | `syncService.forceKeep{Local,Remote}()` | `api.sync.resolveConflict(id, res, wsId?)` |
| `sync:delete-remote` | ipc/sync.ts | `syncService.deleteRemoteCollection()` | `api.sync.deleteRemote(id)` |
| `sync:scan-sensitive` | ipc/sync.ts | `scanCollection(reqs, vars)` | `api.sync.scanSensitive(id)` |
| `sync:push-request` | ipc/sync.ts | `syncService.pushSingleRequest()` | `api.sync.pushRequest(colId, reqId, sanitize?)` |
| `vault:test-connection` | ipc/vault.ts | `vaultService.testConnection()` | `api.vault.testConnection()` |
| `vault:pull` | ipc/vault.ts | `vaultService.pullAll()` | `api.vault.pull()` |
| `vault:push` | ipc/vault.ts | `vaultService.pushVariables()` | `api.vault.push(envId)` |
| `vault:pull-all` | ipc/vault.ts | `vaultService.pullAll(wsId?)` | `api.vault.pullAll(wsId?)` |
| `vault:fetch-variables` | ipc/vault.ts | `vaultService.fetchVariables(envId)` | `api.vault.fetchVariables(envId)` |
| `vault:push-variables` | ipc/vault.ts | `vaultService.pushVariables(envId, vars)` | `api.vault.pushVariables(envId, vars)` |
| `vault:delete-secrets` | ipc/vault.ts | `vaultService.deleteSecrets(envId)` | `api.vault.deleteSecrets(envId)` |
| `vault:migrate` | ipc/vault.ts | `vaultService.migrateEnvironment(...)` | `api.vault.migrate(envId, old, new)` |
| `data:export` | ipc/data-import-export.ts | `dataService.export{All,Collections,...}()` | `api.data.export(type, wsId?)` |
| `data:import` | ipc/data-import-export.ts | `dataService.importData(json, wsId?)` | `api.data.import(json, wsId?)` |
| `postman:import` | ipc/data-import-export.ts | `importPostman(json, wsId?)` | `api.data.importPostman(json, wsId?)` |
| `settings:get` | ipc/settings.ts | `getSetting(key)` | `api.settings.get(key)` |
| `settings:set` | ipc/settings.ts | `setSetting(key, val)` | `api.settings.set(key, val)` |
| `settings:get-all` | ipc/settings.ts | `getAllSettings()` | `api.settings.getAll()` |
| `workspace-settings:get` | ipc/settings.ts | `getWorkspaceSetting(wsId, key)` | `api.workspaceSettings.get(wsId, key)` |
| `workspace-settings:set` | ipc/settings.ts | `setWorkspaceSetting(wsId, key, val)` | `api.workspaceSettings.set(wsId, key, val)` |
| `workspace-settings:get-all` | ipc/settings.ts | `getWorkspaceSettings(wsId)` | `api.workspaceSettings.getAll(wsId)` |
| `window:get-state` | ipc/settings.ts | `getWindowState()` | `api.window.getState()` |
| `window:save-state` | ipc/settings.ts | `saveWindowState(s)` | `api.window.saveState(s)` |

**Menu channels** (main→renderer push via `IPC.*` constants, not request/response):
`menu:new-request`, `menu:save-request`, `menu:open-settings`, `menu:open-manual`, `menu:check-updates`

---

## Shared Types

### `models.ts`

```typescript
interface Workspace { id, name, description?, order, settings?, created_at, updated_at }
interface Collection { id, workspace_id?, name, description?, order, variables?, remote_sha?,
    remote_synced_at?, is_dirty, sync_enabled, environment_ids?, default_environment_id?,
    file_shas?, created_at, updated_at }
interface Folder { id, collection_id, parent_id?, name, order, environment_ids?,
    default_environment_id?, created_at, updated_at }
interface Request { id, collection_id, folder_id?, name, url, method, headers?, query_params?,
    body?, body_type, auth?, scripts?, order, created_at, updated_at }
interface Environment { id, workspace_id?, name, variables (JSON string), is_active (0|1),
    order, vault_synced, vault_path?, created_at, updated_at }
interface RequestHistory { id, request_id, method, url, status_code?, request_headers?,
    request_body?, request_query_params?, response_body?, response_headers?, duration_ms?,
    executed_at, created_at, updated_at }
interface AppSetting { key, value }
interface WindowState { id?, x?, y?, width, height, is_maximized }
interface KeyValueEntry { key, value, description?, enabled }
interface AuthConfig { type: 'none'|'bearer'|'basic'|'api-key', bearer_token?, basic_username?,
    basic_password?, api_key_header?, api_key_value? }
interface ScriptsConfig { pre_request?: ScriptAction[], post_response?: ScriptAction[] }
interface ScriptAction { action, request_id?, source?, target?, value? }
interface EnvironmentVariable { key, value, enabled }
```

### `http.ts`

```typescript
type BodyType = 'none' | 'json' | 'xml' | 'form-data' | 'urlencoded' | 'raw' | 'graphql'
interface RequestConfig { method, url, headers, body?, bodyType?, formData?, timeout?,
    followRedirects?, verifySsl? }
interface FormDataEntry { key, value, type: 'text'|'file', enabled, filePath?, fileName? }
interface ResponseData { status, statusText, headers, body, size, timing, cookies }
interface ResponseTiming { start, ttfb, total }
interface ResponseCookie { name, value, domain?, path?, expires?, httpOnly?, secure?, sameSite? }
```

### `constants.ts`

```typescript
HTTP_METHODS = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'] as const
BODY_TYPES = ['none','json','xml','form-data','urlencoded','raw','graphql'] as const
AUTH_TYPES = ['none','bearer','basic','api-key'] as const
SENSITIVE_HEADERS = ['authorization','x-api-key','cookie','set-cookie', ...]
SENSITIVE_PARAM_KEYS = ['api_key','apikey','token','secret','password', ...]
DEFAULTS = { REQUEST_TIMEOUT_MS: 30000, HISTORY_RETENTION_DAYS: 30, FOLLOW_REDIRECTS: true,
    VERIFY_SSL: true, MAX_SCRIPT_CHAIN_DEPTH: 3, MAX_VARIABLE_NESTING: 10, SESSION_LOG_MAX_ENTRIES: 100 }
```

---

## Svelte Stores (Runes Pattern)

All stores use this pattern: module-level `$state` + `$derived` + exported object with getters + actions.

### `appStore` — `lib/stores/app.svelte.ts`

**State**: `activeWorkspaceId`, `openTabs: Tab[]`, `activeTabId`, `sidebarCollapsed`, `sidebarMode`, `sidebarSearch`, `tabStates: Record<string, TabRequestState>`

**Key types**:
- `Tab { id, type: 'request'|'environment', entityId, label, method?, pinned, isUnsaved }`
- `TabRequestState { name, method, url, headers, query_params, body, body_type, auth, scripts, response, loading }`

**Actions**: `openRequestTab`, `openEnvironmentTab`, `closeTab`, `closeOtherTabs`, `closeAllTabs`, `togglePinTab`, `setActiveTab`, `nextTab`, `prevTab`, `toggleSidebar`, `getTabState`, `updateTabState`, `markTabSaved`, `updateTabLabel`

**Session persistence**: Open tabs + active tab serialized to `app_settings` key `session.tabs.{workspaceId}` (debounced 500ms, scoped per workspace). Restored on mount after collections/environments load. Deleted entities silently skipped.

### `collectionsStore` — `lib/stores/collections.svelte.ts`

**State**: `collections`, `folders`, `requests`, `tree: TreeNode[]`, `expandedIds: Set`

**`TreeNode`**: `{ type: 'collection'|'folder'|'request', id, name, children, expanded, collectionId, parentId, method? }`

**Actions**: `loadAll`, `rebuildTree`, `toggleExpanded`, `createCollection/Folder/Request`, `renameCollection/Folder/Request`, `deleteCollection/Folder/Request`, `reloadCollection`, `getRequestById`, `getCollectionById`, `revealRequest`, `resolveDefaultEnvironment`

**`revealRequest(requestId)`**: Expands the collection and all ancestor folders so the request is visible in the sidebar tree.

**`resolveDefaultEnvironment(requestId)`**: Walks up the folder chain → collection, returns the first `default_environment_id` found (nearest folder wins).

### `environmentsStore` — `lib/stores/environments.svelte.ts`

**State**: `environments`, `activeEnvironmentId`

**Actions**: `loadAll`, `create`, `update`, `remove`, `activate`, `deactivate`, `getById`

### `settingsStore` — `lib/stores/settings.svelte.ts`

**State**: `allSettings: Record<string, string>`

**Actions**: `loadAll`, `get(key)`, `set(key, value)` — typed settings keys with IPC persistence. Used for app-wide preferences (layout orientation, timeout, SSL, history retention, etc.).

---

## Services

### Encryption (`services/encryption.ts`)
- `initEncryption()` → generates/loads 256-bit master key via Electron `safeStorage`, persists encrypted blob to `{userData}/master.key` with `0o600` file permissions
- Master key file uses `vxk1:` prefix to distinguish keychain-encrypted format from legacy plaintext (handles graceful migration)
- `encryptValue(plaintext)` → AES-256-CBC, returns base64(IV + ciphertext)
- `decryptValue(encrypted)` → reverse; uses string-mode `decipher.update()` to avoid Buffer concat issues
- `initEncryptionForTesting(key?)` → bypass safeStorage for Vitest
- **Repository-layer integration**: encryption is transparent at the repository layer — callers (IPC, services, UI) are unaware
  - **Settings**: `SENSITIVE_KEYS` set (`vault.token`, `vault.role_id`, `vault.secret_id`, `sync.token`) — encrypted on write, decrypted on read with try/catch fallback for pre-migration plaintext
  - **Environments**: variable values encrypted with `enc:` prefix — `encryptVariables()`/`decryptVariables()` in all CRUD paths
  - **Requests**: auth credentials (`bearer_token`, `basic_password`, `api_key_value`) encrypted with `enc:` prefix — `encryptAuth()`/`decryptAuth()` in all CRUD paths; double-encryption guard checks `enc:` prefix before encrypting
  - **Workspace settings**: sensitive fields in `workspaces.settings` JSON column encrypted/decrypted using the same key set as `app_settings`
  - **One-time migration**: `migrateToEncryptedStorage()` runs at startup, encrypts existing plaintext data, tracked by `encryption.migrated` setting

### Workspace-Scoped Settings (`database/repositories/workspaces.ts`)
- Stored in the existing `workspaces.settings TEXT` column as a JSON blob
- `getWorkspaceSettings(wsId)` → parse JSON, decrypt sensitive fields, return nested object
- `setWorkspaceSetting(wsId, key, value)` → read-modify-write; key uses dot-notation (e.g., `sync.provider`)
- `getWorkspaceSetting(wsId, key)` → convenience: dot-path into nested object
- Sensitive keys encrypted: `sync.token`, `vault.token`, `vault.role_id`, `vault.secret_id`
- **Fallback pattern**: Services (`getProvider`) try workspace settings first, fall back to global `app_settings` if workspace has no config for that domain
- Provider cache invalidation: `ipc/settings.ts` monitors `PROVIDER_KEYS` set and calls `resetVaultProvider()` when relevant keys change

### HTTP Proxy (`ipc/proxy.ts`)
- Uses Node `fetch` with `AbortController` per request ID
- Handles all body types: string body (json/xml/raw/urlencoded/graphql), `FormData` (form-data with file support)
- Auto-sets Content-Type headers unless user overrides
- Parses `set-cookie` response headers into structured `ResponseCookie[]`
- Returns timing: `{ start, ttfb, total }` via `performance.now()`
- **Substitutes `{{variables}}`** in URL, headers (keys+values), body, form-data text values before sending
- **Pre-request scripts**: executes dependent requests before main send
- **Post-response scripts**: extracts values and sets collection variables after response
- **Auto-saves history** to `request_histories` table (try/catch — doesn't fail the request)
- **Logs** all requests to session log (success/error)

### Variable Substitution (`services/variable-substitution.ts`)
- `getResolvedVariables(wsId?, colId?)` → flat `Record<string, string>` (env vars + collection overrides)
- `getResolvedVariablesWithSource(wsId?, colId?)` → `Record<string, { value, source }>` for tooltips
- `substitute(text, wsId?, colId?)` → resolve `{{varName}}` in text
- `substituteRecord(record, wsId?, colId?)` → resolve vars in both keys and values
- Nested reference resolution up to `MAX_VARIABLE_NESTING` (10) iterations
- Priority: active environment vars (base) → collection vars (override)

### Script Execution (`services/script-execution.ts`)
- **Pre-request**: `executePreRequestScripts(reqId, colId, wsId?)` — fires dependent requests before the main one
- **Post-response**: `executePostResponseScripts(reqId, colId, response, wsId?)` — extracts values from response and sets collection variables
- Circular dependency detection via execution stack
- Max chain depth: `DEFAULTS.MAX_SCRIPT_CHAIN_DEPTH` (3)
- `extractValue(source, status, body, headers)` — supports `status`, `header.Name`, `body.key.nested[0].id`
- `extractJsonPath(data, path)` — dot-notation with `[n]` array index support
- Mirrors extracted values to active environment if key exists there

### Code Generator (`services/code-generator.ts`)
- `generateCode(language, data, wsId?, colId?)` — generates code snippet from request data
- Languages: curl, Python (requests), PHP (Laravel HTTP), JavaScript (fetch), Node.js (axios)
- Applies variable substitution before generating
- Handles all body types + auth types

### Session Log (`services/session-log.ts`)
- In-memory ring buffer, max `DEFAULTS.SESSION_LOG_MAX_ENTRIES` (100) entries
- Entry: `{ id, category, type, target, message, success, timestamp }`
- Categories: `http`, `sync` (displayed as "git"), `vault`, `system`
- Pushes new entries to renderer via `BrowserWindow.webContents.send(IPC.LOG_PUSH)`
- Convenience helpers: `logSync()`, `logVault()`, `logHttp()`, `logSystem()`

### YAML Serializer (`services/yaml-serializer.ts`)
- `serializeToDirectory(collection, options?)` → `Record<path, yamlContent>` file map
- `serializeRequest(request, options?)` → YAML string
- `importFromDirectory(files, existingId?, workspaceId?)` → collection ID (creates or updates)
- Directory structure: `{uuid}/_collection.yaml`, `_manifest.yaml`, `{reqUuid}.yaml`, `{folderUuid}/_folder.yaml`
- Manifest files track folder/request ordering
- Environment hints: vault_path-based cross-machine environment ID resolution
- `validateEnvironmentIds()` handles `environment_ids` as both YAML arrays and JSON strings (backward compat with Laravel app)
- `sanitize` option strips sensitive data via `sanitizeRequestData()`/`sanitizeCollectionData()`
- Strips local file references from form-data before sync
- `parseYaml()` validates non-null/non-empty returns; `serializeRequest()` wraps JSON.parse of scripts/auth in try/catch

### Sensitive Data Scanner (`services/sensitive-data-scanner.ts`)
- `scanRequest(request)` → `SensitiveFinding[]` — scans auth, headers, params, body
- `scanCollection(requests, variables)` → `SensitiveFinding[]` — scans all requests (using decrypted data from repository) + collection variables
- `sanitizeRequestData(data)` / `sanitizeCollectionData(data)` — blanks sensitive values, preserves `{{var}}` references
- Extensive sensitive key lists: auth tokens, API keys, passwords, cloud keys, PII
- Recursive JSON body scanning

### Git Providers (`sync/github-provider.ts`, `sync/gitlab-provider.ts`)
- Both implement `GitProvider` interface from `sync/git-provider.interface.ts`
- **GitHub**: Git Data API (trees for listing, blob+tree+commit+ref for atomic multi-file commits), Contents API for single files. Paths passed directly to Contents API (no `encodeURIComponent` — GitHub handles slashes natively).
- **GitLab**: Repository API v4 (tree listing, Files API, Commits API with actions array for atomic commits). Uses `encodeURIComponent` per GitLab's file path encoding requirement.
- Key difference: GitHub uses blob SHA for conflict detection, GitLab uses `last_commit_id`
- Both: `listDirectoryRecursive()`, `getDirectoryTree()`, `getFile()`, `createFile()`, `updateFile()`, `deleteFile()`, `deleteDirectory()`, `commitMultipleFiles()`, `testConnection()`

### Remote Sync Service (`sync/remote-sync-service.ts`)
- Settings keys: `sync.provider`, `sync.repository`, `sync.token`, `sync.branch` — read via workspace settings with global fallback (transparent decryption)
- `getProvider(workspaceId?)` → creates git provider from workspace-scoped config, falls back to global `app_settings`
- `pull(workspaceId?)` → `SyncResult` — pulls all collections, detects conflicts, collects per-collection errors
- `pushCollection(collection, sanitize?, workspaceId?)` — 3-way merge per file, atomic commit
- `pushAll(workspaceId?)` → `SyncResult` — pushes all dirty/unsynced collections (scoped to workspace)
- `pullSingleCollection(collection, workspaceId?)` — pulls one collection
- `pushSingleRequest(collection, requestId, sanitize?, workspaceId?)` — granular single-file push
- `forceKeepLocal(collection, workspaceId?)` / `forceKeepRemote(collection, workspaceId?)` — conflict resolution
- `deleteRemoteCollection(collection, workspaceId?)` — removes from remote
- `SyncConflictError` class for conflict detection
- File state: `{path: {content_hash, remote_sha, commit_sha}}` with backward-compat normalization
- Blob SHA computed locally: `SHA-1("blob {size}\0{content}")` — avoids extra API call after push
- `buildFolderPath()` has cycle detection via `visited` Set to prevent infinite loops from data corruption

### HashiCorp Vault Provider (`vault/hashicorp-vault-provider.ts`)
- Implements `SecretsProvider` interface from `vault/secrets-provider.interface.ts`
- KV v2 API: `listSecrets()` (GET with `?list=true`), `getSecrets()`, `putSecrets()`, `deleteSecrets()`
- Auth methods: token (direct) or AppRole (login to get token)
- `X-Vault-Namespace` header sent on ALL operations (auth and data) when configured — required for Vault Enterprise
- `testConnection()` — token: lookup-self, AppRole: login attempt
- AppRole login validates response: guards against null `json.auth` with explicit error
- Static factory: `HashiCorpVaultProvider.create(opts)` handles async AppRole login
- SSL bypass: when `verifySsl` is false, uses undici `Agent({ connect: { rejectUnauthorized: false } })` — all HTTP calls route through `this.fetch()` wrapper which dispatches via undici when the custom Agent is present

### Vault Sync Service (`vault/vault-sync-service.ts`)
- Settings keys: `vault.provider`, `vault.url`, `vault.auth_method`, `vault.token`, `vault.role_id`, `vault.secret_id`, `vault.namespace`, `vault.mount`, `vault.verify_ssl` — read from workspace settings with global fallback
- `vault.verify_ssl` parsed as boolean: `'0'` and `'false'` both mean SSL verification off (UI stores `String(boolean)`)
- `getProvider(workspaceId?)` → reads vault config from workspace settings (with global fallback), returns cached `SecretsProvider` (cache keyed by `workspaceId ?? '__global__'`)
- `fetchVariables(envId, workspaceId?)` → get secrets from Vault, return as `EnvironmentVariable[]` (cached 60s)
- `pushVariables(envId, vars, workspaceId?)` → push enabled variables to Vault
- `deleteSecrets(envId, workspaceId?)` → remove secrets for an environment
- `pullAll(wsId?)` → list all secrets at mount root, create environments for untracked paths (uses returned ID from create, not name scan)
- `migrateEnvironment(envId, oldPath, newPath, workspaceId?)` → copy secrets to new path, delete old
- `resetProvider(workspaceId?)` → invalidate provider cache (called automatically when vault settings change)
- `buildPath(env)` → uses `vault_path` if set, otherwise slugifies environment name

### Data Export/Import (`services/data-export-import.ts`)
- Export: `exportAll(wsId?)`, `exportCollections(wsId?)`, `exportEnvironments(wsId?)`, `exportConfig()`
- All exports return: `{ vaxtly_export: true, version: 1, type, exported_at, data }`
- `importData(json, wsId?)` → detects type, dispatches to importCollections/Environments/Config
- Collections exported with nested folder tree + requests; vault-synced environments export with empty variables
- Config export covers `sync.*` and `vault.*` settings (tokens NOT exported)
- Unique name generation for duplicate collections/environments

### Postman Import (`services/postman-import.ts`)
- `importPostman(json, wsId?)` → `PostmanImportResult`
- Three Postman formats detected automatically:
  - **Workspace dump**: `version` + `collections[]` — flat folder/request arrays with parent ID references, multi-pass resolution
  - **Collection v2.1**: `info._postman_id`/`info.schema` — recursive `item` tree (folders have `item[]`, requests have `request`)
  - **Environment**: `_postman_variable_scope = 'environment'` or `values[]` + `name`
- Body type mapping: raw→json/xml/raw, urlencoded, formdata→form-data, graphql
- URL extraction handles both string URLs and Postman URL objects (with host/path arrays)

### CodeMirror Variable Highlighting (`lib/utils/variable-highlight.ts`)
- `variableHighlight(getResolved)` → CodeMirror `Extension` (decoration + tooltip)
- Resolved variables: green text + green bg (`cm-var-resolved`)
- Unresolved variables: red text + red bg (`cm-var-unresolved`)
- Hover tooltip shows value and source label

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+, | Open settings |
| Cmd/Ctrl+N | New request (in first collection) |
| Cmd/Ctrl+S | Save current request |
| Cmd/Ctrl+W | Close active tab (unless pinned) |
| Cmd/Ctrl+Enter | Send request |
| Cmd/Ctrl+B | Toggle sidebar |
| Cmd/Ctrl+L | Focus URL input (planned) |
| Ctrl+PageDown | Next tab |
| Ctrl+PageUp | Previous tab |
| F1 | Open user manual |

---

## App-Level Reactive Behaviors (`App.svelte`)

Three `$effect` hooks in `App.svelte` drive cross-cutting UX behaviors:

1. **Session save**: Watches `openTabs.length` + `activeTabId`, debounce-writes to `session.tabs.{workspaceId}` setting (skipped until initial restore completes via `sessionRestored` flag). Sessions are scoped per workspace.
2. **Sidebar auto-reveal**: When active tab changes — request tabs: expands ancestor tree nodes + switches sidebar to "collections"; environment tabs: switches sidebar to "environments".
3. **Default environment auto-activation**: When a request tab becomes active, resolves the nearest `default_environment_id` (folder chain → collection) and activates it if different from current.

---

## Design System

### Color Tokens (Tailwind v4 `@theme`)

**Brand** (blue): `brand-50` through `brand-900` (based on blue-50..blue-900)
**Surface** (slate): `surface-50` through `surface-950` (based on slate-50..slate-950)

### HTTP Method Colors
| Method | Text Class | Background Class |
|--------|-----------|-----------------|
| GET | `text-green-400` | `bg-green-500/15` |
| POST | `text-amber-400` | `bg-amber-500/15` |
| PUT | `text-blue-400` | `bg-blue-500/15` |
| PATCH | `text-purple-400` | `bg-purple-500/15` |
| DELETE | `text-red-400` | `bg-red-500/15` |
| HEAD | `text-teal-400` | `bg-teal-500/15` |
| OPTIONS | `text-gray-400` | `bg-gray-500/15` |

### Status Code Colors
- 2xx: `text-green-400` / `bg-green-500/15`
- 3xx: `text-blue-400` / `bg-blue-500/15`
- 4xx: `text-amber-400` / `bg-amber-500/15`
- 5xx: `text-red-400` / `bg-red-500/15`
- 0/error: `text-red-400` / `bg-red-500/15`

---

## Boot Sequence (`main/index.ts`)

```
1. initEncryption()              — Load/create master key from OS keychain (vxk1: prefix, 0o600 perms)
2. openDatabase(dbPath)          — Open SQLite + run pending migrations
3. migrateToEncryptedStorage()   — One-time: encrypt existing plaintext sensitive data
4. ensureDefaultWorkspace()      — Create "Default Workspace" if table is empty
5. registerAllIpcHandlers()      — Register all domain handlers (incl. workspace-settings, histories, session-log, code-generator)
6. pruneHistories()              — Auto-prune old request histories based on retention setting (default 30 days)
7. buildMenu()                   — Set native application menu (using IPC.MENU_* constants)
8. createWindow()                — BrowserWindow with preload script
9. runAutoSync()                 — On ready-to-show: vault pullAll + git pull if auto_sync enabled
```

---

## Build Configuration

- **electron-builder.yml**: configures packaging for macOS (dmg/zip), Windows (nsis), Linux (AppImage/deb)
- **`asarUnpack`**: `better-sqlite3` native module unpacked from asar archive (required for native addons)
- **Icons**: `build/icon.icns` (macOS), `build/icon.ico` (Windows), `build/icon.png` (Linux 512×512)
- **Linux `artifactName`**: includes `${arch}` for multi-architecture builds
- **macOS notarization**: `build/notarize.js` (CJS) — runs `@electron/notarize` as afterSign hook; errors propagate to fail the build
- **Dependencies**: `uuid` pinned to v9 (CJS-compatible; v13+ is pure ESM, incompatible with Electron main process)

## Build & Test Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Hot-reload dev server (electron-vite dev) |
| `npm run build` | Production build → `out/` |
| `npm run test` | Vitest single run |
| `npm run test:watch` | Vitest watch mode |

---

## Migration Status

| Phase | Status | Description |
|-------|--------|-------------|
| **0: Foundation** | COMPLETE | Database, encryption, IPC, repos, 26 tests |
| **1: Core Request Builder** | COMPLETE | Sidebar tree, tabs, request builder, response viewer, all body/auth types, keyboard shortcuts |
| **2: Environments + Variables** | COMPLETE | Variable substitution service, proxy integration, environment sidebar + editor tabs, CodeMirror `{{var}}` highlighting, 12 new tests |
| **3: Scripting + History + Code Gen** | COMPLETE | Pre/post-request scripts, request history auto-save/prune, code generation (5 languages), session log, SystemLog panel, CodeSnippetModal, 29 new tests |
| **4: Git Sync** | COMPLETE | YAML serializer, sensitive data scanner, GitHub/GitLab providers, remote sync service, sync IPC, 40 tests. UI: RemoteSyncTab, ConflictModal, SensitiveDataModal, sync indicators on sidebar. |
| **5: Vault + Import/Export** | COMPLETE | Vault provider + sync, data export/import, Postman import, vault IPC, 28 tests. UI: VaultTab, DataTab, vault sync in EnvironmentEditor, drag-drop, WelcomeGuide, HtmlPreview. |
| **Pre-release hardening** | COMPLETE | Workspace-scoped sync/vault settings, draggable request/response splitter, session-per-workspace, encryption hardening (key prefix, file perms, double-encryption guard), vault namespace on all ops, cycle detection, async cancellation, pointer events, accessibility, build config fixes (asarUnpack, uuid CJS, notarize CJS). 37+ issues resolved across 25 files. |

---

## Known Issues / TODOs

- No E2E tests (Playwright planned)
- SQLCipher not yet integrated (requires `libcrypto` — using plain better-sqlite3 + field-level AES-256-CBC encryption at the repository layer)
- `better-sqlite3` native module must be rebuilt when switching between Electron (`npx electron-rebuild -f -w better-sqlite3`) and system Node.js (`npm rebuild better-sqlite3`) for tests
- AppRole token auto-refresh not implemented — tokens expire, requiring manual reconnect (deferred: low-priority edge case)
- `contextIsolation: false` in BrowserWindow — should evaluate enabling sandbox for hardened security (deferred: requires preload refactor)
- GitLab provider `listDirectoryRecursive` doesn't handle pagination for repos with 100+ files per directory (deferred: rare edge case)

## Resolved Issues (Post Phase 5)

- **Settings key mismatch**: backend sync service read `remote.*` keys while UI saved `sync.*` — unified to `sync.*`
- **Missing vault.provider**: VaultTab never set `vault.provider` on save — provider creation silently failed
- **GitHub path encoding**: `encodeURIComponent()` on Contents API paths encoded slashes, causing 404s
- **Vault LIST method**: changed from HTTP `LIST` to `GET ?list=true` for broader compatibility
- **environment_ids type mismatch**: old Laravel app stored as JSON string, YAML import assumed array — now handles both
- **Pull error messages swallowed**: errors were overwritten by "Everything up to date" — now collected and reported
- **Vault SSL bypass broken**: `verify_ssl` setting stored as `'false'` but only `'0'` was checked; also required undici Agent for actual TLS bypass (Node's `NODE_TLS_REJECT_UNAUTHORIZED` doesn't affect Electron's fetch)
- **UI not refreshing after vault pull**: environments store not reloaded after pullAll — now calls `environmentsStore.loadAll()`

## Resolved Issues (Pre-Release Audit)

- **C1 — better-sqlite3 asar**: added `asarUnpack` for native module in `electron-builder.yml`
- **C2 — uuid ESM**: downgraded `uuid` from v13 (pure ESM) to v9 (CJS-compatible)
- **C3 — sql.js leftover**: removed unused `sql.js` dependency
- **C4 — decryptValue Buffer concat**: fixed AES decryption using string-mode `decipher.update()` to avoid Buffer encoding issues
- **H1 — session per workspace**: sessions scoped to `session.tabs.{workspaceId}` key
- **H2 — vault/sync cache invalidation**: provider caches cleared when relevant settings change (both global and workspace-scoped)
- **H3 — double decryption**: removed duplicate `safeStorage.decryptString()` call in `initEncryption()`
- **H4 — master.key permissions**: file written with `0o600` and `chmodSync` applied
- **H5 — key format marker**: `vxk1:` prefix distinguishes keychain-encrypted vs legacy plaintext master key files
- **H6 — sensitive scan on encrypted data**: scanner now reads via `requestsRepo.findByCollection()` (decrypted) instead of raw DB
- **H8 — vault namespace header**: `X-Vault-Namespace` sent on ALL operations, not just AppRole auth
- **H9 — AppRole null guard**: `loginWithAppRole` validates `json.auth?.client_token` before use
- **H10 — YAML parse validation**: `parseYaml()` validates non-null returns
- **H11 — notarize.js errors**: converted to CJS, errors re-thrown instead of swallowed
- **H13 — EnvironmentEditor workspace**: all vault operations pass `workspaceId`
- **M1 — workspace switch ordering**: `closeAllTabs()` called before `setActiveWorkspace()` to prevent stale entity lookups
- **M3 — double-encryption guard**: `encryptAuth()` checks `enc:` prefix before encrypting
- **M4 — menu channel constants**: hardcoded strings in `menu.ts` and `preload.ts` replaced with `IPC.MENU_*` constants
- **M5 — GraphQL variables**: body sends `{ query, variables: {} }` correctly
- **M6 — rename tab label**: `RequestItem.commitRename()` updates open tab label via `appStore.updateTabLabel()`
- **M7 — splitPercent reset**: resets to 50 when layout orientation changes
- **M8 — history index**: added `CREATE INDEX idx_histories_executed_at ON request_histories(executed_at)` for prune performance
- **M11 — pullAll ID lookup**: uses returned ID from `environmentsRepo.create()` instead of post-hoc name scan
- **M12 — folder path cycle**: `buildFolderPath()` uses `visited` Set to detect circular parent references
- **M17 — async effect guard**: `RequestBuilder` `$effect` uses cancellation flag to prevent stale async updates
- **M18 — serializeRequest JSON**: `JSON.parse` of scripts/auth wrapped in try/catch
- **M20 — pushAll scope**: workspace query correctly scopes to `workspace_id = ?` or `workspace_id IS NULL`
- **L2 — platform detection**: replaced deprecated `navigator.platform` with `navigator.userAgent`
- **L4 — Linux artifact name**: includes `${arch}` for multi-architecture builds
- **L6 — Modal accessibility**: close button has `aria-label="Close"`
- **L7 — SystemLog pointer events**: drag resize uses Pointer Events API with `setPointerCapture`
- **L8 — saveTimer cleanup**: `clearTimeout(saveTimer)` in App.svelte cleanup
- **L9 — splitter pointercancel**: `onpointercancel` handler prevents stuck drag state
