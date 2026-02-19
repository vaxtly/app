# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.0.3] - 2026-02-19

### Fixed
- Linux app icon not showing in packaged builds (window icon now resolves from resources path)

## [0.0.2] - 2026-02-19

### Added
- Request builder with all body types (JSON, XML, form-data, urlencoded, raw, GraphQL)
- 4 auth types: Bearer, Basic, API Key, none
- Environment variables with `{{var}}` substitution and CodeMirror highlighting
- Pre/post-request scripts with dependent request chains
- Request history auto-save with configurable retention (default 30 days)
- Code generation for cURL, Python, PHP, JavaScript, Node.js
- GitHub and GitLab git sync with 3-way merge and conflict resolution
- Sensitive data scanning before push
- HashiCorp Vault KV v2 integration with token and AppRole auth
- AppRole token auto-refresh on 403 expiry
- Vault namespace header on all operations (Enterprise/HCP support)
- Workspace-scoped sync and vault settings with global fallback
- Workspace-scoped session persistence
- Data export/import (collections, environments, config)
- Postman import (workspace dump, collection v2.1, environment)
- AES-256-CBC field-level encryption for sensitive data
- Draggable request/response splitter
- Settings modal (General, Data, Remote Sync, Vault)
- Welcome guide, user manual (F1), context menus
- Drag-and-drop sidebar reordering
- Cross-platform icons (macOS, Windows, Linux)
- GitLab pagination for large repositories
- Homebrew cask distribution

### Fixed
- Encryption hardening: master key prefix marker, 0o600 file permissions, double-encryption guard
- Vault namespace sent on all operations, not just auth
- AppRole login validates response before use
- Session scoped per workspace instead of global
- Workspace switch closes tabs before switching context
- YAML parser validates non-null returns
- Folder path cycle detection prevents infinite loops
- Async effect cancellation prevents stale updates
- better-sqlite3 unpacked from asar for native module compatibility
- uuid downgraded to v9 for CJS compatibility with Electron
- macOS notarize script converted to CJS with proper error propagation
