# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.4] - 2026-02-20

### Added
- Light/Dark/System theme support — three-way toggle persisted in settings, CSS variable foundation with `html.light` overrides, CodeMirror theme swap via Compartment, native dialog matching via `nativeTheme.themeSource`
- Appearance section in Settings > General with Light/Dark/System picker
- Theme cycle button in sidebar footer (moon → sun → monitor)
- Custom method selector dropdown replacing native `<select>` in URL bar — colored LED dots, keyboard navigation, fixed positioning
- Sidebar footer toolbar with mode switching icons, layout toggle, expand/collapse all, and settings shortcut
- Content Security Policy meta tag on renderer HTML
- Electron sandbox, navigation guards, permission request handler (deny all)
- IPC input validation: URL scheme whitelist, HTTP method whitelist, timeout clamped 1–300s, response body 50MB limit, form-data file paths checked against dialog-approved set, import JSON size capped at 50MB
- Settings IPC: readonly key denylist (`encryption.*`, `app.version`), sensitive keys filtered from `getAll` responses
- Vault path traversal protection, sync conflict resolution validation, history retention clamped 1–365
- UUID format validation on all YAML-imported entity IDs
- `basic_username` added to encrypted auth fields

### Changed
- All ~50 hardcoded hex colors replaced with theme-aware CSS variables (`--color-method-*`, `--color-success`, `--color-danger`, etc.)
- POST method color changed from yellow to cyan for better readability in both themes
- Dark mode background darkened for a deeper feel
- Encryption upgraded from AES-256-CBC to AES-256-GCM with authenticated encryption (existing CBC data decrypted transparently)
- SSL verification now defaults to on for new installs
- `data:read-file` IPC replaced with dialog-based `data:pick-and-read` — renderer can no longer specify arbitrary file paths
- HtmlPreview iframe uses blob: URL with empty sandbox instead of `allow-same-origin` + `doc.write()`
- Script execution uses per-chain stack instead of shared global (eliminates race condition)
- Error responses return `error.message` only (no stack traces); session log uses template URL (no resolved secrets)
- Code generator `esc()` now escapes backslashes and newlines; JS/Node body output uses string literals instead of code interpolation

### Fixed
- DevTools, reload, and force-reload menu items no longer available in production builds
- Removed overly broad macOS entitlements (`allow-unsigned-executable-memory`, `allow-dyld-environment-variables`)
- `VAXTLY_TEST_USERDATA` env var only honored in development builds
- Sensitive data scanner crash when headers or variables are non-array
- Git sync not triggered on request save (Ctrl+S) — collection `is_dirty` flag was never set on request mutations
- Auto-sync on startup not running for workspace-scoped settings — now resolves per-workspace with global fallback

## [0.1.3] - 2026-02-19

### Added
- Scoop package manager support for Windows — own bucket repo (`vaxtly/scoop-bucket`), CI auto-updates the manifest on release
- Install source detection (`getInstallSource()`) returning `'brew' | 'scoop' | 'standalone'`
- New IPC channel `update:install-source` exposed as `api.updater.installSource()`
- `update-scoop` CI job in `build.yml` (parallel with `update-homebrew`)

### Changed
- Update banner is now install-source-aware: Scoop installs show `scoop update vaxtly` with copy button, matching the existing Homebrew behavior on macOS
- Auto-download and quit-and-install are disabled for all package-managed installs (Homebrew + Scoop), not just macOS

## [0.1.2] - 2026-02-19

### Added
- 4 new unit test suites: encryption round-trip, fetch-error formatting, session-log ring buffer, proxy helper functions
- 77 new tests across 14 files (212 total, up from 135), covering encryption at rest, all auth/body types, workspace-scoped settings, code generator edge cases, and remote sync provider resolution
- 3 new E2E tests: HTTP 404/500 status codes, custom header verification (23 total, up from 20)

### Changed
- Exported `parseCookies`, `setDefaultHeader`, `deleteHeader` from `ipc/proxy.ts` for testability

### Fixed
- Environment selector not changing active environment — the auto-activate default environment effect was overriding user selections due to a reactive dependency loop

## [0.1.1] - 2026-02-19

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
