# Vaxtly

A fast, native API client for developers. Built with Electron, TypeScript, and Svelte 5.

## Install

### macOS (Homebrew)

```bash
brew install vaxtly/tap/vaxtly
```

### Windows / Linux

Download the latest release from the [Releases page](https://github.com/vaxtly/app/releases).

| Platform | Format |
|----------|--------|
| Windows | `.exe` installer (NSIS) |
| Linux | `.AppImage`, `.deb` |
| macOS | `.dmg`, `.zip` |

## Features

**Request Builder** — All HTTP methods, 7 body types (JSON, XML, form-data, urlencoded, raw, GraphQL), 4 auth types (Bearer, Basic, API Key, none), query parameter editor, custom headers.

**Environments & Variables** — `{{variable}}` substitution everywhere with real-time CodeMirror highlighting and hover tooltips. Workspace-scoped environments with activation toggle.

**Scripting** — Pre-request and post-response scripts. Chain dependent requests, extract values from responses, set variables automatically.

**Git Sync** — Push/pull collections to GitHub or GitLab. 3-way merge with conflict resolution. Sensitive data scanning before push. Per-collection or bulk sync.

**Vault Integration** — HashiCorp Vault KV v2 and AWS Secrets Manager. Token and AppRole auth with auto-refresh. Namespace support for Enterprise/HCP. Sync environment variables to/from your secrets provider.

**Code Generation** — Generate request snippets in cURL, Python, PHP (Laravel), JavaScript (fetch), and Node.js (axios).

**Import/Export** — Import from Postman (collections, environments, workspace dumps). Export/import Vaxtly data as JSON.

**Auto-Update** — Windows and Linux auto-download updates. macOS notifies with the `brew upgrade` command.

## Development

```bash
npm install
npm run dev          # Hot-reload dev server
npm run build        # Production build
npm run test         # Run tests
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 35 |
| UI | Svelte 5 (runes) |
| CSS | Tailwind CSS 4 |
| Editor | CodeMirror 6 |
| Database | SQLite (better-sqlite3) |
| HTTP | undici |
| Encryption | AES-256-CBC via Electron safeStorage |
| Tests | Vitest |

### Project Structure

```
src/
  shared/     Types and constants shared between main and renderer
  main/       Electron main process (IPC handlers, services, database)
  renderer/   Svelte UI (components, stores, styles)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical reference.

## License

[MIT](LICENSE)
