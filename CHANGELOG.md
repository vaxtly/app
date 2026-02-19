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
