# Vaxtly — Architecture Reference

> A fast, native API client for developers. Built with Electron, TypeScript, and Svelte 5.
> This document is the single source of truth for the project's architecture.

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
| Auto-update | electron-updater | 6 |
| Encryption | Electron safeStorage + AES-256-GCM | — |
| Tests (unit) | Vitest | 4 |
| Tests (e2e) | Playwright Electron | 1 |
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
│   │   │   ├── updater.ts            # Auto-update: check, install, install-source
│   │   │   └── settings.ts
│   │   ├── services/
│   │   │   ├── encryption.ts           # safeStorage master key + AES-256-GCM (CBC backward compat)
│   │   │   ├── variable-substitution.ts # {{var}} resolution, nested refs, env+collection merge
│   │   │   ├── script-execution.ts     # Pre/post-request scripts, dependent request chains
│   │   │   ├── code-generator.ts       # Code snippet generation (5 languages)
│   │   │   ├── session-log.ts          # In-memory ring buffer, push to renderer
│   │   │   ├── yaml-serializer.ts      # Collection ↔ YAML directory serialization/import
│   │   │   ├── fetch-error.ts            # Shared formatFetchError (SSL, DNS, timeout, etc.)
│   │   │   ├── sensitive-data-scanner.ts # Scan/sanitize sensitive data in requests & variables
│   │   │   ├── data-export-import.ts  # Export/import collections, environments, config
│   │   │   ├── postman-import.ts      # Import Postman collections/environments (3 formats)
│   │   │   └── updater.ts            # electron-updater: init, check, quit-and-install, install-source detection
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
│       │       ├── http-colors.ts      # getMethodColor(), getStatusColor() → CSS variable strings
│       │       ├── formatters.ts       # formatSize, formatTime, detectLanguage, formatBody
│       │       └── variable-highlight.ts # CodeMirror {{var}} decoration + hover tooltip
│       └── components/
│           ├── CodeEditor.svelte       # CodeMirror 6 wrapper + optional variable highlight
│           ├── layout/
│           │   ├── Sidebar.svelte      # Mode tabs (Collections/Environments) + search + tree + footer toolbar
│           │   ├── TabBar.svelte       # Horizontal tabs + env icon for environment tabs
│           │   └── SystemLog.svelte    # Collapsible bottom panel: logs + request history
│           ├── sidebar/
│           │   ├── CollectionTree.svelte # Recursive tree with search filter
│           │   ├── CollectionItem.svelte # Expand/collapse, rename, sync, drag-drop target + auto-sync on move
│           │   ├── FolderItem.svelte    # Same pattern, self-recursive, drag-drop target + auto-sync on move
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
│           │   └── EnvironmentEditor.svelte # Name, active toggle, variables, Save button, vault sync
│           ├── response/
│           │   ├── ResponseViewer.svelte  # Status bar + Body/Headers/Cookies/Preview tabs
│           │   ├── ResponseBody.svelte    # Read-only CodeMirror, auto-detect language
│           │   ├── ResponseHeaders.svelte # Key-value list
│           │   ├── ResponseCookies.svelte # Cookie cards with attributes
│           │   └── HtmlPreview.svelte     # Sandboxed iframe (blob: URL, empty sandbox) HTML response preview
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
│   ├── unit/
│   │   ├── repositories.test.ts        # 34 tests: all repos + encryption + workspace settings
│   │   ├── variable-substitution.test.ts # 20 tests: variable resolution + vault-synced cache reads
│   │   ├── script-execution.test.ts    # 40 tests: extractValue + extractJsonPath + executePostResponseScripts + vault mirror
│   │   ├── code-generator.test.ts      # 17 tests: 5 languages + all auth/body types
│   │   ├── sensitive-data-scanner.test.ts # 24 tests: scan + sanitize + api-key + urlencoded
│   │   ├── yaml-serializer.test.ts     # 12 tests: serialize + import + auth/scripts + sanitize
│   │   ├── remote-sync.test.ts         # 18 tests: file state + isConfigured + getProvider
│   │   ├── vault-sync.test.ts          # 14 tests: buildPath + isConfigured + resetProvider + in-memory cache
│   │   ├── vault-e2e.test.ts          # 12 tests: end-to-end vault in-memory flows (fresh install, auto-sync, cold cache, scripts)
│   │   ├── vault-handlers.test.ts     # 20 tests: vault IPC handlers + cache-first push
│   │   ├── data-export-import.test.ts  # 15 tests: export + import + nested + workspace
│   │   ├── postman-import.test.ts      # 14 tests: 3 formats + form-data + URL objects + XML
│   │   ├── encryption.test.ts          # 6 tests: round-trip, random IV, wrong key
│   │   ├── fetch-error.test.ts         # 13 tests: all error branches (SSL, DNS, timeout, etc.)
│   │   ├── session-log.test.ts         # 6 tests: ring buffer, categories, copy safety
│   │   └── proxy-helpers.test.ts       # 8 tests: parseCookies + setDefaultHeader + deleteHeader
│   └── e2e/
│       ├── fixtures/
│       │   ├── electron-app.ts         # Shared fixture: temp userData, app launch, cleanup
│       │   └── test-server.ts          # Local HTTP echo server (127.0.0.1:0)
│       ├── smoke.spec.ts              # 3 tests: boot, sidebar, empty state
│       ├── keyboard-shortcuts.spec.ts # 4 tests: Ctrl+N/W/B/,
│       ├── collection-crud.spec.ts    # 4 tests: create/rename/add-request/delete
│       ├── send-request.spec.ts       # 6 tests: GET, POST+JSON, error, 404, 500, custom headers
│       ├── settings.spec.ts           # 3 tests: tabs, Escape, close button
│       ├── environment-vars.spec.ts   # 2 tests: create env+var, use {{var}}
│       └── session-persistence.spec.ts # 1 test: tabs survive restart
├── electron.vite.config.ts             # 3-target build (main, preload, renderer)
├── playwright.config.ts                # E2E config: workers:1, timeout:30s
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
| variables | TEXT NOT NULL | '[]' | JSON `EnvironmentVariable[]` — values encrypted with `enc:` prefix; always `'[]'` for vault-synced envs (secrets held in-memory only) |
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
| value | TEXT NOT NULL | Sensitive keys (`vault.token`, `vault.role_id`, `vault.secret_id`, `sync.token`) stored as AES-256-GCM encrypted base64 |

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
| `data:pick-and-read` | ipc/data-import-export.ts | `dialog.showOpenDialog()` + `readFileSync()` | `api.data.pickAndRead()` |
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

| `update:check` | ipc/updater.ts | `checkForUpdates()` | `api.updater.check()` |
| `update:install` | ipc/updater.ts | `quitAndInstall()` | `api.updater.install()` |
| `update:install-source` | ipc/updater.ts | `getInstallSource()` | `api.updater.installSource()` |
| `update:available` | — (main→renderer push) | — | `api.on.updateAvailable(cb)` |
| `update:progress` | — (main→renderer push) | — | `api.on.updateProgress(cb)` |
| `update:downloaded` | — (main→renderer push) | — | `api.on.updateDownloaded(cb)` |
| `update:error` | — (main→renderer push) | — | `api.on.updateError(cb)` |

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

**Actions**: `loadAll`, `rebuildTree`, `toggleExpanded`, `expandAll`, `collapseAll`, `createCollection/Folder/Request`, `renameCollection/Folder/Request`, `deleteCollection/Folder/Request`, `reloadCollection`, `getRequestById`, `getCollectionById`, `revealRequest`, `resolveDefaultEnvironment`

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
- `encryptValue(plaintext)` → AES-256-GCM, returns `gcm:` + base64(IV[12] + authTag[16] + ciphertext)
- `decryptValue(encrypted)` → detects format: `gcm:` prefix → AES-256-GCM; otherwise → legacy AES-256-CBC fallback for backward compatibility
- `initEncryptionForTesting(key?)` → bypass safeStorage for Vitest
- **Repository-layer integration**: encryption is transparent at the repository layer — callers (IPC, services, UI) are unaware
  - **Settings**: `SENSITIVE_KEYS` set (`vault.token`, `vault.role_id`, `vault.secret_id`, `sync.token`) — encrypted on write, decrypted on read with try/catch fallback for pre-migration plaintext
  - **Environments**: variable values encrypted with `enc:` prefix — `encryptVariables()`/`decryptVariables()` in all CRUD paths
  - **Requests**: auth credentials (`bearer_token`, `basic_username`, `basic_password`, `api_key_value`) encrypted with `enc:` prefix — `encryptAuth()`/`decryptAuth()` in all CRUD paths; double-encryption guard checks `enc:` prefix before encrypting
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

### Fetch Error Formatting (`services/fetch-error.ts`)
- `formatFetchError(error, url?)` → user-friendly error message from undici/fetch errors
- Unwraps `error.cause.code` for descriptive messages: SSL certificate errors, DNS lookup failures, connection refused, EHOSTUNREACH, timeouts, abort signals
- Shared by proxy handler and vault IPC handlers

### HTTP Proxy (`ipc/proxy.ts`)
- Uses Node `fetch` with `AbortController` per request ID
- Handles all body types: string body (json/xml/raw/urlencoded/graphql), `FormData` (form-data with file support)
- Auto-sets Content-Type headers unless user overrides
- Parses `set-cookie` response headers into structured `ResponseCookie[]`
- Returns timing: `{ start, ttfb, total }` via `performance.now()`
- **Vault cache**: calls `ensureLoaded()` for vault-synced active environments before substitution (handles cold-cache on first request after app start without auto-sync)
- **Substitutes `{{variables}}`** in URL, headers (keys+values), body, form-data text values before sending
- **Pre-request scripts**: executes dependent requests before main send
- **Post-response scripts**: extracts values and sets collection variables after response
- **Auto-saves history** to `request_histories` table (try/catch — doesn't fail the request)
- **Logs** template URL (not resolved URL with secrets) to session log; error bodies use `error.message` (not stack traces)
- **Security validation**: URL scheme whitelist (http/https only), HTTP method whitelist, timeout clamped 1-300s, response body size limit 50MB (content-length check), form-data file paths validated against dialog-approved set

### Variable Substitution (`services/variable-substitution.ts`)
- `getResolvedVariables(wsId?, colId?)` → flat `Record<string, string>` (env vars + collection overrides)
- `getResolvedVariablesWithSource(wsId?, colId?)` → `Record<string, { value, source }>` for tooltips
- `substitute(text, wsId?, colId?)` → resolve `{{varName}}` in text
- `substituteRecord(record, wsId?, colId?)` → resolve vars in both keys and values
- Nested reference resolution up to `MAX_VARIABLE_NESTING` (10) iterations
- Priority: active environment vars (base) → collection vars (override)
- **Vault-synced environments**: when `vault_synced === 1`, reads variables from in-memory cache (`getCachedVariables`) instead of parsing the DB `variables` field (which is always `'[]'`)

### Script Execution (`services/script-execution.ts`)
- **Pre-request**: `executePreRequestScripts(reqId, colId, wsId?)` — fires dependent requests before the main one
- **Post-response**: `executePostResponseScripts(reqId, colId, response, wsId?)` — extracts values from response and sets collection variables
- Circular dependency detection via per-chain execution stack (no shared global state)
- Max chain depth: `DEFAULTS.MAX_SCRIPT_CHAIN_DEPTH` (3)
- `extractValue(source, status, body, headers)` — supports `status`, `header.Name`, `body.key.nested[0].id`
- `extractJsonPath(data, path)` — dot-notation with `[n]` array index support
- Mirrors extracted values to active environment if key exists there — for vault-synced environments, updates in-memory cache and pushes to Vault (fire-and-forget) instead of writing to DB

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
- `validateEnvironmentIds()` handles `environment_ids` as both YAML arrays and JSON strings
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
- **GitLab**: Repository API v4 (tree listing with pagination via `x-next-page` header, Files API, Commits API with actions array for atomic commits). Uses `encodeURIComponent` per GitLab's file path encoding requirement.
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
- KV v2 + v1 API: `listSecrets()` tries 4 strategies (v2 LIST, v2 GET?list=true, v1 LIST, v1 GET?list=true), `getSecrets()`, `putSecrets()`, `deleteSecrets()`
- Auth methods: token (direct) or AppRole (login to get token)
- `X-Vault-Namespace` header sent only during AppRole login — NOT on data operations. For namespaced engines, include the full namespace path in the `mount` (engine path) setting instead.
- `testConnection()` — token: lookup-self, AppRole: login attempt; also queries `/v1/sys/mounts` to verify the configured mount exists
- AppRole login validates response: guards against null `json.auth` with explicit error
- **AppRole token auto-refresh**: on 403 responses, automatically re-authenticates via AppRole login and retries the request once
- Static factory: `HashiCorpVaultProvider.create(opts)` handles async AppRole login
- SSL bypass: when `verifySsl` is false, uses undici `Agent({ connect: { rejectUnauthorized: false } })` — all HTTP calls route through `this.fetch()` wrapper which dispatches via undici when the custom Agent is present

### Vault Sync Service (`vault/vault-sync-service.ts`)
- **In-memory only**: vault secrets are never written to the local SQLite DB. The DB stores vault metadata (`vault_synced`, `vault_path`, `name`) but `variables` is always `'[]'` for vault-synced environments. Secrets live in a session-lifetime in-memory cache (`Map<string, EnvironmentVariable[]>`)
- Settings keys: `vault.provider`, `vault.url`, `vault.auth_method`, `vault.token`, `vault.role_id`, `vault.secret_id`, `vault.namespace` (AppRole login only), `vault.mount` (full engine path incl. namespaces), `vault.verify_ssl` — read from workspace settings with global fallback
- `vault.verify_ssl` parsed as boolean: `'0'` and `'false'` both mean SSL verification off (UI stores `String(boolean)`)
- `getProvider(workspaceId?)` → reads vault config from workspace settings (with global fallback), returns cached `SecretsProvider` (cache keyed by `workspaceId ?? '__global__'`)
- `fetchVariables(envId, workspaceId?)` → get secrets from Vault, return as `EnvironmentVariable[]`, populate in-memory cache (session-lifetime, no TTL)
- `pushVariables(envId, vars, workspaceId?)` → push enabled variables to Vault, update in-memory cache
- `deleteSecrets(envId, workspaceId?)` → remove secrets for an environment, clear cache
- `pullAll(wsId?)` → list all secrets at mount root, create environments for untracked paths with `variables: '[]'`, populate in-memory cache for all environments
- `migrateEnvironment(envId, oldPath, newPath, workspaceId?)` → copy secrets to new path, delete old
- `resetProvider(workspaceId?)` → invalidate provider cache + clear secrets cache (called automatically when vault settings change)
- `buildPath(env)` → uses `vault_path` if set, otherwise slugifies environment name
- `getCachedVariables(envId)` → read cached secrets (returns `null` if not cached)
- `setCachedVariables(envId, vars)` → update cached secrets (used by script-execution mirroring)
- `ensureLoaded(envId, wsId?)` → fetch from Vault if not already cached (used by proxy handler before variable substitution)

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

### Auto-Updater (`services/updater.ts`)
- Uses `electron-updater` (`autoUpdater`) for update detection across all platforms
- **Dev guard**: `initUpdater()` and `checkForUpdates()` are no-ops when `!app.isPackaged`
- **Install source detection**: `getInstallSource()` returns `'brew' | 'scoop' | 'standalone'`
  - macOS always returns `'brew'`
  - Windows: checks `app.getPath('exe')` for `scoop\apps` → `'scoop'`, otherwise `'standalone'`
  - Linux always returns `'standalone'`
- **Package-managed installs** (Homebrew / Scoop): `autoDownload = false`, `autoInstallOnAppQuit = false`, `quitAndInstall()` is a no-op — user updates via their package manager
- **Standalone installs**: `autoDownload = true` — downloads in background, then offers quit-and-install
- Events pushed to renderer via `BrowserWindow.getAllWindows()`:
  - `update:available` → `{ version, releaseName }`
  - `update:progress` → `{ percent }` (standalone only)
  - `update:downloaded` → `{ version }`
  - `update:error` → error message string
- `checkForUpdates()` called automatically on `ready-to-show` and manually via menu/settings
- **App.svelte banner**: install-source-aware top banner — Homebrew shows `brew upgrade vaxtly` + copy button; Scoop shows `scoop update vaxtly` + copy button; standalone shows download progress bar → "Restart now" button; dismissible
- **GeneralTab**: "Check for updates" button in About section with checking/available/up-to-date/error states; 15s timeout assumes up-to-date if no event received
- **CI**: `update-scoop` job in `build.yml` computes SHA256 of `Vaxtly-{version}-setup.exe` and pushes manifest to `vaxtly/scoop-bucket/bucket/vaxtly.json` (mirrors the `update-homebrew` pattern)
- **Snap Store**: Linux snap built by electron-builder and published to the `stable` channel on snapcraft.io during the build step (via `SNAPCRAFT_STORE_CREDENTIALS` secret). Snap updates are handled automatically by `snapd` on user machines.

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

Four `$effect` hooks in `App.svelte` drive cross-cutting UX behaviors:

1. **Session save**: Watches `openTabs.length` + `activeTabId`, debounce-writes to `session.tabs.{workspaceId}` setting (skipped until initial restore completes via `sessionRestored` flag). Sessions are scoped per workspace.
2. **Sidebar auto-reveal**: When active tab changes — request tabs: expands ancestor tree nodes + switches sidebar to "collections"; environment tabs: switches sidebar to "environments".
3. **Default environment auto-activation**: When a request tab becomes active, resolves the nearest `default_environment_id` (folder chain → collection) and activates it if different from current.
4. **Theme application**: Reads `app.theme` setting (`dark` | `light` | `system`), toggles `light` class on `<html>`. In `system` mode listens to `matchMedia('prefers-color-scheme: dark')` with cleanup.

---

## Design System

### Theme System

Three-way theme: **dark** (default), **light**, **system** (follows OS preference).

- **CSS variable foundation** — `:root` defines ~30 semantic color variables (`--color-method-*`, `--color-success`, `--color-danger`, `--color-status-*`, `--color-var-*`, etc.) with dark-mode defaults. `html.light` overrides all of them for light mode, including flipping the `surface-*` scale and shifting `brand-*` darker.
- **No Tailwind class changes needed** — Tailwind `@theme` tokens (`surface-*`, `brand-*`) are overridden via CSS custom properties under `html.light`. All semantic colors (methods, status, feedback) use CSS variables through inline `style:color` or scoped `<style>` blocks.
- **Setting**: `app.theme` (`'dark' | 'light' | 'system'`), persisted in settings store.
- **Application**: `App.svelte` `$effect` toggles `light` class on `<html>`. System mode uses `matchMedia` listener with cleanup.
- **Main process**: `nativeTheme.themeSource` synced before window creation for correct `backgroundColor` and native dialog matching.
- **CodeMirror**: `Compartment` from `@codemirror/state` swaps `oneDark` ↔ `[]` reactively based on resolved theme.
- **UI**: Appearance section in GeneralTab (Light/Dark/System picker), theme cycle button in Sidebar footer.

### Color Tokens (Tailwind v4 `@theme`)

**Brand** (blue): `brand-50` through `brand-900` (based on blue-50..blue-900)
**Surface** (slate): `surface-50` through `surface-950` (based on slate-50..slate-950)

### HTTP Method Colors (CSS Variables)

All method colors are theme-aware via `--color-method-*` CSS variables. Components use `getMethodColor(method)` from `http-colors.ts` which returns `var(--color-method-*)` strings for inline `style:color`.

| Method | Dark | Light | CSS Variable |
|--------|------|-------|-------------|
| GET | `#4ade80` | `#16a34a` | `--color-method-get` |
| POST | `#22d3ee` | `#0891b2` | `--color-method-post` |
| PUT | `#60a5fa` | `#2563eb` | `--color-method-put` |
| PATCH | `#fb923c` | `#ea580c` | `--color-method-patch` |
| DELETE | `#f87171` | `#dc2626` | `--color-method-delete` |
| HEAD | `#c084fc` | `#9333ea` | `--color-method-head` |
| OPTIONS | `#94a3b8` | `#64748b` | `--color-method-options` |

### Status Code Colors (CSS Variables)
- 2xx: `--color-status-success`
- 3xx: `--color-status-redirect`
- 4xx: `--color-status-client-error`
- 5xx: `--color-status-server-error`

---

## Boot Sequence (`main/index.ts`)

```
1. initEncryption()              — Load/create master key from OS keychain (vxk1: prefix, 0o600 perms)
2. openDatabase(dbPath)          — Open SQLite + run pending migrations
3. migrateToEncryptedStorage()   — One-time: encrypt existing plaintext sensitive data
4. ensureDefaultWorkspace()      — Create "Default Workspace" if table is empty
5. registerAllIpcHandlers()      — Register all domain handlers (incl. workspace-settings, histories, session-log, code-generator, updater)
6. pruneHistories()              — Auto-prune old request histories based on retention setting (default 30 days)
7. buildMenu()                   — Set native application menu (using IPC.MENU_* constants)
8. initUpdater()                 — Configure electron-updater (no-op in dev; macOS: notify only; Win/Linux: auto-download)
9. applyThemeSetting()           — Read app.theme, set nativeTheme.themeSource + resolve backgroundColor
10. createWindow()               — BrowserWindow (sandbox: true, CSP, navigation guards, permission deny-all)
10. runAutoSync()                — On ready-to-show: iterates all workspaces, resolves effective auto_sync setting (workspace → global fallback), runs vault pullAll + git pull per workspace
11. checkForUpdates()            — On ready-to-show: check for available updates
```

---

## Security Hardening

### Electron
- **Sandbox**: `sandbox: true` — preload runs in sandboxed context (only `contextBridge` + `ipcRenderer`)
- **CSP**: `<meta http-equiv="Content-Security-Policy">` — `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `frame-src blob:`
- **Navigation**: `will-navigate` blocked, `setWindowOpenHandler` returns `deny`
- **Permissions**: `setPermissionRequestHandler` denies all (camera, mic, geolocation, etc.)
- **DevTools**: `reload`, `forceReload`, `toggleDevTools` menu items only shown in dev mode
- **macOS entitlements**: only `allow-jit` (removed `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`)
- **Test guard**: `VAXTLY_TEST_USERDATA` env var only honored when `!app.isPackaged`

### IPC Validation
- **Settings**: readonly key denylist (`encryption.*`, `app.version`), sensitive keys (`vault.token`, etc.) filtered from `getAll`
- **Proxy**: URL scheme whitelist (http/https), HTTP method whitelist, timeout clamped 1-300s, response body 50MB limit, form-data file paths checked against dialog-approved set
- **Data import**: replaced arbitrary `data:read-file` with dialog-based `data:pick-and-read`, JSON import size capped at 50MB
- **Vault migrate**: path traversal blocked (`..`, leading `/`)
- **Sync**: conflict resolution value strictly validated
- **Histories**: retention days clamped 1-365

### Encryption
- AES-256-GCM with 12-byte IV and 16-byte auth tag (authenticated encryption)
- Legacy AES-256-CBC data decrypted transparently (backward compat)
- `basic_username` added to encrypted auth fields

### Other
- **HtmlPreview**: blob: URL with empty sandbox (no scripts, no same-origin access)
- **SSL default**: `VERIFY_SSL: true` for new installs; check uses `!== 'false'` (secure by default)
- **Code generator**: `esc()` escapes backslashes and newlines; JS/Node body always string literals (no code interpolation)
- **YAML import**: UUID format validation on all imported entity IDs
- **Script execution**: per-chain stack (no global race condition), no debug log leaking body/headers
- **Error responses**: `error.message` only (no stack traces), session log uses template URL (no resolved secrets)

---

## Build Configuration

- **electron-builder.yml**: configures packaging for macOS (dmg/zip), Windows (nsis), Linux (AppImage/deb/snap)
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



