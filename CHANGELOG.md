# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- End-to-end testing with Playwright Electron API (20 tests across 7 spec files)
  - Smoke tests: window boot, sidebar, empty state
  - Keyboard shortcuts: Ctrl+N, Ctrl+W, Ctrl+B, Ctrl+,
  - Collection CRUD: create, rename, add request, delete
  - HTTP requests: GET/POST to local echo server, error handling
  - Settings modal: tab navigation, close via Escape and button
  - Environment variables: create, activate, `{{var}}` substitution in requests
  - Session persistence: tabs survive app restart
- Shared test fixtures: isolated temp userData per worker, local HTTP echo server
- `test:e2e` and `test:e2e:headed` npm scripts
- Shared `formatFetchError` utility with descriptive messages for SSL, DNS, connection, and timeout errors
- Vault `listSecrets` fallback strategy: tries KV v2 LIST, KV v2 GET, KV v1 LIST, KV v1 GET (works with both engine versions)
- Vault `testConnection` now verifies the configured mount exists via `/v1/sys/mounts`
- Vault settings: inline hints for Namespace and Engine Path fields
- Expanded Vault section in user manual with field-by-field configuration guide
- Save button in environment editor with Cmd/Ctrl+S support; auto-pushes to Vault when synced
- Drag-and-drop request moves now auto-sync affected collections when sync is enabled
- Sidebar auto-switches between Collections and Environments based on active tab type

### Changed
- Environment variables no longer auto-save on every keystroke — requires explicit Save
- Default verify SSL setting changed to off for new installs

### Fixed
- Vault "fetch failed" errors now show descriptive messages (SSL errors, DNS failures, connection refused, etc.) instead of generic "fetch failed"
- Vault namespace header (`X-Vault-Namespace`) no longer sent on data operations — only used during AppRole login. Fixes 404 errors when using namespaced Vault engines.
- Vault `testConnection` no longer swallows errors silently
- Vault push variables "object could not be cloned" error caused by Svelte 5 `$state` proxy crossing IPC boundary

## [0.1.0] - 2026-02-19

### Added
- Request builder with all HTTP methods, 7 body types (JSON, XML, form-data, urlencoded, raw, GraphQL), and 4 auth types (Bearer, Basic, API Key, none)
- Environment variables with `{{var}}` substitution and real-time CodeMirror highlighting
- Pre/post-request scripts with dependent request chains
- Request history auto-save with configurable retention
- Code generation for cURL, Python, PHP (Laravel), JavaScript (fetch), Node.js (axios)
- GitHub and GitLab git sync with 3-way merge and conflict resolution
- Sensitive data scanning before push
- HashiCorp Vault KV v2 integration with token and AppRole auth (auto-refresh, namespace support)
- Workspace-scoped sync and vault settings with global fallback
- Data export/import (collections, environments, config)
- Postman import (workspace dump, collection v2.1, environment)
- AES-256-CBC field-level encryption for sensitive data
- Auto-update notifications (macOS: brew upgrade prompt, Windows/Linux: auto-download with quit-and-install)
- Settings modal (General, Data, Remote Sync, Vault)
- Welcome guide, in-app user manual (F1), context menus
- Drag-and-drop sidebar reordering
- Session persistence scoped per workspace
- Cross-platform builds: macOS (dmg/zip + Homebrew), Windows (NSIS), Linux (AppImage/deb)
